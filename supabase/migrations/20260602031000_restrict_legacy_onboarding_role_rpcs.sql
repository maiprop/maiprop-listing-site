-- Restrict legacy role/onboarding RPCs that are no longer called directly by
-- the frontend or RLS policies.
--
-- Current onboarding completion goes through the `complete-onboarding-role`
-- Edge Function, which invokes `complete_onboarding_role_for_user(...)` with a
-- service-role client after validating the caller's JWT and allowed role.

REVOKE ALL ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT) IS
  'Legacy self-service onboarding wrapper retained for service-role compatibility; browser onboarding uses the complete-onboarding-role Edge Function.';

REVOKE ALL ON FUNCTION public.get_my_role()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_role()
  TO service_role;

COMMENT ON FUNCTION public.get_my_role() IS
  'Legacy role lookup retained for service-role compatibility; current clients read profile role through typed profile queries.';

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.complete_onboarding_role(public.user_role,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute public.complete_onboarding_role(...)';
  END IF;

  IF has_function_privilege('anon', 'public.complete_onboarding_role(public.user_role,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute public.complete_onboarding_role(...)';
  END IF;

  IF has_function_privilege('authenticated', 'public.get_my_role()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute public.get_my_role()';
  END IF;

  IF has_function_privilege('anon', 'public.get_my_role()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute public.get_my_role()';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.complete_onboarding_role(public.user_role,text,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute public.complete_onboarding_role(...)';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.get_my_role()', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute public.get_my_role()';
  END IF;
END $$;
