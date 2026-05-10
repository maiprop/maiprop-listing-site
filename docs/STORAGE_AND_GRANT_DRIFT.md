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

### Important context: alignment with `20260705000000_strict_release_advisor_fixes`

The immediately-preceding migration `20260705000000_strict_release_advisor_fixes.sql`
deliberately:

- (Section 8) revokes EXECUTE on `has_platform_admin(uuid)` and
  `has_role(uuid, public.user_role)` from `PUBLIC` and `anon`, granting only
  to `authenticated` and `service_role`.
- (Section 9) drops the `project_media_select` policy as part of "Remove
  public bucket listing policies".

Our recovery migration **aligns with that intended final state** —
function grants are only re-asserted to `authenticated, service_role` (not
`anon`), and `project_media_select` is dropped (not recreated). The app
reads `project-media` files via `getPublicUrl()` which bypasses RLS, so the
SELECT policy is unnecessary and recreating it would re-enable bucket
listing via the Supabase API.

### 1. (FIXED in `20260706000000`) `public.has_platform_admin(uuid)` — EXECUTE grant missing for `authenticated`

- **Declared in:** `supabase/migrations/20260623130000_authoritative_role.sql:108`
  granted to `anon, authenticated, service_role`. Then
  `20260705000000_strict_release_advisor_fixes.sql:564` revokes from
  `PUBLIC, anon` and grants only to `authenticated, service_role`.
- **Observed live state:** `has_function_privilege('authenticated', 'public.has_platform_admin(uuid)', 'EXECUTE') = false` (i.e. neither the original grant nor the post-`20260705000000` grant landed).
- **Symptom:** The RLS policy `projects.projects_owner_admin_select` calls
  `has_platform_admin(auth.uid())` (unqualified), which resolves to the public
  schema function and fails with `42501: permission denied for function
  has_platform_admin` for any non-admin user. This blocks `INSERT … RETURNING`
  on `public.projects` for developers/sellers.
- **Recovery:** Re-grant to `authenticated, service_role` (matching the
  intended final state from `20260705000000` — not `anon`) in
  `20260706000000_restore_storage_grants_drift.sql`.

### 2. (FIXED in `20260706000000`) `public.has_role(uuid, public.user_role)` — EXECUTE grant missing

- **Declared in:** `supabase/migrations/20260623130000_authoritative_role.sql:107`
  (initial) and tightened in `20260705000000_strict_release_advisor_fixes.sql:566`.
- **Observed live state:** Granted only to `service_role`. `authenticated`
  was not granted EXECUTE.
- **Symptom:** Latent — RLS policies that call this helper would fail similarly.
- **Recovery:** Re-grant to `authenticated, service_role` (no `anon`) in
  `20260706000000_restore_storage_grants_drift.sql`.

### 3. (FIXED in `20260706000000`) `project_media_*` INSERT/DELETE policies missing

- **Declared in:** `supabase/migrations/20260328120000_developer_projects_full.sql:168-176`
  (initial — created `project_media_insert` and `project_media_delete`,
  tightened with folder-name guard in `20260627000000_audit_remediations.sql:76-84`).
- **Observed live state:** No policies for `bucket_id = 'project-media'`
  existed on `storage.objects`.
- **Symptom:** Any authenticated upload to `project-media/<userId>/<...>`
  returned `403 row-level security policy`. This blocked Step 3 (Media) of
  the new-building wizard for every developer.
- **Recovery:** Re-create only `project_media_insert` and `project_media_delete`
  in `20260706000000`. **`project_media_select` is intentionally NOT
  recreated** — it was deliberately dropped in `20260705000000:360` ("Remove
  public bucket listing policies"). The app reads via `getPublicUrl()` which
  bypasses RLS, so the SELECT policy is unnecessary and recreating it would
  re-enable bucket listing via the Supabase API.

### 4. (FIXED in `20260706000000`) `listing-images` bucket missing

- **Declared in:** `supabase/migrations/20260306223545_*.sql:445-447`
- **Observed live state:** Missing in an earlier snapshot; recreated by hand
  via the management API during testing.
- **Symptom:** Step 5 (Photos) upload would fail with `Bucket not found`.
- **Recovery:** Re-asserted via idempotent `INSERT … ON CONFLICT DO NOTHING`
  in `20260706000000_restore_storage_grants_drift.sql`.

### 5. (FIXED in `20260706000000`) `listing-images` bucket has stale `file_size_limit` / `allowed_mime_types`

- **Declared in:** `supabase/migrations/20260306223545_*.sql:445-447`
  initial INSERT with `10485760` (10 MB) and
  `['image/jpeg','image/png','image/webp','image/gif']`. Tightened in
  `supabase/migrations/20260522000000_performance_optimizations.sql:163-167`
  to `5242880` (5 MB) and `['image/jpeg','image/webp','image/png']` (drop
  GIF).
- **Observed live state:** `20260522000000` is recorded as applied in
  `supabase_migrations.schema_migrations`, and its index changes did land,
  but the bucket UPDATE did not — bucket was still 10 MB with `image/gif`.
  Likely cause: the bucket UPDATE was reverted out-of-band after the
  migration ran.
- **Symptom:** Bucket-level enforcement was looser than declared; HEIC/HEIF/
  AVIF uploads still get rejected by the bucket allowlist (those formats
  are not in either the original or tightened allowlist), but the app's
  `compressImage.ts` converts them to WebP/JPEG before upload, so dropping
  GIF is the only behavioral change.
- **Recovery:** Re-INSERT (idempotent via `ON CONFLICT DO UPDATE`) with
  the post-`20260522000000` state in `20260706000000_restore_storage_grants_drift.sql`.

### 6. (FIXED in `20260706000000`) `avatars` bucket and 3 storage policies entirely missing

- **Declared in:** `supabase/migrations/20260306223545_*.sql:448` (initial
  bucket INSERT, 5 MB, jpeg/png/webp) and `:462-472` (3 storage policies:
  `Avatars are publicly accessible`, `Users can upload their own avatar`,
  `Users can update their own avatar`). Tightened in
  `supabase/migrations/20260522000000_performance_optimizations.sql:170-174`
  to `2097152` (2 MB).
- **Observed live state:** Bucket entirely absent from `storage.buckets`;
  no avatar-related policies on `storage.objects`.
- **Symptom:** Any avatar upload would have failed with `Bucket not found`.
- **Recovery:** Re-INSERT bucket (idempotent via `ON CONFLICT DO UPDATE`)
  at the post-`20260522000000` state (2 MB, jpeg/webp/png) and recreate the
  3 policies in `20260706000000_restore_storage_grants_drift.sql`.

## Future drift detection

The drift listed above was discovered via E2E test failures rather than by
tooling. We should add automated drift detection so future regressions
surface in CI rather than at runtime.

- **Short-term:** Add a CI job that snapshots the live DB's declarative
  state (function grants, RLS policies, storage buckets, indexes) and diffs
  it against the expected state from `supabase db dump --schema=public,private,storage`
  on a fresh migration replay.
- **Or:** adopt `supabase db diff` as part of the deploy pipeline,
  comparing live to a fresh `db reset`.

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
