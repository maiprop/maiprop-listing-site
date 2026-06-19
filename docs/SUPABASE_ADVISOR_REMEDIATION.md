# Supabase Advisor Remediation Plan

**Status as of 2026-06-19:** the live Security Advisor for project
`qvvicunqcrwpioqnvzxf` reports one remaining warning:
`auth_leaked_password_protection`. RLS and SECURITY DEFINER remediation work is
tracked in `docs/STRICT_RELEASE_ACTIONS.md`; this document is the due-diligence
summary for what remains actionable.

This document explains what was fixed, what is intentionally not fixed, and what
needs explicit human/product decisions before fixing.

---

## Already addressed

### Migration 20260630000000 — `advisor_safe_wins.sql`

Two findings are resolved by this migration:

| Advisor | Resource | Fix |
|---|---|---|
| `function_search_path_mutable` | `public.get_listing_limit(text, boolean)` | `ALTER FUNCTION ... SET search_path = public, pg_temp` |
| `rls_enabled_no_policy` | `public.rate_limit_counters` | Add explicit `RESTRICTIVE FOR ALL TO public USING (false) WITH CHECK (false)` policy |

These were chosen because both are zero-risk: the first is a no-op behaviourally (the function still returns the same value), the second adds an explicit deny that mirrors the lockdown intent of migration `20260623120000` (which revoked all anon/authenticated grants).

---

## Current security advisor blocker

### `auth_leaked_password_protection`

The remaining live Security Advisor warning is a Supabase Auth platform setting,
not a migration. Supabase's documentation says leaked-password protection uses
HaveIBeenPwned and is available on the Pro plan and above:
<https://supabase.com/docs/guides/auth/password-security>.

Enable it in:

**Dashboard -> Authentication -> Providers -> Email -> Password protection ->
"Check passwords against the HaveIBeenPwned database"**.

Current compensating controls:

- `src/lib/passwordPolicy.ts` rejects common compromised/demo passwords during
  signup and password reset before calling Supabase Auth.
- `src/test/passwordPolicy.test.ts` covers the compromised-password rejection and
  visible requirement checklist.
- `docs/STRICT_RELEASE_ACTIONS.md` records the accepted risk and plan-blocked
  status.

This is not fully equivalent to Supabase HIBP protection because the local
denylist cannot cover the full breach corpus. Treat the advisor warning as
accepted only while the project remains on a plan where HIBP is unavailable or
while business risk does not justify the upgrade.

## Historical decisions retained for context

### A. 112 `*_security_definer_function_executable` warnings (56 functions × 2 roles)

**The advisor finds 56 `SECURITY DEFINER` functions executable to both `anon` and `authenticated`.** Each function appears twice (once per role) for a total of 112 warnings.

**Why this is a warning, not a bug:** A SECURITY DEFINER function runs with the privileges of its owner (typically `postgres`), so granting EXECUTE to `anon` lets unauthenticated users invoke a function that may read data they couldn't read directly. This is *correct* for some use cases (e.g. `is_pro(uuid)`, `check_and_increment_rate_limit`) and *incorrect* for others.

**What we need from the product owner:**

A pass through `supabase/functions` and `src/hooks/*` answering, for each of the 56 functions:

1. Is this function called from the **client** (browser) via `supabase.rpc(...)`?
2. If yes, does it require an authenticated session?
3. If no (only invoked from edge functions or other DB code), revoke EXECUTE from `anon` and `authenticated` and grant only to `service_role`.

The migration that follows from this audit will be a single `REVOKE EXECUTE ... FROM anon, authenticated` per function. **Do not bulk-revoke** without the audit — it will break working RPC calls.

A practical first step: query `select function_name from advisor_findings where name = 'anon_security_definer_function_executable'` and grep `src/` for each. Anything not referenced is a strong candidate for revocation.

### B. 4 `public_bucket_allows_listing` warnings

Buckets affected: `email-assets`, `firesale-photos`, `project-media`, `property-images`.

