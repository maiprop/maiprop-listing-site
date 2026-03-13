# Security scan remediations

## Pushing migrations to Supabase

The critical fixes are in **`supabase/migrations/20260320120000_fix_critical_security_issues.sql`**. Apply them in one of these ways:

### Option A: Supabase Dashboard (no CLI)

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor**.
3. Copy the contents of `supabase/migrations/20260320120000_fix_critical_security_issues.sql` and paste into a new query.
4. Run the query.

### Option B: Supabase CLI

If the Supabase CLI is installed and the project is linked:

```bash
npx supabase db push
# or
supabase db push
```

To link first: `npx supabase link --project-ref YOUR_PROJECT_REF` (ref is in Project Settings → General).

---

## Concrete changes for remaining warnings

### 1. Extension in public (lint 0014)

**Issue:** Extensions like `pg_cron` and `pg_net` are in the `public` schema.

**Refined behavior:**

- **pg_cron:** Do **not** move. On Supabase 1.169.8+, `pg_cron` must be in `pg_catalog`; moving to `extensions` can fail or break cron. The linter may still report it; acceptable to leave in place.
- **pg_net:** Optional migration `20260320130000_extensions_schema_optional.sql` moves only **pg_net** from `public` to schema `extensions`. Functions like `net.http_post()` keep working (they live in the `net` schema).
- **New extensions:** Create with `WITH SCHEMA extensions` so they never land in `public`, e.g. `CREATE EXTENSION foo WITH SCHEMA extensions;`.

If the migration fails (permissions), use Dashboard → Database → Extensions and disable/re-enable **pg_net** only; leave **pg_cron** as-is.

**Reference:** https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public

---

### 2. RLS policy always true (lint 0024)

**Issue:** Policies with `USING (true)` or `WITH CHECK (true)` for **INSERT/UPDATE/DELETE** are too permissive. SELECT with `USING (true)` is often intentional (e.g. public read for listings, images, professionals, pricing).

**Already fixed in this repo:**

- `consultation_requests` INSERT: now checks `requester_id IS NULL OR requester_id = auth.uid()`.
- `sync_log` INSERT: policy removed; only service role (edge functions) inserts.
- `firesale_requests` INSERT: now checks `user_id IS NULL OR auth.uid() = user_id`.
- `profiles` SELECT: permissive policy dropped; use `profiles_public` for other users.
- `investor_subscriptions` UPDATE: user self-update removed.

**No change needed (intentional public read):**

- `listing_images` SELECT `USING (true)` — public read for property pages.
- `professionals` SELECT `USING (true)` — public directory.
- `pricing_configs` SELECT `USING (true)` — public pricing.

If the linter still reports a policy, it is likely on a table not listed above; add a migration that tightens that policy (e.g. restrict to a role or `auth.uid()`).

**Reference:** https://supabase.com/docs/guides/database/database-linter?lint=0024_permissive_rls_policy

---

### 3. Leaked password protection disabled

**Issue:** Passwords that appear in breach databases (e.g. HaveIBeenPwned) are not blocked.

**Concrete change (Supabase Auth):**

1. Dashboard → **Authentication** → **Providers** → **Email**.
2. Enable **“Breach detection”** / **“Check passwords against breach databases”** (wording may vary by UI version).

If your project uses a custom auth flow (e.g. Lovable), also check:

- Lovable / auth provider docs: https://docs.lovable.dev/features/security#leaked-password-protection-disabled

Supabase’s built-in breach check uses the same idea: reject sign-up or password reset when the password is in a known breach list.

---

### 4. Summary checklist

| Item | Action |
|------|--------|
| Push critical migration | Run `20260320120000_fix_critical_security_issues.sql` via Dashboard SQL or `supabase db push` |
| Profiles PII | Done in migration (use `profiles_public` for others) |
| Investor subscription self-upgrade | Done in migration (user UPDATE removed) |
| Consultation impersonation | Done in migration (`requester_id` check) |
| Extension in public | Move only `pg_net` to `extensions` (migration or Dashboard); leave `pg_cron` in place |
| RLS always true | Only INSERT/UPDATE/DELETE; remaining SELECT (true) are intentional |
| Leaked password protection | Enable in Auth → Email → Breach detection |
