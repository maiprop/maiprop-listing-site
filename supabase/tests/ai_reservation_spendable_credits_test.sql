-- All synthetic changes roll back; compatible with a shared pgTAP backend.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SELECT is(current_setting('session_replication_role'), 'origin', 'normal action triggers enabled');
SELECT set_config('request.jwt.claim.sub','',true), set_config('request.jwt.claim.role','service_role',true), set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email)
SELECT ('d1240001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'task24-'||n||'@example.test' FROM generate_series(1,6) n;
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user(('d1240001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, (CASE WHEN n=5 THEN 'developer' ELSE 'buyer' END)::public.user_role, CASE WHEN n=5 THEN 'developer' ELSE 'buyer' END,'Task24 synthetic','Athens') FROM generate_series(1,6) n;
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
-- A current durable investor subscription supplies real Pro entitlement; no pricing/limit changes.
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES('d1240001-0000-4000-8000-000000000003','private','active',now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
-- Synthetic admin fixture fact is inserted as postgres with normal triggers.
-- Admin elevation is deliberately not attributed to the buyer onboarding RPC.
DELETE FROM public.profiles WHERE user_id='d1240001-0000-4000-8000-000000000004';
INSERT INTO public.profiles(user_id,role) VALUES('d1240001-0000-4000-8000-000000000004','admin');

INSERT INTO public.addon_purchases(id,user_id,addon_key,module,audience,unit,quantity,checkout_mode,status,stripe_session_id,runtime_mode,livemode)
SELECT ('d1240002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('d1240001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'valuation_single','ai_valuation','participant','credit',2,'payment','paid','cs_task24_'||n,public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'
FROM generate_series(1,6) n;
INSERT INTO public.addon_purchases(id,user_id,addon_key,module,audience,unit,quantity,checkout_mode,status,stripe_session_id,runtime_mode,livemode)
VALUES
 ('d1240002-0000-4000-8000-000000000007','d1240001-0000-4000-8000-000000000001','neighbourhood_report_single','valuation_reports','participant','per_report',2,'payment','paid','cs_task24_neighbour',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d1240002-0000-4000-8000-000000000008','d1240001-0000-4000-8000-000000000001','valuation_single','ai_valuation','participant','credit',9,'payment','paid','cs_task24_opposite',CASE public.current_billing_runtime_mode() WHEN 'live' THEN 'test' ELSE 'live' END,public.current_billing_runtime_mode()<>'live');

SELECT is((SELECT sum(credits_granted)::integer FROM public.addon_purchases WHERE id::text LIKE 'd1240002-%'),23,'purchase trigger derives quantities including both mapped buckets');
SELECT ok(public.is_pro('d1240001-0000-4000-8000-000000000003'),'durable subscription grants Pro');
SELECT is(public.get_ai_call_monthly_base_limit('d1240001-0000-4000-8000-000000000003','property-valuation'),50,'real Pro base is 50');
SELECT is(public.get_ai_call_monthly_base_limit('d1240001-0000-4000-8000-000000000004','property-valuation'),999999,'admin sentinel unchanged');
SELECT is(public.get_ai_call_monthly_base_limit('d1240001-0000-4000-8000-000000000005','property-valuation'),0,'unpaid developer has no free base');
SELECT ok(NOT public.is_pro('d1240001-0000-4000-8000-000000000001'),'onboarded buyer remains free');

CREATE TEMP TABLE task24_receipts(actor uuid,bucket text,result jsonb);
GRANT INSERT ON task24_receipts TO service_role;
-- Invoker helper uses installed routines; privileged row verification follows RESET ROLE.
CREATE FUNCTION pg_temp.task24_steps(actor uuid,bucket text,expected_limit integer,steps integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE n integer; before_status jsonb; after_status jsonb; result jsonb; available integer; used_before integer; consumed boolean;
BEGIN
 IF current_user<>'service_role' OR auth.uid() IS NOT NULL OR auth.role()<>'service_role' THEN RAISE EXCEPTION 'actual service/no-sub required'; END IF;
 FOR n IN 1..steps LOOP
  before_status:=public.check_ai_quotas_for_user(actor,ARRAY[bucket])->bucket;
  available:=public.get_available_addon_credits(actor,bucket);
  used_before:=(before_status->>'used')::integer;
  result:=public.reserve_ai_quota_for_user(actor,bucket);
  after_status:=public.check_ai_quotas_for_user(actor,ARRAY[bucket])->bucket;
  RAISE NOTICE 'actor=% bucket=% step=% before=% result=% after=% remaining=%',actor,bucket,n,before_status,result,after_status,public.get_available_addon_credits(actor,bucket);
  IF (result->>'allowed')::boolean IS DISTINCT FROM (before_status->>'allowed')::boolean OR (result->>'limit')::integer<>expected_limit OR (after_status->>'limit')::integer<>expected_limit THEN RAISE EXCEPTION 'status/reservation ceiling disagreement'; END IF;
  IF (result->>'allowed')::boolean THEN
   consumed:=used_before>=public.get_ai_call_monthly_base_limit(actor,bucket) AND public.get_ai_call_monthly_base_limit(actor,bucket)<999999;
   IF (result->>'used')::integer<>used_before+1 OR (after_status->>'used')::integer<>used_before+1 OR (result->>'addon_credit_consumed')::boolean IS DISTINCT FROM consumed OR public.get_available_addon_credits(actor,bucket)<>available-consumed::integer THEN RAISE EXCEPTION 'success consumption mismatch'; END IF;
   INSERT INTO pg_temp.task24_receipts VALUES(actor,bucket,result);
  ELSE
   IF after_status<>before_status OR (result->>'used')::integer<>used_before OR public.get_available_addon_credits(actor,bucket)<>available OR result ? 'reservation_id' THEN RAISE EXCEPTION 'denial mutated state'; END IF;
  END IF;
 END LOOP;
END $$;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000002','property-valuation',7,1)$$,'other actor retains independent usage and credits');
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000001','property-valuation',7,8)$$,'two normal valuation credits admit calls 6 and 7; call 8 denies, with status agreement at every step');
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000001','neighbourhood-report',7,8)$$,'second mapped bucket spends both normal credits and exhausts');
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000003','property-valuation',52,2)$$,'durable Pro stays below its base without consuming add-ons');
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000004','property-valuation',999999,2)$$,'admin sentinel does not grow or consume add-ons');
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000005','property-valuation',2,3)$$,'unpaid Pro-only audience can spend purchased credits but receives no free allowance');
SELECT is(public.reserve_ai_quota_for_user(NULL,'property-valuation'),' {"allowed":false,"reason":"not_authenticated","used":0,"limit":0}'::jsonb,'null actor envelope retained');
SELECT is(public.reserve_ai_quota_for_user('d1240001-0000-4000-8000-000000000001',NULL)->>'reason','invalid_bucket','null bucket rejected');
SELECT is(public.reserve_ai_quota_for_user('d1240001-0000-4000-8000-000000000001','  ')->>'reason','invalid_bucket','blank bucket rejected');
SELECT is(public.reserve_ai_quota_for_user('d1240001-0000-4000-8000-000000000001',repeat('x',121))->>'reason','invalid_bucket','oversized bucket rejected');
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000001','unknown-bucket',0,1)$$,'unknown valid bucket denied consistently by existing helpers');
RESET ROLE;
SELECT is((SELECT count(DISTINCT id)::integer FROM public.usage_ai_calls WHERE user_id='d1240001-0000-4000-8000-000000000001'),14,'two explicit paid-attempt calls produce distinct usage rows in each bucket');
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d1240002-0000-4000-8000-000000000008'),0,'opposite runtime purchase untouched');
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d1240002-0000-4000-8000-000000000002'),0,'other actor credits untouched');
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d1240001-0000-4000-8000-000000000002'),1,'other actor usage preserved');
CREATE TEMP TABLE task24_denial_snapshot AS
SELECT (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.usage_ai_calls u WHERE user_id='d1240001-0000-4000-8000-000000000001') AS usage_rows,
 (SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.addon_purchases p WHERE user_id='d1240001-0000-4000-8000-000000000001') AS purchase_rows;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000001','property-valuation',7,2)$$,'repeated exhausted reservations remain denied');
RESET ROLE;
SELECT is((SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.usage_ai_calls u WHERE user_id='d1240001-0000-4000-8000-000000000001'),(SELECT usage_rows FROM task24_denial_snapshot),'denials preserve every usage row field');
SELECT is((SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.addon_purchases p WHERE user_id='d1240001-0000-4000-8000-000000000001'),(SELECT purchase_rows FROM task24_denial_snapshot),'denials preserve every purchase row field');
-- Generate historical consumption through the real trigger, then age those synthetic facts.
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000006','property-valuation',7,6)$$,'historical fixture consumes first credit through normal overage trigger');
RESET ROLE;
UPDATE public.usage_ai_calls SET created_at=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '1 day' WHERE user_id='d1240001-0000-4000-8000-000000000006';
UPDATE public.addon_purchases SET created_at=(date_trunc('month',now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')-interval '2 days' WHERE id='d1240002-0000-4000-8000-000000000006';
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000006','property-valuation',6,5)$$,'prior month usage excluded and consumed credit stays deducted');
RESET ROLE;
SAVEPOINT overage_rollback;
SET LOCAL ROLE service_role;
SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000006','property-valuation',6,1);
RESET ROLE;
ROLLBACK TO overage_rollback;
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d1240001-0000-4000-8000-000000000006'),11,'savepoint restores usage after successful overage');
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d1240002-0000-4000-8000-000000000006'),1,'savepoint restores credit consumption');
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT pg_temp.task24_steps('d1240001-0000-4000-8000-000000000006','property-valuation',6,2)$$,'remaining historical credit succeeds once then denies, never restored by month boundary');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.reserve_ai_quota_for_user('d1240001-0000-4000-8000-000000000001','property-valuation')$$,'42501','permission denied for function reserve_ai_quota_for_user','authenticated cannot execute explicit actor reservation');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.reserve_ai_quota_for_user('d1240001-0000-4000-8000-000000000001','property-valuation')$$,'42501','permission denied for function reserve_ai_quota_for_user','anon cannot execute explicit actor reservation');
RESET ROLE;
SELECT ok(NOT EXISTS(SELECT 1 FROM pg_temp.task24_receipts r LEFT JOIN public.usage_ai_calls u ON u.id=(r.result->>'reservation_id')::uuid AND u.user_id=r.actor AND u.bucket=r.bucket WHERE u.id IS NULL),'every successful return names its exact persisted actor/bucket usage row');
SELECT * FROM finish();
ROLLBACK;
-- No TAP state, temp helpers or fixture records survive into another test.
SELECT 'task24 residue', (SELECT count(*) FROM auth.users WHERE id::text LIKE 'd1240001-%')+(SELECT count(*) FROM public.profiles WHERE user_id::text LIKE 'd1240001-%')+(SELECT count(*) FROM public.profiles_public WHERE user_id::text LIKE 'd1240001-%')+(SELECT count(*) FROM public.addon_purchases WHERE user_id::text LIKE 'd1240001-%')+(SELECT count(*) FROM public.usage_ai_calls WHERE user_id::text LIKE 'd1240001-%')+(SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1240001-%')+(SELECT count(*) FROM public.investor_subscriptions WHERE user_id::text LIKE 'd1240001-%');
