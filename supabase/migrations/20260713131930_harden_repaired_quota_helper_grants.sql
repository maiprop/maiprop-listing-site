-- Reassert the service boundary after reconciliation of the older add-on
-- credit migration. The base-limit helpers accept a user id and are consumed
-- only by server-side quota functions, so browser roles must not execute them.
DO $$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_ai_call_monthly_base_limit(uuid,text)',
    'public.get_report_monthly_base_limit(uuid)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        function_signature
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
      EXECUTE format(
        'COMMENT ON FUNCTION %s IS %L',
        function_signature,
        'Service-role-only quota base helper. Browser quota access must use Edge/service boundaries.'
      );
    END IF;
  END LOOP;
END $$;
