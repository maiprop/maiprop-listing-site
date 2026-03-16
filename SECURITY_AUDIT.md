# Security Audit — MaiProp Real Estate Platform

**Date:** March 2026  
**Scope:** Full-stack application (React, Supabase, Edge Functions)

---

## Executive Summary

The application has a solid authentication and authorization foundation. Critical issues center on **hardcoded secrets**, **optional webhook validation**, **unauthenticated AI/costly endpoints**, and a **create-checkout fallback** to the anon key. Medium issues include permissive sync_log policy and missing role-based route guards.

---

## 1. Authentication & Authorization

### Strengths

| Area | Status | Notes |
|------|--------|-------|
| Auth provider | ✅ | Supabase Auth with JWT, localStorage, auto-refresh |
| AuthContext | ✅ | Single source of truth; 8s loading timeout |
| ProtectedRoute | ✅ | Requires user + completed onboarding |
| AdminRoute | ✅ | Checks `role='admin'` via `isPlatformAdmin()` |
| Profile RLS | ✅ | Full profiles restricted to own row or platform admin |
| Investor subscriptions | ✅ | Platform admin only for INSERT/UPDATE; no self-grant |
| Role escalation | ✅ | `profiles_guard_admin_and_role` prevents non-admin from setting `role='admin'` |

### Admin Checks Consistency

- **AuthUtils:** `profile.role === "admin"` or `is_platform_admin`
- **Edge functions:** `profile?.role === "admin"` (unified after 20260413120000)
- **DB:** `has_platform_admin()` checks `role='admin'`

---

## 2. Route Protection

| Route | Protection | Issue |
|-------|------------|-------|
| `/admin`, `/admin/pricing` | AdminRoute | ✅ Admin only |
| `/dashboard`, `/listings/new`, `/investor-dashboard`, etc. | ProtectedRoute | ⚠️ Any logged-in user; no role check |
| `/property/:id`, `/auctions`, `/firesale` | Public | ✅ OK for listing browse |
| `/professionals/me` | ProtectedRoute | ✅ OK |

**Recommendation:** Add role-based guards (e.g. `SellerRoute` for `/listings/new`, `InvestorRoute` for `/investor-dashboard`) so non-eligible users are redirected. Currently UX handles this with empty states and messages, but server-side enforcement is weaker.

---

## 3. Supabase Client & Keys

| Usage | Key | Status |
|-------|-----|--------|
| Frontend (src/) | `SUPABASE_ANON_KEY` | ✅ Correct |
| Edge functions | `SUPABASE_SERVICE_ROLE_KEY` | ✅ Correct |
| create-checkout fallback | `SUPABASE_ANON_KEY` if service role missing | 🔴 Critical |

**create-checkout (line 34–36):**
```ts
Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? ""
```
If `SUPABASE_SERVICE_ROLE_KEY` is unset, checkout runs with anon key—weakening privilege checks.

---

## 4. Secrets in Client Code

**File:** `src/lib/config.ts`

| Secret | Fallback | Risk |
|--------|----------|------|
| SUPABASE_URL | Hardcoded prod URL | Medium — URL is public anyway |
| SUPABASE_ANON_KEY | Hardcoded JWT | High — any client can obtain; abuse of quotas/RLS |
| MAPBOX_TOKEN | Hardcoded | Medium — token abuse from other origins |
| GOOGLE_MAPS_API_KEY | Empty string | ✅ No fallback; Street View uses proxy |

**Recommendation:** Use only env vars (`VITE_*`) with no fallbacks in production. Fail fast if required vars are missing.

---

## 5. Edge Functions — Auth Overview

| Function | Auth | Notes |
|----------|------|-------|
| create-checkout, customer-portal, check-subscription | JWT required | ✅ |
| sync-to-os, sync-firesale-to-os, full-sync-from-os, poll-os-auctions, os-diagnose | JWT + role=admin | ✅ |
| listing-ai-assist | JWT required | ✅ |
| fetch-report-from-os | JWT required | ✅ |
| receive-from-os | Webhook signature (optional) | 🔴 |
| property-valuation, property-pois, neighbourhood-report, ai-search, smart-filters | No auth check | 🔴 |
| streetview-proxy | No auth | ⚠️ Medium |

### receive-from-os Webhook

