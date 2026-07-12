-- Keep anonymous project discovery independent from authenticated-only role
-- helpers. A single TO public policy can evaluate has_platform_admin() for
-- anonymous requests and make public listing/project embeds fail with 401.
-- Separate role targets avoid overlapping authenticated policies while
-- preserving active discovery plus owner/admin access.

DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects;
DROP POLICY IF EXISTS "Projects are viewable by owner or admin" ON public.projects;
DROP POLICY IF EXISTS "projects_public_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_admin_select" ON public.projects;
DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_anon_select" ON public.projects;
DROP POLICY IF EXISTS "projects_authenticated_select" ON public.projects;

CREATE POLICY "projects_anon_select"
  ON public.projects
  FOR SELECT
  TO anon
  USING (
    status = 'active'::text
    AND archived_at IS NULL
  );

CREATE POLICY "projects_authenticated_select"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    (status = 'active'::text AND archived_at IS NULL)
    OR owner_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DO $$
DECLARE
  anon_policy text;
  authenticated_policy text;
BEGIN
  SELECT qual
    INTO anon_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND policyname = 'projects_anon_select'
     AND cmd = 'SELECT'
     AND roles = '{anon}';

  IF anon_policy IS NULL
     OR anon_policy !~* 'status'
     OR anon_policy !~* 'archived_at'
     OR anon_policy ~* 'has_platform_admin' THEN
    RAISE EXCEPTION 'anon-safe projects policy missing';
  END IF;

  SELECT qual
    INTO authenticated_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND policyname = 'projects_authenticated_select'
     AND cmd = 'SELECT'
     AND roles = '{authenticated}';

  IF authenticated_policy IS NULL
     OR authenticated_policy !~* 'status'
     OR authenticated_policy !~* 'archived_at'
     OR authenticated_policy !~* 'owner_id'
     OR authenticated_policy !~* 'has_platform_admin' THEN
    RAISE EXCEPTION 'authenticated projects policy missing';
  END IF;
END $$;
