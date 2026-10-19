\set ON_ERROR_STOP on
BEGIN;
SET LOCAL request.jwt.claim.role = 'service_role';

DO $test$
BEGIN
  IF pg_catalog.has_table_privilege('anon','public.auth_email_dispatch','SELECT')
    OR pg_catalog.has_table_privilege('authenticated','public.auth_email_dispatch','SELECT')
    OR pg_catalog.has_table_privilege('service_role','public.auth_email_dispatch','SELECT')
    OR pg_catalog.has_function_privilege('anon','public.begin_auth_email_dispatch_for_service(text,text,uuid)','EXECUTE')
    OR pg_catalog.has_function_privilege('authenticated','public.record_auth_email_dispatch_result_for_service(text,text,uuid,text,integer,text)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('service_role','public.begin_auth_email_dispatch_for_service(text,text,uuid)','EXECUTE')
  THEN RAISE EXCEPTION 'auth_email_acl_mismatch'; END IF;
  IF NOT (SELECT c.relrowsecurity FROM pg_catalog.pg_class c WHERE c.oid='public.auth_email_dispatch'::regclass)
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname='public' AND tablename='auth_email_dispatch')
    OR (SELECT pg_catalog.array_agg(a.attname::text ORDER BY a.attnum)
        FROM pg_catalog.pg_attribute a WHERE a.attrelid='public.auth_email_dispatch'::regclass
          AND a.attnum>0 AND NOT a.attisdropped)
      <> ARRAY['webhook_id','slot','state','attempt_token','attempt_count','created_at','updated_at',
        'attempt_started_at','accepted_at','http_status','result_code']
    OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_index i
        WHERE i.indrelid='public.auth_email_dispatch'::regclass AND i.indisunique) <> 1
    OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p
        WHERE p.oid IN ('public.begin_auth_email_dispatch_for_service(text,text,uuid)'::regprocedure,
          'public.record_auth_email_dispatch_result_for_service(text,text,uuid,text,integer,text)'::regprocedure)
          AND (NOT p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']))
  THEN RAISE EXCEPTION 'auth_email_metadata_mismatch'; END IF;
END $test$;

SET LOCAL ROLE anon;
DO $test$
BEGIN
  BEGIN
    PERFORM public.begin_auth_email_dispatch_for_service('evt-anon','signup','10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'anon_execute_admitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  BEGIN
    PERFORM public.begin_auth_email_dispatch_for_service('evt-authenticated','signup','10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'authenticated_execute_admitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $test$;
RESET ROLE;

SET LOCAL ROLE service_role;
DO $test$
DECLARE v_result jsonb;
BEGIN
  PERFORM pg_catalog.set_config('request.jwt.claim.role','authenticated',true);
  BEGIN
    PERFORM public.begin_auth_email_dispatch_for_service('evt-spoof','signup','10000000-0000-4000-8000-000000000099');
    RAISE EXCEPTION 'service_role_claim_bypass';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM pg_catalog.set_config('request.jwt.claim.role','service_role',true);
  v_result:=public.begin_auth_email_dispatch_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001');
  IF v_result <> '{"decision":"send","state":"sending","webhook_id":"evt-service","slot":"email_change_current","attempt_token":"10000000-0000-4000-8000-000000000001"}'::jsonb THEN
    RAISE EXCEPTION 'first_begin_%',v_result;
  END IF;
  IF public.begin_auth_email_dispatch_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000002')->>'decision'<>'busy' THEN
    RAISE EXCEPTION 'duplicate_begin_admitted';
  END IF;
  BEGIN
    PERFORM public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000002','accepted',201,'accepted_2xx');
    RAISE EXCEPTION 'wrong_token_admitted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','accepted',503,'accepted_2xx');
    RAISE EXCEPTION '503_accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  v_result:=public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','unknown',503,'http_unconfirmed');
  IF v_result->>'state'<>'unknown' THEN RAISE EXCEPTION 'unknown_record_%',v_result; END IF;
  IF public.begin_auth_email_dispatch_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000002')->>'decision'<>'unknown' THEN
    RAISE EXCEPTION 'unknown_readmitted';
  END IF;
  v_result:=public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','unknown',503,'http_unconfirmed');
  IF v_result->>'state'<>'unknown' THEN RAISE EXCEPTION 'unknown_idempotence'; END IF;
  BEGIN
    PERFORM public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','unknown',408,'http_unconfirmed');
    RAISE EXCEPTION 'unknown_mutated';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  v_result:=public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','accepted',201,'accepted_2xx');
  IF v_result->>'state'<>'accepted' THEN RAISE EXCEPTION 'late_acceptance_%',v_result; END IF;
  IF public.begin_auth_email_dispatch_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000002')->>'decision'<>'replay_accepted' THEN
    RAISE EXCEPTION 'accepted_not_replayed';
  END IF;
  v_result:=public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','accepted',201,'accepted_2xx');
  IF v_result->>'state'<>'accepted' THEN RAISE EXCEPTION 'accepted_idempotence'; END IF;
  BEGIN
    PERFORM public.record_auth_email_dispatch_result_for_service('evt-service','email_change_current','10000000-0000-4000-8000-000000000001','unknown',503,'http_unconfirmed');
    RAISE EXCEPTION 'accepted_regressed';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  IF public.begin_auth_email_dispatch_for_service('evt-independent','email_change_current','10000000-0000-4000-8000-000000000003')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'independent_id_blocked';
  END IF;
  BEGIN
    PERFORM public.begin_auth_email_dispatch_for_service('evt-bad','wrong_slot','10000000-0000-4000-8000-000000000004');
    RAISE EXCEPTION 'bad_slot_admitted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $test$;
RESET ROLE;

-- Operational timeout is a one-way unknown classification, never a new send lease.
UPDATE public.auth_email_dispatch SET attempt_started_at=pg_catalog.now()-INTERVAL '16 minutes'
  WHERE webhook_id='evt-independent' AND slot='email_change_current';
SET LOCAL ROLE service_role;
DO $test$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.begin_auth_email_dispatch_for_service('evt-independent','email_change_current','10000000-0000-4000-8000-000000000005');
  IF v_result->>'decision'<>'unknown' THEN RAISE EXCEPTION 'expired_send_readmitted_%',v_result; END IF;
  v_result:=public.record_auth_email_dispatch_result_for_service('evt-independent','email_change_current','10000000-0000-4000-8000-000000000003','accepted',202,'accepted_2xx');
  IF v_result->>'state'<>'accepted' THEN RAISE EXCEPTION 'expired_late_acceptance_%',v_result; END IF;
END $test$;
RESET ROLE;
ROLLBACK;
DO $test$
BEGIN
  IF current_user <> 'postgres' OR nullif(pg_catalog.current_setting('request.jwt.claim.role',true),'') IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.auth_email_dispatch WHERE webhook_id IN ('evt-service','evt-independent','evt-spoof'))
  THEN RAISE EXCEPTION 'auth_email_rollback_or_role_residue'; END IF;
END $test$;
