-- Once the protected admin-firesale-action Edge Function is deployed, remove
-- direct browser-role execution from legacy caller-context firesale admin RPCs.

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_update_firesale_pipeline_deal(uuid,text,text,numeric,text,numeric)',
    'public.admin_set_firesale_investor_publication(uuid,boolean)',
    'public.admin_update_firesale_interest_workflow(uuid,text,integer,boolean,text,numeric)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_update_firesale_pipeline_deal(uuid,text,text,numeric,text,numeric)',
    'public.admin_set_firesale_investor_publication(uuid,boolean)',
    'public.admin_update_firesale_interest_workflow(uuid,text,integer,boolean,text,numeric)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NULL THEN
      RAISE NOTICE 'legacy firesale admin RPC is absent; nothing to restrict: %', sig;
      CONTINUE;
    END IF;

    IF has_function_privilege('anon', fn::oid, 'EXECUTE')
       OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'legacy firesale admin RPC must not remain browser-callable: %', sig;
    END IF;

    IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must execute legacy firesale admin RPC: %', sig;
    END IF;
  END LOOP;
END $$;
