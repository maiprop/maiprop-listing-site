-- ─────────────────────────────────────────────────────────────────────────────
-- Restore: storage policies + function grants that drifted off live DB
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Background: during E2E testing of the new-building wizard we discovered that
-- several effects declared by earlier migrations were missing in the live
-- Supabase project (`qvvicunqcrwpioqnvzxf`):
--
--   1. `public.has_platform_admin(uuid)` lost its EXECUTE grant to
--      `authenticated` (originally granted in 20260623130000_authoritative_role.sql).
--      Without it, the `projects_owner_admin_select` RLS policy on
--      `public.projects` fails with `42501: permission denied for function
--      has_platform_admin` for any non-admin user, blocking developer/seller
--      project creation. Same applies to `public.has_role(uuid, user_role)`.
--
--   2. The 3 `project_media_*` storage policies declared in
--      20260328120000_developer_projects_full.sql (and tightened in
--      20260627000000_audit_remediations.sql) were absent from
--      `storage.objects`, so any upload to the `project-media` bucket failed
--      with `403 row-level security policy`. This blocks Step 3 (Media) of the
--      new-building wizard for every developer.
--
--   3. The `listing-images` bucket itself was missing from `storage.buckets`
--      (declared in 20260306223545_*.sql:445). It's been recreated by hand,
--      but we re-INSERT it here idempotently so a fresh `db reset` always has
--      it.
--
-- This migration is forward-only and idempotent. It re-asserts the declared
-- state. If a future drift-recovery is needed, this file can serve as a
-- reference template.
--
-- Reference: see `docs/STORAGE_AND_GRANT_DRIFT.md` for the full analysis,
-- including additional drift items not covered here (`avatars` bucket missing,
-- `listing-images` size_limit/MIME not updated per 20260522000000) which are
-- tracked separately because they require deliberate decisions about whether
-- the live state or the migration-declared state is correct.

-- ── 1. Function grants ──────────────────────────────────────────────────────
-- Re-grant EXECUTE on the role-check helpers used by RLS policies. These are
-- SECURITY DEFINER functions that read `private.profiles.role`, so granting
-- EXECUTE to `authenticated` does not leak the underlying table.
GRANT EXECUTE ON FUNCTION public.has_platform_admin(uuid)
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role)
  TO anon, authenticated, service_role;


-- ── 2. project-media storage policies ───────────────────────────────────────
-- Matches the tightened version from 20260627000000_audit_remediations.sql.
-- INSERT/DELETE require the path to be prefixed with the uploader's user.id
-- (e.g. `${user.id}/${project.id}/<file>`); SELECT is public because the
-- bucket is configured `public=true`.
DROP POLICY IF EXISTS "project_media_select" ON storage.objects;
CREATE POLICY "project_media_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-media');

DROP POLICY IF EXISTS "project_media_insert" ON storage.objects;
CREATE POLICY "project_media_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "project_media_delete" ON storage.objects;
CREATE POLICY "project_media_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ── 3. listing-images bucket (idempotent re-insert) ─────────────────────────
-- The bucket was missing entirely from a recent live-DB snapshot. Re-INSERT
-- with ON CONFLICT DO NOTHING so we don't clobber an existing one — leaves
-- size_limit / allowed_mime_types alone if already present.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-images',
  'listing-images',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/gif']
)
ON CONFLICT (id) DO NOTHING;


-- ── 4. Verification ─────────────────────────────────────────────────────────
-- Sanity check that the grants and policies are in place after this migration.
-- Uses DO so a failure surfaces during apply rather than silently no-oping.
DO $$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.has_platform_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'expected authenticated to have EXECUTE on public.has_platform_admin(uuid)';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid, public.user_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'expected authenticated to have EXECUTE on public.has_role(uuid, public.user_role)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'project_media_insert'
  ) THEN
    RAISE EXCEPTION 'expected project_media_insert policy on storage.objects';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE id = 'listing-images'
  ) THEN
    RAISE EXCEPTION 'expected listing-images bucket to exist';
  END IF;
END $$;
