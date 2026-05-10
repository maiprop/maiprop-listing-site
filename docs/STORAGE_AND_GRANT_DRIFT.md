# Storage & Grant Drift — live DB vs declared migrations

During end-to-end testing of PR #125 (CreateNewBuildingListing wizard) we
discovered that several effects declared by earlier migrations were missing in
the live Supabase project (`qvvicunqcrwpioqnvzxf`). This document captures
the findings and the recovery plan.

## What is "drift"?

`supabase db push` (and the `migrations-validate` CI job) only run **forward**.
If a migration is applied successfully but its effects are subsequently
mutated outside of migrations — e.g. via SQL editor, dashboard, or another
agent — the live state can silently diverge from the declared state. Fresh
`supabase db reset` runs still produce a healthy schema, but existing
production environments do not.

We have no automated drift-detection today, so the drift listed below was
discovered by failing E2E tests rather than by tooling.

## Drift items

### 1. (FIXED in `20260706000000`) `public.has_platform_admin(uuid)` — EXECUTE grant missing

- **Declared in:** `supabase/migrations/20260623130000_authoritative_role.sql:108`
  ```sql
  GRANT EXECUTE ON FUNCTION public.has_platform_admin(uuid)
    TO anon, authenticated, service_role;
  ```
- **Observed live state:** `has_function_privilege('authenticated', 'public.has_platform_admin(uuid)', 'EXECUTE') = false`.
- **Symptom:** The RLS policy `projects.projects_owner_admin_select` calls
  `has_platform_admin(auth.uid())` (unqualified), which resolves to the public
  schema function and fails with `42501: permission denied for function
  has_platform_admin` for any non-admin user. This blocks `INSERT … RETURNING`
  on `public.projects` for developers/sellers.
- **Recovery:** Re-asserted in `20260706000000_restore_storage_grants_drift.sql`.

### 2. (FIXED in `20260706000000`) `public.has_role(uuid, public.user_role)` — EXECUTE grant missing

- **Declared in:** `supabase/migrations/20260623130000_authoritative_role.sql:107`
- **Observed live state:** Granted only to `service_role`. `anon` and
  `authenticated` were not granted EXECUTE.
- **Symptom:** Latent — RLS policies that call this helper would fail similarly.
- **Recovery:** Re-asserted in `20260706000000_restore_storage_grants_drift.sql`.

### 3. (FIXED in `20260706000000`) `project_media_*` storage policies missing

- **Declared in:** `supabase/migrations/20260328120000_developer_projects_full.sql:163-176`
  (initial), tightened in `20260627000000_audit_remediations.sql:76-84`.
- **Observed live state:** No policies for `bucket_id = 'project-media'`
  existed on `storage.objects`.
- **Symptom:** Any authenticated upload to `project-media/<userId>/<...>`
  returned `403 row-level security policy`. This blocked Step 3 (Media) of
  the new-building wizard for every developer.
- **Recovery:** Re-asserted (3 policies: `project_media_select`,
  `project_media_insert` with folder-name guard, `project_media_delete`) in
  `20260706000000_restore_storage_grants_drift.sql`.

### 4. (FIXED in `20260706000000`) `listing-images` bucket missing

- **Declared in:** `supabase/migrations/20260306223545_*.sql:445-447`
- **Observed live state:** Missing in an earlier snapshot; recreated by hand
  via the management API during testing.
- **Symptom:** Step 5 (Photos) upload would fail with `Bucket not found`.
- **Recovery:** Re-asserted via idempotent `INSERT … ON CONFLICT DO NOTHING`
  in `20260706000000_restore_storage_grants_drift.sql`.

## Drift items intentionally **not** in 20260706000000

These are tracked here for follow-up. Each requires a deliberate decision
about whether the migration-declared state or the live state is correct.

### A. `avatars` bucket entirely missing

- **Declared in:** `20260306223545_*.sql:448`
- **Live state:** Bucket does not exist; the 3 declared `avatars` storage
  policies (SELECT/INSERT/UPDATE) are absent.
- **Decision needed:** Does the product still need user avatars? If yes,
  recreate the bucket and policies; if no, deprecate the migration code path.

### B. `listing-images` bucket has stale `file_size_limit` / `allowed_mime_types`

- **Migration `20260306223545_*.sql`:** creates with `10485760` (10 MB) and
  `['image/jpeg','image/png','image/webp','image/gif']`.
- **Migration `20260522000000_performance_optimizations.sql:163-167`:** UPDATEs
  to `5242880` (5 MB) and removes `image/gif`.
- **Live state:** Still 10 MB and includes `image/gif`. The performance
  migration's UPDATE never landed.
- **Decision needed:** The perf migration tightened the limit and dropped GIF
  support. If we want that, run the UPDATE again. If we want to keep current
  behavior (current uploaders rely on it; the listing-images allowlist still
  matches the app code's `IMAGE_MIME_TYPES` constant), consider adjusting
  the migration instead so future fresh applies match production.

### C. Other recent migrations — needs full audit

A bucket-by-bucket and grant-by-grant comparison against every migration's
declared post-state is out of scope for this PR. Recommended follow-up:

- Add a CI job that snapshots the live DB's declarative state (function
  grants, RLS policies, storage buckets, indexes) and diffs it against the
  expected state from `supabase db dump --schema=public,private,storage` on
  a fresh migration replay.
- Or: adopt `supabase db diff` as part of the deploy pipeline, comparing
  live to a fresh `db reset`.

## Why this happened

A few root causes worth investigating:

1. **Out-of-band edits**: someone (a dashboard user, another agent, a manual
   SQL run) revoked grants or dropped policies after the migration applied.
2. **Failed migration apply that wasn't rolled back**: if a CREATE POLICY
   inside a multi-statement migration partially failed, later statements
   wouldn't run. Worth checking `supabase_migrations.schema_migrations` for
   any rows whose hash differs from the on-disk hash.
3. **Reset / restore from older snapshot**: if the live DB was restored from
   a pre-migration snapshot at any point and the migration list wasn't
   replayed, the declared state would silently regress.

## Prevention

- The new lint rules (`scripts/check-migration-idempotency.mjs`) ensure
  future migrations are safe to **re-run**, but they don't detect drift.
- Recommended next step: a scheduled GitHub Action that runs `supabase db
  diff --linked` against the live project and posts a Slack alert if the
  diff is non-empty.
