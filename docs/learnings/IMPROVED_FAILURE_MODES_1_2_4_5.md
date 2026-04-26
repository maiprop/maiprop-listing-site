# Improved Common Failure Modes — Items 1, 2, 4, 5

**Purpose:** Enhanced, actionable versions of failure modes for CursorKickoff Learned V2 Section J.  
**Source:** Terminal logs, CriticalBugs.md, real production issues.  
**Use:** Replace or merge into `CursorKickoff_V2.1.1_Learned_V2.txt` Section J.

---

## 1. Module-scope env var reads crash Vercel build

**Symptom:** `next build` fails on Vercel with `undefined` or "Cannot read property of undefined" during static optimization. Works locally.

**Root cause:** Next.js runs module code at build time. `process.env.X` at top level is empty on Vercel (env vars are runtime-only). Any lib that imports a module with `const x = process.env.API_KEY` will crash when that module is loaded.

**Fix:**
- Never read `process.env` at module scope in any file that can be imported by a route or page.
- Use lazy getters: `function getEnv() { return process.env.X }` called inside the handler.
- Use `validateEnv()` at the start of each route handler, not at import.
- For clients (DB, Redis, LLM): lazy singleton `let _client; function getClient() { if (!_client) _client = createClient(); return _client }`.

**Verification:** Run `npm run build` locally with empty env (or `NODE_ENV=production`). If it passes with full env but fails in Vercel, it's this. Add `export const dynamic = 'force-dynamic'` to every API route.

**Example:**
```javascript
// BAD
const apiKey = process.env.API_KEY;
export async function handler() { return fetch(apiKey); }

// GOOD
export async function handler() {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error('API_KEY missing');
  return fetch(apiKey);
}
```

---

## 2. Fire-and-forget IIFE killed after response

**Symptom:** Audit submitted, 200 returned, but DB never updated to `status=complete`. Logs show `runAudit` started then nothing. `completed_at` stays `null`.

**Root cause:** Vercel terminates the process shortly after the HTTP response is sent. An IIFE `(async () => { await runAudit(); })()` runs in the background but the process exits before it finishes.

**Fix:**
- Use `waitUntil()` from `@vercel/functions` for any async work that must continue after the response.
- Wrap all post-response work: `waitUntil((async () => { await runAudit(...) })())`.
- Never rely on "fire and forget" without `waitUntil`.

**Verification:** Submit an audit, check DB after 2 minutes. If `status` is still `processing` and `completed_at` is null, the runAudit path was killed. Add `waitUntil` around the runAudit call and redeploy.

**Example:**
```javascript
// BAD
res.status(200).json({ token });
(async () => {
  await runAudit(auId);
})();

// GOOD
import { waitUntil } from '@vercel/functions';
res.status(200).json({ token });
waitUntil((async () => {
  await runAudit(auId);
})());
```

---

## 4. Read-replica lag: stream says complete, fetch says processing

**Symptom:** SSE stream sends `{ type: 'complete', fullResult }` and client should show results. Instead, client does a follow-up `GET /api/results` and gets `db_status=processing`, `completed_at=null`. User sees "processing" or spinner forever.

**Root cause:** Main DB is updated to `status=complete`; stream reads from primary. Client's `GET /api/results` may hit a read replica that hasn't replicated yet. Or client ignores `fullResult` and re-fetches.

**Fix:**
- Embed the full result payload in the SSE `complete` event: `{ type: 'complete', token, fullResult }`.
- Client MUST use `fullResult` when present. Never do a separate fetch for final data after receiving `complete`—the fetch can return stale `processing`.
- Use shared `buildCompleteResultPayload(audit, reauditData)` so stream and results API return identical shapes.

**Verification:** Add logging: `[results] RETURN ... db_status=... completed_at=...`. If stream logs `complete` but results API logs `processing` for the same token within 2s, it's replica lag. Fix: embed fullResult and stop re-fetching on complete.

**Example:**
```javascript
// Stream route - BAD: client must fetch
send({ type: 'complete', token });
// Client: const data = await fetch(`/api/results?token=${token}`)  // May return processing!

// Stream route - GOOD
const fullResult = buildCompleteResultPayload(audit, reauditData);
send({ type: 'complete', token, fullResult });
// Client: if (data.fullResult) setResult(data.fullResult); else fetch(...)
```

---

## 5. React StrictMode: parallel poll loops at 200ms

**Symptom:** `GET /api/results` and `GET /api/audit/stream` fire every ~200ms instead of the intended 1000ms. Many duplicate requests. Terminal floods with `[results] REQUEST` and `GET /api/audit/stream`.

**Root cause:** React 18 StrictMode mounts, unmounts, then remounts components in dev. The `useEffect` that runs the poll runs twice. Cleanup sets `cancelled = true`, but if the second mount happens before the first cleanup, you get two parallel intervals. Each interval's `setTimeout(poll, 1000)` runs; if `cancelled` isn't checked after `await`, the next tick can spawn another loop.

