\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR inet_server_addr() IS NOT NULL
    OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921','maiprop_t12q_20260930_source')
  THEN RAISE EXCEPTION 'Explicit matching disposable socket database required'; END IF;
  IF current_setting('session_replication_role') <> 'origin' THEN RAISE EXCEPTION 'Normal triggers required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(14);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers are enabled');
SELECT ok(NOT EXISTS (SELECT 1 FROM unnest(ARRAY['anon','authenticated']) AS r
  WHERE has_table_privilege(r,'public.subscription_trial_claims','INSERT,UPDATE,DELETE')
  OR has_any_column_privilege(r,'public.subscription_trial_claims','INSERT,UPDATE')),
  'browser roles have no effective trial envelope write privilege');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.subscription_trial_claims'::regclass),'trial claims have RLS');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000000731','trial-cas-731@example.invalid'),
 ('00000000-0000-4000-8000-000000000732','trial-cas-732@example.invalid');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id IN ('00000000-0000-4000-8000-000000000731','00000000-0000-4000-8000-000000000732')),2,'normal auth triggers created both profiles');
SET LOCAL ROLE service_role;
SELECT lives_ok($q$
INSERT INTO public.subscription_trial_claims(id,user_id,plan_key,pricing_audience,stripe_customer_id,runtime_mode,livemode,status,metadata)
VALUES ('00000000-0000-4000-8000-000000000733','00000000-0000-4000-8000-000000000731','pro','participant','cus_local_trial_cas','test',false,'checkout_started',
 '{"trial_days":"7","checkout_operation_v1":{"revision":"00000000-0000-4000-8000-000000000734","dispatch_count":0,"key":"local-only"}}')
$q$,'service creates the durable trial reservation with normal triggers');
WITH changed AS (
  UPDATE public.subscription_trial_claims SET metadata=jsonb_set(jsonb_set(metadata,'{checkout_operation_v1,revision}','"00000000-0000-4000-8000-000000000735"'),'{checkout_operation_v1,dispatch_count}','1')
  WHERE id='00000000-0000-4000-8000-000000000733' AND user_id='00000000-0000-4000-8000-000000000731'
    AND runtime_mode='test' AND livemode=false AND stripe_customer_id='cus_local_trial_cas'
    AND status='checkout_started' AND stripe_subscription_id IS NULL AND stripe_checkout_session_id IS NULL
    AND metadata->'checkout_operation_v1'->>'revision'='00000000-0000-4000-8000-000000000734'
    AND metadata->'checkout_operation_v1'->>'dispatch_count'='0' RETURNING *)
SELECT is((SELECT count(*)::integer FROM changed),1,'first full identity revision/count CAS wins');
WITH changed AS (
  UPDATE public.subscription_trial_claims SET metadata='{}'
  WHERE id='00000000-0000-4000-8000-000000000733'
    AND metadata->'checkout_operation_v1'->>'revision'='00000000-0000-4000-8000-000000000734' RETURNING *)
SELECT is((SELECT count(*)::integer FROM changed),0,'stale revision returns zero rows without overwriting envelope');
WITH changed AS (
  DELETE FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733'
    AND user_id='00000000-0000-4000-8000-000000000732' AND runtime_mode='test'
    AND metadata->'checkout_operation_v1'->>'revision'='00000000-0000-4000-8000-000000000735' RETURNING *)
SELECT is((SELECT count(*)::integer FROM changed),0,'wrong actor cannot delete reservation');
SELECT throws_ok($q$
  INSERT INTO public.subscription_trial_claims(user_id,plan_key,pricing_audience,runtime_mode,livemode)
  VALUES ('00000000-0000-4000-8000-000000000731','pro','participant','test',false)
$q$,'23505',NULL,'unique index prevents a second non-abandoned trial');
UPDATE public.subscription_trial_claims SET stripe_subscription_id='sub_local_trial',status='trialing'
  WHERE id='00000000-0000-4000-8000-000000000733';
WITH changed AS (
  UPDATE public.subscription_trial_claims SET status='checkout_abandoned'
  WHERE id='00000000-0000-4000-8000-000000000733' AND status='checkout_started'
    AND stripe_subscription_id IS NULL AND stripe_checkout_session_id IS NULL RETURNING *)
SELECT is((SELECT count(*)::integer FROM changed),0,'late pending expiry cannot abandon a consumed trial');
SELECT is((SELECT metadata->'checkout_operation_v1'->>'key' FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733'),'local-only','original operation key survives updates');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000731',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000731"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733'),1,'owner reads own claim');
SELECT throws_ok($q$
  UPDATE public.subscription_trial_claims SET metadata='{}' WHERE id='00000000-0000-4000-8000-000000000733'
$q$,'42501','permission denied for table subscription_trial_claims','authenticated actor cannot alter operation envelope');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000732',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000732"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.subscription_trial_claims WHERE id='00000000-0000-4000-8000-000000000733'),0,'other actor cannot read claim');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
