-- D2 quota/legacy residual contracts on an explicitly selected disposable clone.
-- All synthetic state and temporary helpers roll back in this backend.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() IS DISTINCT FROM current_setting('maiprop.test_disposable_database', true)
     OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
     OR inet_server_addr() IS NOT NULL
     OR current_setting('session_replication_role') <> 'origin'
  THEN RAISE EXCEPTION 'exact disposable socket database with normal triggers required'; END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd2160001-%')
  THEN RAISE EXCEPTION 'D2 quota fixture collision'; END IF;
END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pgtap') THEN CREATE EXTENSION pgtap; END IF; END $$;
SELECT plan(76);
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SELECT is(current_setting('session_replication_role'),'origin','quota actions retain normal triggers');
SELECT is(public.current_billing_runtime_mode(),'live','owned source clone starts in live billing runtime');
SELECT is((SELECT free_monthly FROM public.ai_usage_limits WHERE bucket='property-valuation'),5,'installed free valuation base');
SELECT ok(NOT has_table_privilege('service_role','public.usage_ai_calls','INSERT'),'service has no direct usage INSERT grant');
SELECT ok((SELECT tgenabled='O' FROM pg_trigger WHERE tgrelid='public.usage_ai_calls'::regclass AND tgname='trg_check_ai_call_monthly_limit'),'usage cap trigger enabled');

-- Full scoped arrays, including every earlier row, are compared after denials.
CREATE FUNCTION pg_temp.quota_state() RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'usage', COALESCE((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.usage_ai_calls u WHERE u.user_id::text LIKE 'd2160001-%'),'[]'::jsonb),
  'purchases', COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.addon_purchases p WHERE p.user_id::text LIKE 'd2160001-%'),'[]'::jsonb)
 )
$$;
-- Construct the entire expected state from the saved pre-action arrays. Only
-- the named new usage row and (optionally) one credit counter/touch may differ.
CREATE FUNCTION pg_temp.expected_after_one(before_state jsonb,new_usage uuid,changed_purchase uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'usage',COALESCE((SELECT jsonb_agg(row_value ORDER BY row_value->>'id') FROM (
    SELECT value AS row_value FROM jsonb_array_elements(before_state->'usage') AS old(value)
    UNION ALL
    SELECT to_jsonb(u) FROM public.usage_ai_calls u WHERE u.id=new_usage
  ) AS all_usage),'[]'::jsonb),
  'purchases',COALESCE((SELECT jsonb_agg(
    CASE WHEN old.value->>'id'=changed_purchase::text THEN
      jsonb_set(jsonb_set(old.value,'{credits_consumed}',to_jsonb((old.value->>'credits_consumed')::integer+1)),
        '{updated_at}',to_jsonb((SELECT updated_at FROM public.addon_purchases WHERE id=changed_purchase)))
    ELSE old.value END ORDER BY old.value->>'id')
    FROM jsonb_array_elements(before_state->'purchases') AS old(value)),'[]'::jsonb)
 )
$$;
CREATE TEMP TABLE quota_snapshots(label text PRIMARY KEY, state jsonb);
CREATE TEMP TABLE quota_receipts(label text PRIMARY KEY, result jsonb);
GRANT INSERT, SELECT ON quota_receipts TO service_role;

SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email)
 SELECT ('d2160001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'d2-quota-'||n||'@example.test'
 FROM generate_series(1,4) n;
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','fixture onboarding uses actual service role');
SELECT is(auth.uid(),NULL::uuid,'fixture onboarding has no subject');
SELECT public.complete_onboarding_role_for_user(('d2160001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'buyer','buyer') FROM generate_series(1,4) n;
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
INSERT INTO public.addon_purchases(id,user_id,addon_key,module,audience,unit,quantity,checkout_mode,status,stripe_session_id,runtime_mode,livemode)
VALUES
 ('d2160002-0000-4000-8000-000000000002','d2160001-0000-4000-8000-000000000002','valuation_single','ai_valuation','participant','credit',1,'payment','paid','cs_d2_quota_b',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d2160002-0000-4000-8000-000000000004','d2160001-0000-4000-8000-000000000004','valuation_single','ai_valuation','participant','credit',1,'payment','paid','cs_d2_quota_d',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SELECT is((SELECT credits_granted FROM public.addon_purchases WHERE id='d2160002-0000-4000-8000-000000000002'),1,'normal purchase trigger derives one credit');
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d2160002-0000-4000-8000-000000000002'),0,'credit begins unconsumed');

-- Service/no-sub explicit-actor status validation, including complete state checks.
INSERT INTO quota_snapshots VALUES('batch-errors',pg_temp.quota_state());
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','batch checks execute as service role');
SELECT is(auth.uid(),NULL::uuid,'batch checks have no subject');
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user(NULL,ARRAY['property-valuation'])$$,'22023','user id is required','batch null actor rejected');
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',NULL)$$,'22023','invalid AI quota buckets','batch null array rejected');
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',ARRAY[]::text[])$$,'22023','invalid AI quota buckets','batch empty array rejected');
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',array_fill('property-valuation'::text,ARRAY[13]))$$,'22023','invalid AI quota buckets','batch oversized array rejected');
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',ARRAY['property-valuation',NULL])$$,'22023','invalid AI quota buckets','batch null element rejected');
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',ARRAY['INVALID'])$$,'22023','invalid AI quota buckets','batch malformed element rejected');
SELECT is(public.check_ai_quota_for_user(NULL,'property-valuation'),'{"allowed":false,"reason":"not_authenticated","used":0,"limit":0}'::jsonb,'single explicit status null actor envelope');
SELECT is(public.check_ai_quota_for_user('d2160001-0000-4000-8000-000000000001','property-valuation'),'{"allowed":true,"reason":null,"used":0,"limit":5}'::jsonb,'single explicit status allowed before usage');
SELECT is(public.check_ai_quota_for_user('d2160001-0000-4000-8000-000000000001','unknown-bucket'),'{"allowed":false,"reason":"plan_does_not_include_feature","used":0,"limit":0}'::jsonb,'single explicit status unknown bucket denied');
SELECT is(public.check_ai_quota('property-valuation'),'{"allowed":false,"reason":"not_authenticated","used":0,"limit":0}'::jsonb,'legacy status requires subject even under service');
SELECT is(public.reserve_ai_quota('property-valuation'),'{"allowed":false,"reason":"not_authenticated","used":0,"limit":0}'::jsonb,'legacy reserve requires subject even under service');
SELECT throws_ok($$SELECT public.record_ai_call('property-valuation')$$,'P0001','ai_call_monthly_limit_reached','legacy record without subject raises');
RESET ROLE;
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='batch-errors'),'all quota rows and all purchase rows unchanged after read-only and no-sub denials');

-- Service with a genuine JWT subject: legacy reader and first reservation.
INSERT INTO quota_snapshots VALUES('pre-base',pg_temp.quota_state());
SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000001',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),'d2160001-0000-4000-8000-000000000001'::uuid,'legacy service call carries fixture subject');
SELECT is(public.check_ai_quota('property-valuation'),public.check_ai_quota_for_user(auth.uid(),'property-valuation'),'legacy and explicit single status agree for subject');
INSERT INTO pg_temp.quota_receipts VALUES('legacy-base',public.reserve_ai_quota('property-valuation'));
SELECT is((SELECT result->>'allowed' FROM pg_temp.quota_receipts WHERE label='legacy-base'),'true','legacy below-base reservation succeeds');
SELECT is((SELECT result->>'used' FROM pg_temp.quota_receipts WHERE label='legacy-base'),'1','legacy below-base used count');
SELECT is((SELECT result->>'limit' FROM pg_temp.quota_receipts WHERE label='legacy-base'),'5','legacy below-base limit');
SELECT ok(NOT ((SELECT result FROM pg_temp.quota_receipts WHERE label='legacy-base') ? 'addon_credit_consumed'),'July legacy reservation has no add-on flag');
RESET ROLE;
SELECT ok(EXISTS(SELECT 1 FROM public.usage_ai_calls WHERE id=(SELECT (result->>'reservation_id')::uuid FROM pg_temp.quota_receipts WHERE label='legacy-base') AND user_id='d2160001-0000-4000-8000-000000000001' AND bucket='property-valuation'),'legacy receipt names exact actor and bucket row');
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d2160001-0000-4000-8000-000000000001'),1,'one legacy call inserted exactly one row');
SELECT is(pg_temp.quota_state(),pg_temp.expected_after_one((SELECT state FROM quota_snapshots WHERE label='pre-base'),(SELECT (result->>'reservation_id')::uuid FROM quota_receipts WHERE label='legacy-base')),'full state after base call has only one new usage row');

-- Seed separate actors to the real base via accepted explicit-actor API; this is fixture setup.
SET LOCAL ROLE service_role;
DO $$ DECLARE actor uuid; n integer; result jsonb; BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'fixture requires subject only for legacy calls'; END IF;
 FOR actor IN SELECT unnest(ARRAY['d2160001-0000-4000-8000-000000000002'::uuid,'d2160001-0000-4000-8000-000000000003'::uuid]) LOOP
  FOR n IN 1..5 LOOP
   result:=public.reserve_ai_quota_for_user(actor,'property-valuation');
   IF result->>'allowed'<>'true' THEN RAISE EXCEPTION 'base fixture reserve failed: %',result; END IF;
  END LOOP;
 END LOOP;
END $$;
RESET ROLE;
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d2160002-0000-4000-8000-000000000002'),0,'base fixture did not spend credit');
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d2160001-0000-4000-8000-000000000003'),5,'no-credit actor reached base');

INSERT INTO quota_snapshots VALUES('pre-overage',pg_temp.quota_state());
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT is(public.check_ai_quota_for_user('d2160001-0000-4000-8000-000000000003','property-valuation'),'{"allowed":false,"reason":"monthly_limit_reached","used":5,"limit":5}'::jsonb,'single explicit status sees exhausted actor');
SELECT is(public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',ARRAY['property-valuation','property-valuation'])->'property-valuation','{"allowed":true,"reason":null,"used":1,"limit":5}'::jsonb,'batch duplicate bucket has one exact value');
SELECT is((SELECT count(*)::integer FROM jsonb_object_keys(public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',ARRAY['property-valuation','property-valuation']))),1,'batch duplicate bucket emits one key');
RESET ROLE;
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='pre-overage'),'all rows unchanged after explicit and batch status');

-- Legacy subject overage: trigger spends the credit; legacy result has no flag.
SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000002',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),'d2160001-0000-4000-8000-000000000002'::uuid,'overage service subject is real fixture actor');
SELECT is(public.check_ai_quota('property-valuation'),public.check_ai_quota_for_user(auth.uid(),'property-valuation'),'legacy status agrees before overage');
INSERT INTO pg_temp.quota_receipts VALUES('legacy-overage',public.reserve_ai_quota('property-valuation'));
SELECT is((SELECT result->>'allowed' FROM pg_temp.quota_receipts WHERE label='legacy-overage'),'true','legacy overage reservation succeeds');
SELECT is((SELECT result->>'used' FROM pg_temp.quota_receipts WHERE label='legacy-overage'),'6','legacy overage usage is six');
SELECT is((SELECT result->>'limit' FROM pg_temp.quota_receipts WHERE label='legacy-overage'),'6','legacy overage limit includes credit');
SELECT ok(NOT ((SELECT result FROM pg_temp.quota_receipts WHERE label='legacy-overage') ? 'addon_credit_consumed'),'legacy reservation still omits add-on flag');
SELECT is(public.check_ai_quota('property-valuation'),public.check_ai_quota_for_user(auth.uid(),'property-valuation'),'legacy status agrees after overage');
RESET ROLE;
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d2160002-0000-4000-8000-000000000002'),1,'normal usage trigger spent exactly one credit');
SELECT ok(EXISTS(SELECT 1 FROM public.usage_ai_calls WHERE id=(SELECT (result->>'reservation_id')::uuid FROM pg_temp.quota_receipts WHERE label='legacy-overage') AND user_id='d2160001-0000-4000-8000-000000000002' AND bucket='property-valuation'),'overage receipt names exact usage row');
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d2160001-0000-4000-8000-000000000002'),6,'overage inserted one row over seeded five');
SELECT is(pg_temp.quota_state(),pg_temp.expected_after_one((SELECT state FROM quota_snapshots WHERE label='pre-overage'),(SELECT (result->>'reservation_id')::uuid FROM quota_receipts WHERE label='legacy-overage'),'d2160002-0000-4000-8000-000000000002'),'full state after overage changes only named usage row and one purchase counter/touch');

-- Denied legacy paths preserve the entire scoped state, not only target rows.
INSERT INTO quota_snapshots VALUES('exhausted',pg_temp.quota_state());
SET LOCAL ROLE service_role;
SELECT is(public.reserve_ai_quota('property-valuation'),'{"allowed":false,"reason":"monthly_limit_reached","used":6,"limit":6}'::jsonb,'legacy exhausted reserve denied');
SELECT is(public.reserve_ai_quota('   ')->>'reason','invalid_bucket','legacy invalid bucket denied');
SELECT throws_ok($$SELECT public.record_ai_call('property-valuation')$$,'P0001','ai_call_monthly_limit_reached','legacy exhausted record raises');
RESET ROLE;
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='exhausted'),'full usage and purchase arrays unchanged after legacy denials');

-- Record still delegates to July legacy reserve. Its add-on key is JSON null.
INSERT INTO quota_snapshots VALUES('pre-record',pg_temp.quota_state());
SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000001',true);
SET LOCAL ROLE service_role;
INSERT INTO pg_temp.quota_receipts VALUES('legacy-record',public.record_ai_call('property-valuation'));
SELECT is((SELECT result FROM pg_temp.quota_receipts WHERE label='legacy-record'),'{"recorded":true,"used":2,"limit":5,"addon_credit_consumed":null}'::jsonb,'record returns exact legacy envelope including null add-on field');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d2160001-0000-4000-8000-000000000001'),2,'record inserted one distinct second attempt');
SELECT is(pg_temp.quota_state(),pg_temp.expected_after_one((SELECT state FROM quota_snapshots WHERE label='pre-record'),(SELECT id FROM public.usage_ai_calls WHERE user_id='d2160001-0000-4000-8000-000000000001' AND id<>(SELECT (result->>'reservation_id')::uuid FROM quota_receipts WHERE label='legacy-base'))),'full state after record has only one new usage row');

-- Direct service INSERT is denied by the installed table ACL before the trigger.
INSERT INTO quota_snapshots VALUES('service-insert',pg_temp.quota_state());
SELECT set_config('request.jwt.claim.sub','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$INSERT INTO public.usage_ai_calls(user_id,bucket) VALUES('d2160001-0000-4000-8000-000000000003','property-valuation')$$,'42501','permission denied for table usage_ai_calls','service direct usage insert has no table grant');
RESET ROLE;
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='service-insert'),'direct service denial preserved every usage and purchase row');