The warning fires when a bucket has both `public = true` *and* a `select` policy that lets unauthenticated callers list objects in the bucket. Listing object keys can leak filenames that the application treats as "unguessable URLs" (e.g. `<uuid>.jpg`).

**Decision needed:** is bucket listing actually required for the public site, or are listings rendered via known per-record image URLs?

If listings are rendered via known URLs only:
```sql
-- Replace the public LIST policy with one that only allows objects whose
-- key path matches a real record.
DROP POLICY IF EXISTS "Public can list" ON storage.objects;
CREATE POLICY "Authenticated owners can list their own folder"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('property-images', 'project-media', 'firesale-photos')
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
```
Public viewing of a *specific* known URL is unaffected (that uses `getPublicUrl`, which does not LIST).

### C. `rls_policy_always_true` on `contact_submissions` INSERT

The current policy is `WITH CHECK (true)` — anyone, anon or authenticated, can insert a contact submission. That is intentional for an unauthenticated contact form, but the advisor (correctly) flags it as a footgun: a bot can spam the table.

**Decision needed:** which abuse control should sit at the policy level?

Options:
1. Verify a Cloudflare Turnstile token in a `BEFORE INSERT` trigger and set `WITH CHECK (current_setting('request.headers')::json ->> 'cf-turnstile-token' IS NOT NULL)` (then validate the token in an edge function before the row commits — this requires a coordinated edge-function change).
2. Rate-limit submissions per IP via the existing `rate_limit_counters` infrastructure inside an edge function and have *only* that edge function (service-role) insert into the table. Then the policy can be `WITH CHECK (false)` for all clients.
3. Leave as-is and rely on Turnstile + edge-function rate limiting outside the policy. Document the choice and silence the advisor with a `COMMENT ON POLICY`.

Option 2 is cleanest but is a multi-PR change.

### D. `extension_in_public` — `pg_net`

`pg_net` is currently installed in the `public` schema. Best practice is to install extensions in their own schema (`extensions`) so user code in `public` does not accidentally shadow extension functions.

**Risk:** every caller that currently invokes `pg_net.http_get(...)` etc. needs to either reference the new schema (`extensions.http_get`) or the search_path needs to include both.

```sql
-- Conceptually:
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_net SET SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated;
```

Before doing this, audit `supabase/functions` and `supabase/migrations` for `pg_net.` and `net.` references. Only proceed once every caller is verified.

### E. `auth_leaked_password_protection`

Superseded by the current status section above. This remains the only live
Security Advisor warning as of 2026-06-19 and is plan/dashboard-controlled.

---

## Performance warnings (354) — not in scope

These are addressed in a separate effort:

- **230 `multiple_permissive_policies`** — Postgres evaluates every permissive policy. Consolidating policies per role/operation reduces planning cost. Mostly cosmetic; address one table at a time as you touch it.
- **66 `unused_index`** — Not all of these are truly unused (advisor only sees `pg_stat_user_indexes` since the last reset). Verify with `pg_stat_user_indexes` over a longer window before dropping any.
- **34 `auth_rls_initplan`** — `auth.uid()` etc. in policies should be wrapped as `(select auth.uid())` so Postgres caches the value per query rather than evaluating it per row. Worth a sweep when touching RLS.
- **23 `unindexed_foreign_keys`** — Add B-tree indexes on FK columns. Each is a one-line migration.
- **1 `duplicate_index`** — Drop one of the duplicates; check `pg_indexes` to identify which.

---

## How to re-check

```bash
curl -sH "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  "https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/advisors?type=security" \
  | jq '.lints | group_by(.name) | map({name: .[0].name, count: length})'
```

After applying `20260630000000_advisor_safe_wins.sql`:
- `function_search_path_mutable` count should drop from **1 → 0**
- `rls_enabled_no_policy` count should drop from **1 → 0**

The other counts will be unchanged until the items above are addressed.
