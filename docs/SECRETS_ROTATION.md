# Secrets Rotation Policy

This is the **operational runbook** for rotating every secret that
maiProp depends on. The inventory below was verified against actual
`Deno.env.get(...)` calls in `supabase/functions/**` and
`import.meta.env.*` reads in `src/**`. If a new secret is introduced,
add a row here in the same PR.

## Inventory & cadence

### Critical (database / payments / auth)

| Secret | Used by | Stored in | Cadence | Owner |
|---|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | All edge fns; CI; sitemap; admin tooling | Supabase dashboard secrets, GH Actions, local `.env` | **90 days** or on compromise | Platform lead |
| `SUPABASE_DB_PASSWORD` | Supabase CLI; psql admin | Supabase dashboard | **90 days** | Platform lead |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Browser bundle (anon key) | Cloudflare Pages env (public) | Only if Supabase project rotated | Platform lead |
| `SUPABASE_ANON_KEY` | Edge fns calling supabase-js with end-user JWT | Supabase fn secrets | Only if Supabase project rotated | Platform lead |
| `STRIPE_SECRET_KEY` (live) | `create-checkout`, `customer-portal`, `check-subscription`, `stripe-webhook`, `sync-stripe-pricing`, `create-stripe-price`, `get-invoices` | Supabase fn secrets | **180 days** or on compromise | Finance lead |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` | Supabase fn secrets | On every webhook endpoint recreate | Platform lead |

### High (cron / inter-service auth)

| Secret | Used by | Stored in | Cadence | Owner |
|---|---|---|---|---|
| `CRON_SECRET` | `send-saved-search-alerts` (cron auth, `verify_jwt=false`) | Supabase fn secrets, pg_cron config | **180 days** — must be ≥ 32 random chars | Platform lead |
| `MAIPROP_OS_WEBHOOK_SECRET` | `receive-from-os` (signature verification) | Supabase fn secrets, OS config | **180 days** | Platform lead |
| `MAIPROP_OS_API_URL` / `MAIPROP_OS_URL` / `MAIPROP_OS_EMAIL` / `MAIPROP_OS_PASSWORD` | `property-valuation`, `sync-to-os`, `sync-firesale-to-os`, `poll-os-auctions`, `fetch-*-from-os`, `full-sync-from-os`, `os-diagnose` | Supabase fn secrets | **90 days** | Platform lead |

### Medium (third-party APIs)

| Secret | Used by | Stored in | Cadence | Owner |
|---|---|---|---|---|
| `OPENAI_API_KEY` | `_shared/openai.ts` (all AI endpoints), `property-pois`, `property-chat`, `property-valuation`, `pro-ai-tools`, `ai-translate`, `ai-search`, `ai-service-match`, `listing-ai-assist`, `smart-filters`, `neighbourhood-report` | Supabase fn secrets | **90 days** | AI lead |
| `BREVO_API_KEY` | `_shared/brevo.ts` (all transactional email), `process-email-queue`, `oh-registration-notify`, `invitation-notify`, `auth-email-hook`, `send-saved-search-alerts` | Supabase fn secrets | **90 days** | Platform lead |
| `BREVO_FROM_EMAIL` / `BREVO_FROM_NAME` | Same as above | Supabase fn secrets | Only on rebrand | Platform lead |
| `GOOGLE_MAPS_API_KEY` | `streetview-proxy` | Supabase fn secrets | **365 days** | Platform lead |
| `GOOGLE_MAPS_REFERER` | Optional `streetview-proxy` HTTP referrer override for Google Maps API key restrictions | Supabase fn secrets | Only when the Google Maps key referrer policy changes | Platform lead |
| `VITE_MAPBOX_TOKEN` | Browser bundle (map components) | Cloudflare Pages env | **365 days** | Platform lead |

### CI / test

| Secret | Used by | Stored in | Cadence | Owner |
|---|---|---|---|---|
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI workflow | GH repo secrets | **365 days** | CI owner |
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | Playwright e2e | GH repo secrets | On demo-account password change | CI owner |
| `CLOUDFLARE_API_TOKEN` | GitHub Actions Cloudflare Pages deploys, env sync, rollback | GH repo secrets | **90 days** or on compromise | Platform lead |
| `VITE_STRIPE_PRICE_*` (8 IDs) | `rolePlanMap.ts` fallbacks | Cloudflare Pages env | Only if Stripe products replaced | Finance lead |

---

## Rotation log

Record each rotation here. Entries are append-only.

| Date (UTC) | Secret | Rotated by | Reason |
|---|---|---|---|
| 2026-04-26 | (none — runbook revision) | Platform lead | Inventory + zero-downtime procedures expanded; no key actually rotated |

---

## Procedures

### Generic procedure (any secret)

1. **Generate** the new value in the upstream provider.
2. **Set** the new value in every consumer location (see the *Used by* /
   *Stored in* columns above).
3. **Redeploy** the affected surface (`supabase functions deploy <name>`,
   Cloudflare Pages deploy, etc.) so the new env is loaded.
4. **Verify** with a smoke test (see *Verification* below).
5. **Revoke** the old value upstream.
6. **Append** a row to the rotation log above in the same commit as any
   config change.

### Cloudflare Pages deploy token

Use this for `CLOUDFLARE_API_TOKEN`, especially after any chat, log, or
terminal exposure.

1. Create a new Cloudflare API token from the dashboard using the **Edit
   Cloudflare Pages** template, scoped to the correct account and Pages
   project.
2. Update the GitHub repository secret `CLOUDFLARE_API_TOKEN`.
3. Run a same-repo PR preview deploy or production workflow dispatch to
   prove the token can deploy and sync Pages runtime variables.
4. Revoke the exposed token in Cloudflare immediately after the new token is
   verified.
5. Review Cloudflare Audit Logs for the exposure window.
6. Run:
   ```powershell
   npm run check:production-deploy -- https://portal.maiprop.co --public-api
   ```
7. Append the completed rotation to the log above.

### Zero-downtime: `SUPABASE_SERVICE_ROLE_KEY`

Supabase only allows one active service-role key per project, so true
zero-downtime is not possible — but the window can be minimised:

```powershell
# 1. In Supabase dashboard → Settings → API → click "Generate new" next
#    to service_role. Copy the new key but DO NOT save the regen yet.
#    (The dashboard lets you preview before committing.)