-- Fixture-owner normal INSERT reaches the installed cap trigger, with no bypass.
SELECT throws_ok($$INSERT INTO public.usage_ai_calls(user_id,bucket) VALUES('d2160001-0000-4000-8000-000000000003','property-valuation')$$,'P0001','ai_call_monthly_limit_reached','fixture-owner normal insert reaches cap trigger');
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='service-insert'),'trigger cap denial preserved every usage and purchase row');

-- Credit helper true/no-balance false are isolated in a savepoint.
SAVEPOINT helper_probe;
INSERT INTO quota_snapshots VALUES('helper-before',pg_temp.quota_state());
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'credit helper runs service/no-sub');
SELECT is(public.consume_addon_credit_for_user('d2160001-0000-4000-8000-000000000004','property-valuation'),true,'credit helper consumes sole eligible current-runtime purchase');
RESET ROLE;
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d2160002-0000-4000-8000-000000000004'),1,'credit helper incremented counter once');
SELECT is(pg_temp.quota_state(),pg_temp.expected_after_one((SELECT state FROM quota_snapshots WHERE label='helper-before'),NULL,'d2160002-0000-4000-8000-000000000004'),'full helper state changes only named purchase counter/touch');
INSERT INTO quota_snapshots VALUES('helper-consumed',pg_temp.quota_state());
SET LOCAL ROLE service_role;
SELECT is(public.consume_addon_credit_for_user('d2160001-0000-4000-8000-000000000004','property-valuation'),false,'credit helper returns false at zero balance');
RESET ROLE;
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='helper-consumed'),'helper false leaves full state unchanged');
ROLLBACK TO helper_probe;
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d2160002-0000-4000-8000-000000000004'),0,'savepoint restored direct helper consumption');

-- Browser-role EXECUTE denial is checked using actual roles and full state.
INSERT INTO quota_snapshots VALUES('browser',pg_temp.quota_state());
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid IN (
 'public.check_ai_quotas_for_user(uuid,text[])'::regprocedure,
 'public.reserve_ai_quota(text)'::regprocedure,
 'public.check_ai_quota_for_user(uuid,text)'::regprocedure,
 'public.check_ai_quota(text)'::regprocedure,
 'public.record_ai_call(text)'::regprocedure,
 'public.consume_addon_credit_for_user(uuid,text)'::regprocedure
) AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('authenticated',p.oid,'EXECUTE'))),'all public quota RPCs are service-only');
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reserve_ai_quota('property-valuation')$$,'42501','permission denied for function reserve_ai_quota','authenticated denied legacy reserve');
SELECT throws_ok($$SELECT public.record_ai_call('property-valuation')$$,'42501','permission denied for function record_ai_call','authenticated denied legacy record');
SELECT throws_ok($$SELECT public.check_ai_quota('property-valuation')$$,'42501','permission denied for function check_ai_quota','authenticated denied legacy status');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.check_ai_quotas_for_user('d2160001-0000-4000-8000-000000000001',ARRAY['property-valuation'])$$,'42501','permission denied for function check_ai_quotas_for_user','anon denied batch status');
SELECT throws_ok($$SELECT public.check_ai_quota_for_user('d2160001-0000-4000-8000-000000000001','property-valuation')$$,'42501','permission denied for function check_ai_quota_for_user','anon denied explicit status');
SELECT throws_ok($$SELECT public.consume_addon_credit_for_user('d2160001-0000-4000-8000-000000000004','property-valuation')$$,'42501','permission denied for function consume_addon_credit_for_user','anon denied credit helper');
RESET ROLE;
SELECT is(pg_temp.quota_state(),(SELECT state FROM quota_snapshots WHERE label='browser'),'browser denials preserve every usage and purchase row');
SELECT * FROM finish();
ROLLBACK;
SELECT current_user AS role_after, auth.uid() AS subject_after, current_setting('session_replication_role') AS replication_after,
 (SELECT count(*) FROM auth.users WHERE id::text LIKE 'd2160001-%') AS auth_residue,
 (SELECT count(*) FROM public.usage_ai_calls WHERE user_id::text LIKE 'd2160001-%') AS usage_residue,
 (SELECT count(*) FROM public.addon_purchases WHERE user_id::text LIKE 'd2160001-%') AS purchase_residue;