```ts
const WEBHOOK_SECRET = Deno.env.get("MAIPROP_OS_WEBHOOK_SECRET");
if (WEBHOOK_SECRET) {
  // validate x-os-signature
} else {
  // processes anyway!
}
```

If `MAIPROP_OS_WEBHOOK_SECRET` is unset, **any POST is accepted**. Attacker can inject fake listings, leads, or profiles.

### Unauthenticated AI Endpoints

- `property-valuation` — AI valuation, costly
- `property-pois` — POI lookup
- `neighbourhood-report` — Area report
- `ai-search` — Search AI
- `smart-filters` — Filter suggestions

All invoked via `supabase.functions.invoke()` with anon key. No rate limiting. **Abuse risk:** cost spike, quota exhaustion.

---

## 6. RLS Policies

### sync_log

**Current policy (20260321120000):**
```sql
CREATE POLICY "Allow sync log inserts"
  ON public.sync_log FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));
```

Any anon or authenticated client can insert. Earlier migration (20260319120000) removed this for service-role-only; 20260321120000 re-added it for edge functions that use anon/authenticated. **Effect:** Audit log integrity reduced; possible log pollution.

### firesale_requests INSERT

```sql
WITH CHECK (auth.role() IN ('anon', 'authenticated'));
```

Intentional—sellers submit Quick Sale requests while unauthenticated or before full onboarding. ✅ Acceptable.

### listing_images

```sql
USING (true)
```

All listing images readable. If drafts link to this table, their images could be exposed. ⚠️ Verify draft listings don’t expose sensitive images.

---

## 7. Input Validation & Injection

| Vector | Status | Notes |
|--------|--------|-------|
| SQL injection | ✅ | Parameterized queries via Supabase client |
| XSS | ✅ | No `dangerouslySetInnerHTML` with user input |
| eval/unsafe patterns | ✅ | None found |

---

## 8. Storage & PII

- **profiles_public view:** Exposes `user_id, display_name, avatar_url, first_name, last_name, role`; phone excluded ✅
- **Storage buckets:** RLS on `storage.objects`; `project-media`, `firesale-photos`, etc. have policies
- **PII in edge functions:** OS sync functions use service role; no raw PII logged to client

---

## 9. CORS & Headers

- Edge functions use `Access-Control-Allow-Origin: *`
- Acceptable if auth and quotas are strong; increases abuse surface for open endpoints

---

## 10. Findings Summary

### Critical

1. **receive-from-os:** Require `MAIPROP_OS_WEBHOOK_SECRET`; reject if unset
2. **create-checkout:** Remove `SUPABASE_ANON_KEY` fallback; fail if service role missing
3. **Hardcoded secrets:** Remove fallbacks for `SUPABASE_ANON_KEY` and `MAPBOX_TOKEN` in production

### High

4. **AI endpoints:** Add JWT validation and/or rate limiting for `property-valuation`, `property-pois`, `neighbourhood-report`, `ai-search`, `smart-filters`

### Medium

5. **sync_log:** Restrict INSERT to service role or authenticated callers with a narrow policy
6. **streetview-proxy:** Add rate limiting; consider JWT for non-public use
7. **Role-based routes:** Add guards for `/listings/new`, `/investor-dashboard`, etc.

### Low

8. **listing_images:** Confirm draft/inactive images are not exposed
9. **CORS:** Consider restricting to app origins for sensitive functions

---

## 11. Remediation Checklist

- [x] Set `MAIPROP_OS_WEBHOOK_SECRET` in Supabase secrets; reject when unset (receive-from-os returns 503 if unset)
- [x] Remove anon-key fallback from create-checkout (fails 503 if service role missing)
- [x] Use env vars only for Supabase URL/key and Mapbox; fail if missing in prod (config.ts throws in production)
- [x] Add auth or rate limits to AI/costly edge functions (JWT required for property-valuation, pois, neighbourhood-report, ai-search, smart-filters)
- [x] Revisit sync_log INSERT policy (20260414130000: service role only)
- [x] Add role-based route guards (SellerRoute for /listings/new, InvestorRoute for /investor-dashboard)
- [x] Add rate limiting to streetview-proxy (60 req/min per IP)
- [ ] Restrict Google Maps API key in GCP Console (referrers, APIs) — manual step
- [ ] Enable “Check for compromised passwords” in Supabase Auth (if available)
- [ ] Audit new edge functions for auth before deploy
