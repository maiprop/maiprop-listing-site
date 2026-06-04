-- 20260707159000 re-applied the legacy own-role SELECT policy after the
-- consolidated user_roles_select policy already existed. Keep the consolidated
-- policy and remove only the duplicate permissive policy flagged by advisors.
DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
  END IF;
END $$;