# 2. Push the new key to every consumer FIRST:
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<new-key>

# 3. In Cloudflare Pages, update the env var via the dashboard:
#    Settings → Environment variables → Edit → update SUPABASE_SERVICE_ROLE_KEY

# 4. Redeploy edge functions in one batch so they all pick up the new
#    key in the same window:
supabase functions deploy --project-ref <ref>

# 5. Trigger a Cloudflare Pages rebuild so build-time tooling picks it up.

# 6. Now click "Confirm" in the Supabase dashboard to actually revoke
#    the old key. Window of mismatch ≈ 10–60 seconds.

# 7. Smoke test: any signed-in flow that hits an edge function (e.g.
#    /pricing → click upgrade → Stripe checkout opens). If this fails,
#    re-run step 4.
```

### Zero-downtime: `STRIPE_SECRET_KEY`

Stripe supports overlapping live keys via "rolling":

```powershell
# 1. Stripe dashboard → Developers → API keys → click "Roll key" on the
#    live secret key. Choose an expiry window (1–24h recommended).
#    The OLD key remains valid until the window expires.

# 2. Update the new key everywhere it's referenced:
supabase secrets set STRIPE_SECRET_KEY=<new-key>
supabase functions deploy create-checkout customer-portal check-subscription stripe-webhook sync-stripe-pricing create-stripe-price get-invoices

# 3. Verify with a low-risk Stripe call, e.g.:
curl https://<project>.supabase.co/functions/v1/check-subscription `
  -H "Authorization: Bearer <test-jwt>"
# Expect 200 with subscription data.

# 4. Wait until the rolling window expires, then confirm the old key is
#    revoked: any call with the old key returns 401.
```

### `STRIPE_WEBHOOK_SECRET`

Webhook secrets are tied 1:1 to a webhook endpoint. To rotate:

```powershell
# 1. Stripe dashboard → Developers → Webhooks → endpoint → "Roll secret".
#    The OLD secret remains valid for 24h.

