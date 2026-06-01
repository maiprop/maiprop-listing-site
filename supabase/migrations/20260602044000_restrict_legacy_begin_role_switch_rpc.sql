-- The browser now starts role switches through the authenticated
-- begin-role-switch Edge Function, which verifies the JWT and calls
-- begin_role_switch_for_user(uuid) with the verified user id. Keep the legacy
-- caller-context RPC available only to service-role paths.

REVOKE ALL ON FUNCTION public.begin_role_switch()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_role_switch()
  TO service_role;

DO $$
DECLARE
  legacy_fn regprocedure := to_regprocedure('public.begin_role_switch()');
  service_fn regprocedure := to_regprocedure('public.begin_role_switch_for_user(uuid)');
BEGIN
  IF legacy_fn IS NULL THEN
    RAISE EXCEPTION 'public.begin_role_switch() does not exist';
  END IF;

  IF service_fn IS NULL THEN
    RAISE EXCEPTION 'public.begin_role_switch_for_user(uuid) does not exist';
  END IF;

  IF has_function_privilege('anon', legacy_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', legacy_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.begin_role_switch() must not remain browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', legacy_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.begin_role_switch() must remain service-callable';
  END IF;

  IF has_function_privilege('anon', service_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', service_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.begin_role_switch_for_user(uuid) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', service_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.begin_role_switch_for_user(uuid) must remain service-callable';
  END IF;
END $$;
