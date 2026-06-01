-- Once the protected admin-broadcast-notification Edge Function is deployed,
-- remove direct browser-role execution from the legacy caller-context RPC.

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.admin_broadcast_notification(text,text,text,text,text)');
BEGIN
  IF fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END IF;
END $$;

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.admin_broadcast_notification(text,text,text,text,text)');
BEGIN
  IF fn IS NULL THEN
    RAISE NOTICE 'legacy admin_broadcast_notification RPC is absent; nothing to restrict';
    RETURN;
  END IF;

  IF has_function_privilege('anon', fn::oid, 'EXECUTE')
     OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'legacy admin broadcast RPC must not remain browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute legacy admin broadcast RPC';
  END IF;
END $$;
