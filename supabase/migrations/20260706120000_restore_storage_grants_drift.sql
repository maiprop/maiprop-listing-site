-- ─────────────────────────────────────────────────────────────────────────────
-- Restore: storage policies + function grants + buckets that drifted off live
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Background: during E2E testing of the new-building wizard we discovered
-- that several effects declared by earlier migrations were missing in the
-- live Supabase project (`qvvicunqcrwpioqnvzxf`):
--
--   1. `public.has_platform_admin(uuid)` and `public.has_role(uuid, user_role)`
--      lost their EXECUTE grant to `authenticated`. Granted in
--      `20260623130000_authoritative_role.sql:107-108`, re-granted (without
--      `anon`) in `20260705000000_strict_release_advisor_fixes.sql:564,566`.
--      Without it, the `projects_owner_admin_select` RLS policy on
--      `public.projects` fails with `42501: permission denied for function
--      has_platform_admin`, blocking developer/seller project creation.
--
--   2. The `project_media_insert` and `project_media_delete` storage policies
--      (declared in `20260328120000_developer_projects_full.sql:163-176` and
--      tightened in `20260627000000_audit_remediations.sql:76-84`) were
--      absent from `storage.objects`, so any upload to the `project-media`
--      bucket failed with `403 row-level security policy`. This blocked
--      Step 3 (Media) of the new-building wizard.
--
--   3. The `listing-images` bucket itself was missing in an earlier snapshot
--      (declared in `20260306223545_*.sql:445-447`).
--
--   4. The `listing-images` bucket size_limit + allowed_mime_types `UPDATE`
--      from `20260522000000_performance_optimizations.sql:163-167` (5MB,
--      jpeg/png/webp; drop GIF) was never effected on live — bucket is still
--      at the original 10MB with GIF allowed.
--
--   5. The `avatars` bucket and its 3 storage policies were entirely missing
--      (declared in `20260306223545_*.sql:448,462-472`, with the size limit
--      tightened to 2MB by `20260522000000_performance_optimizations.sql:170-174`).
--      No avatar upload would have worked against live.
--
-- This migration is forward-only and idempotent. It re-asserts the declared
-- state. The DO block at the end performs verification so a fresh apply
-- fails loudly if any effect is missing.
--
-- IMPORTANT: this migration aligns with the deliberate hardening in the
-- preceding migration `20260705000000_strict_release_advisor_fixes.sql`:
--   • Section 8 of that migration revokes EXECUTE on the role-check helpers
--     from PUBLIC and `anon`, granting only to `authenticated` and
--     `service_role`. We keep the same grant set here.
--   • Section 9 deliberately drops the `project_media_select` policy as part
--     of "Remove public bucket listing policies". We do NOT recreate it —
--     reads in the app go through `getPublicUrl()` (which bypasses RLS), so
--     the SELECT policy is unnecessary and listing the bucket via the
--     Supabase API would be a security regression.
--
-- Reference: see `docs/STORAGE_AND_GRANT_DRIFT.md` for the full analysis,
-- including the root-cause investigation.

-- ── 1. Function grants ──────────────────────────────────────────────────────
-- Re-grant EXECUTE on the role-check helpers used by RLS policies. These are
-- SECURITY DEFINER functions that read `private.profiles.role`. Match the
-- final intended state (no `anon`) from 20260705000000 section 8.
GRANT EXECUTE ON FUNCTION public.has_platform_admin(uuid)
  TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role)
  TO authenticated, service_role;


-- ── 2. project-media storage policies ───────────────────────────────────────
-- Restore only `project_media_insert` and `project_media_delete` (declared
-- in 20260328120000_developer_projects_full.sql, tightened to the
-- folder-name guard in 20260627000000_audit_remediations.sql).
-- `project_media_select` is intentionally NOT recreated — see header.
-- Drop it defensively in case an earlier reasserting attempt added it back.
--
-- INSERT/DELETE require the path to be prefixed with the uploader's user.id
-- (e.g. `${user.id}/${project.id}/<file>`).
DROP POLICY IF EXISTS "project_media_select" ON storage.objects;

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


