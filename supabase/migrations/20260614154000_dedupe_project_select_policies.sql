-- Remove the Supabase Performance Advisor "multiple permissive policies"
-- warning for public.projects without reintroducing anonymous access to admin
-- helper functions. Anonymous users get a helper-free active-project policy;
-- authenticated users get one combined active/owner/admin policy.

DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects;
DROP POLICY IF EXISTS "Projects are viewable by owner or admin" ON public.projects;
DROP POLICY IF EXISTS "Projects are visible to authenticated users" ON public.projects;

CREATE POLICY "Projects are publicly viewable"
  ON public.projects
  FOR SELECT
  TO anon
  USING (
    status = 'active'::text
    AND archived_at IS NULL
  );

CREATE POLICY "Projects are visible to authenticated users"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    (
      status = 'active'::text
      AND archived_at IS NULL
    )
    OR owner_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

GRANT SELECT ON TABLE public.projects TO anon, authenticated;

DO $$
DECLARE
  anon_policy text;
  auth_policy text;
  auth_policy_count integer;
BEGIN
  SELECT qual
    INTO anon_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND policyname = 'Projects are publicly viewable'
     AND cmd = 'SELECT'
     AND roles = '{anon}';

  IF anon_policy IS NULL
     OR anon_policy !~* 'status'
     OR anon_policy !~* 'archived_at'
     OR anon_policy ~* 'has_platform_admin' THEN
    RAISE EXCEPTION 'anon-safe public projects select policy missing';
  END IF;

  SELECT qual
    INTO auth_policy
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND policyname = 'Projects are visible to authenticated users'
     AND cmd = 'SELECT'
     AND roles = '{authenticated}';

  IF auth_policy IS NULL
     OR auth_policy !~* 'status'
     OR auth_policy !~* 'owner_id'
     OR auth_policy !~* 'has_platform_admin' THEN
    RAISE EXCEPTION 'authenticated projects select policy missing';
  END IF;

  SELECT count(*)
    INTO auth_policy_count
    FROM pg_policies
   WHERE schemaname = 'public'
     AND tablename = 'projects'
     AND cmd = 'SELECT'
     AND permissive = 'PERMISSIVE'
     AND (
       'authenticated' = ANY(roles)
       OR 'public' = ANY(roles)
     );

  IF auth_policy_count <> 1 THEN
    RAISE EXCEPTION 'project SELECT policies still overlap for authenticated: %', auth_policy_count;
  END IF;
END $$;
