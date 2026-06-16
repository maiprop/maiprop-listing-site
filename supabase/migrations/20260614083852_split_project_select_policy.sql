-- Keep public new-build project details loadable without granting anonymous
-- callers access to admin-only helper functions. A prior policy combined
-- public visibility and owner/admin visibility in one `TO public` policy:
--
--   active project OR owner OR private.has_platform_admin(auth.uid())
--
-- PostgreSQL may evaluate the helper branch for anonymous requests even when
-- the active-project branch is true, which makes PostgREST return
-- "permission denied for function has_platform_admin" for public new-build
-- detail embeds.

DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects;
DROP POLICY IF EXISTS "Projects are viewable by owner or admin" ON public.projects;

CREATE POLICY "Projects are publicly viewable"
  ON public.projects
  FOR SELECT
  TO public
  USING (
    status = 'active'::text
    AND archived_at IS NULL
  );

CREATE POLICY "Projects are viewable by owner or admin"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DO $$
DECLARE
  public_policy text;
  owner_policy text;
BEGIN
  SELECT qual
    INTO public_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND policyname = 'Projects are publicly viewable'
     AND cmd = 'SELECT'
     AND roles = '{public}';

  IF public_policy IS NULL
     OR public_policy !~* 'status'
     OR public_policy !~* 'archived_at'
     OR public_policy ~* 'has_platform_admin' THEN
    RAISE EXCEPTION 'anon-safe public projects select policy missing';
  END IF;

  SELECT qual
    INTO owner_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND policyname = 'Projects are viewable by owner or admin'
     AND cmd = 'SELECT'
     AND roles = '{authenticated}';

  IF owner_policy IS NULL
     OR owner_policy !~* 'owner_id'
     OR owner_policy !~* 'has_platform_admin' THEN
    RAISE EXCEPTION 'authenticated owner/admin projects select policy missing';
  END IF;
END $$;