-- ── 3. listing-images bucket (idempotent re-insert + perf-tightening) ───────
-- Re-INSERT idempotently, then UPDATE to the post-20260522 size_limit /
-- allowed_mime_types so that bucket-level enforcement matches what was
-- declared (5MB max, no GIF). Application code's compressImage helper
-- converts HEIC/HEIF/AVIF to WebP/JPEG before upload, so excluding them
-- from the bucket allowlist does not break iOS Safari users.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'listing-images',
  'listing-images',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg','image/webp','image/png']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;


-- ── 4. avatars bucket + its 3 storage policies ──────────────────────────────
-- Bucket was entirely missing from live. Re-INSERT with the post-20260522
-- size_limit (2MB) + allowed_mime_types (jpeg/png/webp); on conflict update
-- to be defensive in case it pre-exists with stale settings.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,  -- 2 MB
  ARRAY['image/jpeg','image/webp','image/png']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );


-- ── 5. Verification ─────────────────────────────────────────────────────────
-- Sanity check that everything landed. Uses DO so a failure surfaces during
-- apply rather than silently no-oping.
DO $$
DECLARE
  v_listing_images_limit bigint;
  v_avatars_limit        bigint;
BEGIN
  -- Function grants (positive + negative)
  IF NOT has_function_privilege('authenticated', 'public.has_platform_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'expected authenticated to have EXECUTE on public.has_platform_admin(uuid)';
  END IF;
  IF has_function_privilege('anon', 'public.has_platform_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must NOT have EXECUTE on public.has_platform_admin(uuid)';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid, public.user_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'expected authenticated to have EXECUTE on public.has_role(uuid, public.user_role)';
  END IF;
  IF has_function_privilege('anon', 'public.has_role(uuid, public.user_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must NOT have EXECUTE on public.has_role(uuid, public.user_role)';
  END IF;

  -- project-media policies
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'project_media_insert'
  ) THEN
    RAISE EXCEPTION 'expected project_media_insert policy on storage.objects';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'project_media_delete'
  ) THEN
    RAISE EXCEPTION 'expected project_media_delete policy on storage.objects';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'project_media_select'
  ) THEN
    RAISE EXCEPTION 'project_media_select must NOT exist (deliberately dropped in 20260705000000)';
  END IF;

  -- listing-images bucket + perf-tightening
  SELECT file_size_limit INTO v_listing_images_limit
    FROM storage.buckets WHERE id = 'listing-images';
  IF v_listing_images_limit IS NULL THEN
    RAISE EXCEPTION 'expected listing-images bucket to exist';
  END IF;
  IF v_listing_images_limit <> 5242880 THEN
    RAISE EXCEPTION 'expected listing-images file_size_limit to be 5242880 (5 MB), got %', v_listing_images_limit;
  END IF;

  -- avatars bucket + policies
  SELECT file_size_limit INTO v_avatars_limit
    FROM storage.buckets WHERE id = 'avatars';
  IF v_avatars_limit IS NULL THEN
    RAISE EXCEPTION 'expected avatars bucket to exist';
  END IF;
  IF v_avatars_limit <> 2097152 THEN
    RAISE EXCEPTION 'expected avatars file_size_limit to be 2097152 (2 MB), got %', v_avatars_limit;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'Avatars are publicly accessible'
  ) THEN
    RAISE EXCEPTION 'expected "Avatars are publicly accessible" policy on storage.objects';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'Users can upload their own avatar'
  ) THEN
    RAISE EXCEPTION 'expected "Users can upload their own avatar" policy on storage.objects';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname = 'Users can update their own avatar'
  ) THEN
    RAISE EXCEPTION 'expected "Users can update their own avatar" policy on storage.objects';
  END IF;
END $$;
