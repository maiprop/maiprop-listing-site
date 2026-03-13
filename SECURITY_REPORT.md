# Security Scan Report — maiprop-listing-site

**Date:** 2026-03-18  
**Scope:** Auth, RLS, admin/user rights, edge functions, secrets, client access.

---

## 1. Admin vs user rights (summary)

| Area | Admin / owner | User / public |
|------|----------------|---------------|
| **Routes** | `/admin/pricing` gated by `OWNER_EMAILS` in `AdminPricing.tsx`; Dashboard “Admin” section and Investor dashboard admin panel shown when `profile?.role === "agent"`. | All other app routes; `ProtectedRoute` requires logged-in + onboarding only (no role check). |
| **RLS** | `has_role(auth.uid(), 'agent')` used for: firesale_requests, investor_subscriptions, sync_log SELECT, and (after fix) **pricing_configs** INSERT/UPDATE/DELETE. | Listings: public read for active (or owner_id null); owner-only write. Profiles: own profile read/update (no role self-escalation). |
| **Secrets** | Edge functions use `SUPABASE_SERVICE_ROLE_KEY`; OS/Stripe/LOVABLE keys in env. | Client uses anon/publishable key only. |

- **Owner list:** Hardcoded in frontend: `OWNER_EMAILS = ["kr@maiprop.co", "kr@maiprop.com"]` in `src/pages/AdminPricing.tsx`. Used only for UI visibility of Admin Pricing; backend is now restricted to **agent** role (see RLS fix below).
- **Agent role:** Stored in `public.user_roles`; function `public.has_role(_user_id, _role)` used in RLS. Only users with role `agent` can access admin-only tables and modify pricing_configs.

---

## 2. RLS (Row Level Security)

- **listings:** Public SELECT for active listings (or `owner_id` null); INSERT/UPDATE/DELETE require `auth.uid() = owner_id`. See `20260313120000_fix_listings_rls_and_public_read.sql` and base migration.
- **profiles:** Users can read/update only their own row; UPDATE policy prevents role self-escalation (role cannot be changed via this policy). See `20260311232309_*`.
- **pricing_configs:** SELECT remains public. **INSERT/UPDATE/DELETE restricted to agents only** via migration `20260318120000_fix_pricing_configs_rls_agent_only.sql` (previously any authenticated user could modify — **fixed**).
- **firesale_requests, investor_subscriptions, sync_log:** Agent-only SELECT (and appropriate write where defined); sync_log has a permissive INSERT policy `WITH CHECK (true)` so any authenticated or anon client could insert rows — consider restricting to service-role-only writes if sync_log is only written by edge functions.
- **storage:** Policies follow standard patterns (e.g. authenticated upload to specific buckets); not fully enumerated here.

---

## 3. Edge functions — authentication

| Function | JWT / caller auth | Notes |
|----------|-------------------|--------|
| **customer-portal** | ✅ Validates Bearer JWT via `supabaseClient.auth.getUser(token)` | Correct. |
| **check-subscription** | ✅ Same | Correct. |
| **create-checkout** | ✅ Same | Correct. |
| **receive-from-os** | ✅ Validates `x-os-signature` when `MAIPROP_OS_WEBHOOK_SECRET` is set | Correct for webhook. |
| **property-valuation** | ❌ No JWT check | Callable by anyone with anon key; risk of abuse / cost. |
| **listing-ai-assist** | ❌ No JWT check | Same. |
| **poll-os-auctions** | ❌ No JWT check | Anyone can trigger OS sync; should be agent-only. |
| **full-sync-from-os** | ❌ No JWT check | Same. |
| **pro-ai-tools** | ❌ No JWT check | Same. |
| **os-diagnose** | ❌ No JWT check | Same. |
| **ai-search, ai-service-match, property-chat, smart-filters, neighbourhood-report, property-pois** | ❌ No JWT check | Callable by anyone; consider requiring authenticated user. |
| **sync-to-os, sync-firesale-to-os** | ❌ No JWT check | Should be restricted to authenticated (and ideally agent) where they mutate data. |

**Recommendation:** For any function that mutates data or calls external paid APIs (OS, Stripe, Lovable AI): require `Authorization: Bearer <user JWT>`, validate with `auth.getUser(token)`, and for admin actions (e.g. poll-os-auctions, full-sync-from-os) verify `has_role(uid, 'agent')` (e.g. via a DB check or profile lookup).

---

## 4. Client-side access

- Supabase client uses **anon (publishable) key** only; no service role key in frontend.
- Some pages call edge functions with `Authorization: Bearer ${session?.access_token}` (user JWT) where implemented; others may pass anon key or no token — ensure sensitive functions require and validate user JWT as above.
- **Admin Pricing:** UI hidden unless email in `OWNER_EMAILS`; mutations now enforced by RLS (agent only). Ensure only agents (or owners) are granted the agent role if pricing should stay restricted.

---

## 5. Secrets and environment

- **Service role key:** Used only in edge functions (`Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")`); never in client.
- **Stripe:** `STRIPE_SECRET_KEY` in functions; Stripe publishable key in client where needed.
- **OS:** `MAIPROP_OS_*` credentials and `MAIPROP_OS_WEBHOOK_SECRET` in env; webhook validates signature when secret is set.
- **LOVABLE_API_KEY:** Used in AI-related functions; not exposed to client.
- No hardcoded secrets found in repo; `.env.example` documents expected vars without values.

---

## 6. Other checks

- **SQL injection:** Supabase client and edge functions use parameterized queries / RPC; no raw concatenation of user input into SQL observed.
- **XSS:** React and standard escaping; no `dangerouslySetInnerHTML` with user-controlled input observed.
- **CORS:** Edge functions use permissive `Access-Control-Allow-Origin: *`; acceptable for API if combined with proper auth and no sensitive cookie-based auth.

---

## 7. Fixes applied

1. **pricing_configs RLS**  
   - **File:** `supabase/migrations/20260318120000_fix_pricing_configs_rls_agent_only.sql`  
   - Replaced “authenticated can modify” with “agents can insert/update/delete” using `public.has_role(auth.uid(), 'agent')`.  
   - Run migrations so this is applied in all environments.

---

## 8. Recommended next steps

1. **Edge function auth:** Add JWT validation and, where appropriate, agent checks to: `poll-os-auctions`, `full-sync-from-os`, `property-valuation`, `listing-ai-assist`, `pro-ai-tools`, `os-diagnose`, and any other function that performs admin or paid actions.
2. **sync_log:** If only edge functions (service role) should write to `sync_log`, tighten the INSERT policy (e.g. disallow anon/authenticated inserts, or restrict to a specific role).
3. **Owner-only pricing:** If only specific owner emails should edit pricing (not all agents), introduce an “owner” role or an allowlist table and restrict `pricing_configs` write policies to that.
4. **Audit:** Periodically re-run this checklist and review new edge functions and RLS changes.

---

*Report generated from full security scan of functions, modules, RLS, admin/user rights, and secrets.*
