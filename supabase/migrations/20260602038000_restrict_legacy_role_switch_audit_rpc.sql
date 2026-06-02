-- Phase 2: after log-role-switch is deployed with the service-role audit RPC,
-- remove browser-role execution from the legacy caller-context audit RPC.

REVOKE ALL ON FUNCTION public.record_role_switch_audit(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_role_switch_audit(TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.record_role_switch_audit(text,text,text,boolean,boolean)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_role_switch_audit(text,text,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy role-switch audit RPC must not be browser-executable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.record_role_switch_audit(text,text,text,boolean,boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy role-switch audit RPC must remain service-callable';
  END IF;
END $$;