**Fix:**
- In every `useEffect` with a polling loop: (1) `let cancelled = false`, (2) return `() => { cancelled = true }`, (3) after every `await`, `if (cancelled) return`, (4) wrap every `setTimeout(poll, ms)` in `if (!cancelled) setTimeout(...)`.
- Use a ref for the interval/timeout ID and clear it in cleanup.

**Verification:** Open results page in dev, watch Network tab. If you see bursts of `/api/results` or `/api/audit/stream` every ~200ms, you have parallel loops. Add the `cancelled` checks.

**Example:**
```javascript
// BAD
useEffect(() => {
  const tick = async () => {
    const res = await fetch(`/api/results?token=${token}`);
    const data = await res.json();
    if (data.status !== 'complete') setTimeout(tick, 1000);
  };
  tick();
}, [token]);

// GOOD
useEffect(() => {
  let cancelled = false;
  const tick = async () => {
    if (cancelled) return;
    const res = await fetch(`/api/results?token=${token}`);
    if (cancelled) return;
    const data = await res.json();
    if (data.status !== 'complete' && !cancelled) {
      setTimeout(tick, 1000);
    }
  };
  tick();
  return () => { cancelled = true; };
}, [token]);
```

---

## Admin not reflecting Re-audit / Waitlist (bonus)

**Symptom:** User submits re-audit or waitlist, gets success, but admin dashboard doesn't show the new row after refresh.

**Possible causes:**
1. **Resend test mode:** Resend 403 = "You can only send testing emails to your own email address". The API returns 200 because the DB insert succeeds; only the email fails. Admin data should still be present. Verify: check Supabase `reaudit_subscriptions` and waitlist table for the new row.
2. **Polling/caching:** Admin fetches with `?_=timestamp`. A hard refresh (Ctrl+Shift+R) should bust cache. If using SWR/React Query, check `staleTime` and `refetchInterval`.
3. **Audit stuck in processing:** If the audit never reached `status=complete`, some admin views may filter out in-progress items or show them differently. Check `audits` table: `status` and `completed_at` for the token.

**Fix for Resend:** Verify a domain at resend.com/domains for production, or use the verified email (hubloteam@gmail.com) in test mode.

---

## Higher-impact improvements for later

Prioritised by impact vs effort. Tackle when bandwidth allows.

| # | Area | Improvement | Impact | Effort |
|---|------|--------------|--------|--------|
| 1 | **Edge function auth** | Add JWT validation + agent check to `property-valuation`, `listing-ai-assist`, `pro-ai-tools`, `ai-search`, `ai-service-match`, `neighbourhood-report`, `smart-filters`, `property-chat`, `poll-os-auctions`, `full-sync-from-os`, `os-diagnose` | High — prevents abuse, cost, data leaks | Medium |
| 2 | **Owner vs agent RBAC** | Introduce `owner` role or allowlist table; restrict `pricing_configs` and Admin Pricing to owners only (not all agents) | Medium — tighter admin control | Low |
| 3 | **Route-level subscription gate** | `ProtectedRoute` or a wrapper checks subscription for deal flow, AI tools, etc.; redirect to pricing instead of in-page gate | Medium — better UX, fewer dead ends | Low |
| 4 | **Bio vs role consistency** | Standardise on `role` for participant type; migrate `bio` `__type:…` to `role` and deprecate dual logic | Medium — fewer edge cases, cleaner code | Medium |
| 5 | **Hero video performance** | Preload hero video in `index.html`; use deferred `src`; re-encode with faststart + lower bitrate (720p, 1–2 Mbps) | Medium — faster LCP, better mobile | Low |
| 6 | **Admin dashboard reliability** | Verify reaudit/waitlist tables and admin API handlers; fix any caching or polling that hides new rows; ensure `fullResult` in SSE removes need for extra fetch | High — users trust the admin view | Medium |
| 7 | **Resend domain verification** | Verify domain at resend.com so production emails reach any address (not only whitelisted in test mode) | High — waitlist/reaudit emails work | Low |
| 8 | **sync_log write policy** | Already restricted to service_role; ensure no client path can insert. Audit any new code that writes to `sync_log` | Low — defence in depth | Low |
| 9 | **Leaked password protection** | Supabase Dashboard → Auth → enable “Check for compromised passwords” | Medium — stronger signup security | Trivial |

*Source: `docs/archive/SECURITY_REPORT.md`, `docs/archive/UX_AUDIT_REPORT.md`, `docs/archive/SECURE_ALL_DATA.md`, `docs/OS_INTEGRATION.md`, terminal logs.*

---

*Merge these into your CursorKickoff Learned V2 Section J as the new entries for 1, 2, 4, 5.*
