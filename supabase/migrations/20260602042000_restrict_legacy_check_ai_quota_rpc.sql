-- The browser now reads quota state through the authenticated
-- ai-quota-status Edge Function, which verifies the JWT and calls
-- check_ai_quota_for_user(uuid,text) with the verified user id. Keep the
-- legacy caller-context RPC available to service-role paths only.

DO $$
DECLARE
  legacy_fn regprocedure := to_regprocedure('public.check_ai_quota(text)');
  service_fn regprocedure := to_regprocedure('public.check_ai_quota_for_user(uuid,text)');
BEGIN
  IF service_fn IS NULL THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) does not exist';
  END IF;

  IF legacy_fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', legacy_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', legacy_fn);

    IF has_function_privilege('anon', legacy_fn::oid, 'EXECUTE')
       OR has_function_privilege('authenticated', legacy_fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'public.check_ai_quota(text) must not remain browser-callable';
    END IF;

    IF NOT has_function_privilege('service_role', legacy_fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'public.check_ai_quota(text) must remain service-callable';
    END IF;
  END IF;

  IF has_function_privilege('anon', service_fn::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', service_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', service_fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) must remain service-callable';
  END IF;
END $$;
