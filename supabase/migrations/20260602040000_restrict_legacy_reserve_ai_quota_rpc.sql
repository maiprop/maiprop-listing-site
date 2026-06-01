-- Phase 2: after all Edge Functions that use _shared/aiUsage.ts are deployed
-- with reserve_ai_quota_for_user(...), remove browser-role execution from the
-- legacy caller-context reservation RPC.

REVOKE ALL ON FUNCTION public.reserve_ai_quota(TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(TEXT)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_ai_quota(text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_ai_quota(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy AI quota reservation RPC must not be browser-executable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.reserve_ai_quota(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy AI quota reservation RPC must remain service-callable';
  END IF;
END $$;
