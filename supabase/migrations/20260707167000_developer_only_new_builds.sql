-- Enforce the business invariant that new-build/off-plan/project inventory is
-- a developer surface, not a generic seller listing type.

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_developer_listing_access(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.authoritative_role(_user_id) = 'developer'::public.user_role
    OR private.has_platform_admin(_user_id),
    false
  )
$$;

REVOKE ALL ON FUNCTION private.has_developer_listing_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_developer_listing_access(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION private.has_developer_listing_access(uuid) IS
  'RLS helper for developer-only new-build listings, projects, and project inventory.';

DROP POLICY IF EXISTS listing_insert_quota ON public.listings;
CREATE POLICY listing_insert_quota
  ON public.listings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.check_listing_quota())
    AND (
      COALESCE(listing_type::text, 'sale') <> 'new_build'
      OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
    AND (
      project_id IS NULL
      OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS listings_update ON public.listings;
CREATE POLICY listings_update
  ON public.listings
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (
      COALESCE(listing_type::text, 'sale') <> 'new_build'
      OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
    AND (
      project_id IS NULL
      OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "projects_owner_insert" ON public.projects;
CREATE POLICY "projects_owner_insert"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "projects_owner_update" ON public.projects;
CREATE POLICY "projects_owner_update"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "projects_owner_delete" ON public.projects;
CREATE POLICY "projects_owner_delete"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  );

DROP POLICY IF EXISTS "project_media_owner_insert" ON public.project_media;
CREATE POLICY "project_media_owner_insert"
  ON public.project_media
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "project_media_owner_update" ON public.project_media;
CREATE POLICY "project_media_owner_update"
  ON public.project_media
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "project_media_owner_delete" ON public.project_media;
CREATE POLICY "project_media_owner_delete"
  ON public.project_media
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "project_units_owner_insert" ON public.project_units;
CREATE POLICY "project_units_owner_insert"
  ON public.project_units
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "project_units_owner_update" ON public.project_units;
CREATE POLICY "project_units_owner_update"
  ON public.project_units
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DROP POLICY IF EXISTS "project_units_owner_delete" ON public.project_units;
CREATE POLICY "project_units_owner_delete"
  ON public.project_units
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
      AND policyname = 'listing_insert_quota'
      AND cmd = 'INSERT'
      AND with_check ~* 'listing_type'
      AND with_check ~* 'project_id'
      AND with_check ~* 'has_developer_listing_access'
  ) THEN
    RAISE EXCEPTION 'developer-only new-build listing insert policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
      AND policyname = 'listings_update'
      AND cmd = 'UPDATE'
      AND qual ~* 'owner_id'
      AND with_check ~* 'listing_type'
      AND with_check ~* 'project_id'
      AND with_check ~* 'has_developer_listing_access'
  ) THEN
    RAISE EXCEPTION 'developer-only listing update policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'projects_owner_insert'
      AND cmd = 'INSERT'
      AND with_check ~* 'owner_id'
      AND with_check ~* 'has_developer_listing_access'
  ) THEN
    RAISE EXCEPTION 'developer-only project insert policy missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (VALUES
      ('project_media', 'project_media_owner_insert', 'INSERT', 'with_check'),
      ('project_media', 'project_media_owner_update', 'UPDATE', 'with_check'),
      ('project_media', 'project_media_owner_delete', 'DELETE', 'qual'),
      ('project_units', 'project_units_owner_insert', 'INSERT', 'with_check'),
      ('project_units', 'project_units_owner_update', 'UPDATE', 'with_check'),
      ('project_units', 'project_units_owner_delete', 'DELETE', 'qual')
    ) AS expected(tablename, policyname, cmd, expr_column)
    LEFT JOIN pg_policies policies
      ON policies.schemaname = 'public'
     AND policies.tablename = expected.tablename
     AND policies.policyname = expected.policyname
     AND policies.cmd = expected.cmd
    WHERE policies.policyname IS NULL
       OR CASE expected.expr_column
            WHEN 'qual' THEN COALESCE(policies.qual, '')
            ELSE COALESCE(policies.with_check, '')
          END !~* 'has_developer_listing_access'
  ) THEN
    RAISE EXCEPTION 'developer-only project inventory policy missing';
  END IF;
END $$;
