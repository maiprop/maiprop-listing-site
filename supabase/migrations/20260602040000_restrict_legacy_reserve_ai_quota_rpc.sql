-- Phase 2: after all Edge Functions that use _shared/aiUsage.ts are deployed
-- with reserve_ai_quota_for_user(...), remove browser-role execution from the
-- legacy caller-context reservation RPC.

DO $$
DECLARE
  legacy_fn regprocedure := to_regprocedure('public.reserve_ai_quota(text)');
BEGIN
  IF legacy_fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', legacy_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', legacy_fn);

    IF has_function_privilege('anon', legacy_fn::oid, 'EXECUTE')
       OR has_function_privilege('authenticated', legacy_fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy AI quota reservation RPC must not be browser-executable';
    END IF;

    IF NOT has_function_privilege('service_role', legacy_fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy AI quota reservation RPC must remain service-callable';
    END IF;
  END IF;
END $$;
