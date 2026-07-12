-- Keep public project discovery and authenticated owner/admin visibility in
-- one permissive SELECT policy. This removes historical policy names that can
-- survive non-linear production migration histories and otherwise broaden
-- visibility or force Postgres to evaluate overlapping policies.
DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects;
DROP POLICY IF EXISTS "Projects are viewable by owner or admin" ON public.projects;
DROP POLICY IF EXISTS "projects_public_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_admin_select" ON public.projects;
DROP POLICY IF EXISTS "projects_select" ON public.projects;

CREATE POLICY "projects_select"
  ON public.projects
  FOR SELECT
  TO public
  USING (
    (status = 'active'::text AND archived_at IS NULL)
    OR owner_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );
