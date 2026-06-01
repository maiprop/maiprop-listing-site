-- The browser now reads quota state through the authenticated
-- ai-quota-status Edge Function, which verifies the JWT and calls
-- check_ai_quota_for_user(uuid,text) with the verified user id. Keep the
-- legacy caller-context RPC available to service-role paths only.

REVOKE ALL ON FUNCTION public.check_ai_quota(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota(TEXT)
  TO service_role;

DO $$
DECLARE
  legacy_fn regprocedure := to_regprocedure('public.check_ai_quota(text)');
  service_fn regprocedure := to_regprocedure('public.check_ai_quota_for_user(uuid,text)');
BEGIN
  IF legacy_fn IS NULL THEN
    RAISE EXCEPTION 'public.check_ai_quota(text) does not exist';
  END IF;

  IF service_fn IS NULL THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) does not exist';
  END IF;

  IF has_function_privilege('anon', legacy_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', legacy_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota(text) must not remain browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', legacy_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota(text) must remain service-callable';
  END IF;

  IF has_function_privilege('anon', service_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', service_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', service_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) must remain service-callable';
  END IF;
END $$;