# 2. Update the secret:
supabase secrets set STRIPE_WEBHOOK_SECRET=<new-secret>
supabase functions deploy stripe-webhook

# 3. Send a test event from Stripe dashboard → endpoint → "Send test
#    webhook". Confirm it returns 200 in the function logs.
```

### `CRON_SECRET`

```powershell
# 1. Generate a new secret:
$new = -join ((48..57) + (97..122) | Get-Random -Count 48 | % { [char]$_ })

# 2. Update the function secret AND the pg_cron job header:
supabase secrets set CRON_SECRET=$new
supabase functions deploy send-saved-search-alerts

# 3. In SQL editor, re-create the cron job header:
#    UPDATE cron.job SET command = REGEXP_REPLACE(command,
#      'Bearer [a-z0-9]+', 'Bearer ' || $new) WHERE jobname = 'saved-search-alerts';
#    (Or just DROP / re-CREATE the cron job — see
#     supabase/migrations/20260530000000_cron_saved_search_alerts.sql.)
```

### `MAIPROP_OS_WEBHOOK_SECRET` / `MAIPROP_OS_PASSWORD`

Coordinate with the OS team — both ends must update in lockstep. Run
this in a maintenance window or at low-traffic hour.

### OpenAI / Brevo / Google Maps keys

```powershell
# These providers don't support overlapping keys, so do this in a low-
# traffic window. The functions fail open for OpenAI (return cached or
# graceful errors) so user impact is degradation, not outage.

supabase secrets set OPENAI_API_KEY=<new>
supabase secrets set BREVO_API_KEY=<new>
supabase functions deploy
# Then revoke the old key in the provider dashboard.
```

---

## Verification

After any rotation, run these smoke tests in this order:

```powershell
# 1. Health: function reachability (no auth required)
curl -i https://<project>.supabase.co/functions/v1/sitemap
# Expect 200 + XML.

# 2. Service-role-backed call:
curl -X POST https://<project>.supabase.co/functions/v1/check-subscription `
  -H "Authorization: Bearer <real-user-jwt>" `
  -H "Content-Type: application/json"
# Expect 200 with `subscribed` field.

# 3. Stripe-backed call: open the live app, log in, click upgrade. Stripe
#    checkout should open with a session URL.

# 4. AI call: log in as a Pro user, request an AI valuation. Expect the
#    valuation JSON to come back.

# 5. Cron call: trigger send-saved-search-alerts manually with the new
#    CRON_SECRET. Expect 200 + summary in logs.
```

## Incident response (suspected leak)

1. **Roll immediately** — don't wait for the regular cadence. The
   procedures above are the same in incident mode.
2. **Repo history scan**:
   ```powershell
   trufflehog git file://. --since-commit <N-months-ago>
   ```
3. **Public surface scan** — search GitHub for the leaked key prefix;
   search Pastebin/sourcegraph if accessible.
4. **History rewrite** if the secret was committed: BFG or
   `git filter-repo`, then force-push and tell every collaborator to
   re-clone.
5. **Audit upstream logs** for unauthorised calls during the exposure
   window:
   - Stripe → Dashboard → Developers → Logs (filter by API key, time)
   - Supabase → Logs Explorer → query
     `request.headers.authorization` matches the leaked key prefix
   - OpenAI → platform.openai.com → Usage → API key activity
6. **File an incident record** under
   `docs/incidents/YYYY-MM-DD-<slug>.md` with: timeline, suspected
   exposure window, scope of compromise, remediation, and lessons.

## Automated scanning

- **GitHub Secret scanning + Push protection** — Settings → Code
  security. Should be ON. Verifies on every push.
- **Dependabot** — already enabled (`.github/dependabot.yml`).
- **CI guard** — `scripts/_prod-guard.ts` blocks builds that import
  service-role-shaped strings into the browser bundle.

## Quarterly review

On the first Monday of each quarter, the Platform lead must:

1. Read this doc top-to-bottom.
2. Run `trufflehog git file://. --since-commit HEAD~500` for sanity.
3. Spot-check that one of the high-cadence secrets is in fact within
   its window (use the rotation log dates).
4. If any consumer is missing from the *Used by* column above, add it.
5. Append a "review" row to the rotation log even if no secret was
   rotated, so the cadence is auditable.
