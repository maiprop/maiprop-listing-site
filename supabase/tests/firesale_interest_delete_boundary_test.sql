\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR current_user IS DISTINCT FROM 'postgres'
    OR inet_server_addr() IS NOT NULL
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'Explicit matching disposable socket database with normal triggers required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain active');

INSERT INTO auth.users(id,email) VALUES
 ('d3190001-0000-4000-8000-000000000001','d3-delete-seller@example.test'),
 ('d3190001-0000-4000-8000-000000000002','d3-delete-investor-one@example.test'),
 ('d3190001-0000-4000-8000-000000000003','d3-delete-investor-two@example.test'),
 ('d3190001-0000-4000-8000-000000000004','kr@maiprop.co');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3190001-0000-4000-8000-000000000004'),
 'admin','authoritative admin constructed by owner auth trigger');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d3190001-0000-4000-8000-000000000001','seller','seller');
SELECT public.complete_onboarding_role_for_user('d3190001-0000-4000-8000-000000000002','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d3190001-0000-4000-8000-000000000003','buyer','buyer');
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES
 ('d3190001-0000-4000-8000-000000000002','private','pending_payment',now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d3190001-0000-4000-8000-000000000003','private','pending_payment',now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
UPDATE public.investor_subscriptions SET status='active' WHERE user_id IN
 ('d3190001-0000-4000-8000-000000000002','d3190001-0000-4000-8000-000000000003');
INSERT INTO public.firesale_requests(id,user_id,address,city,sqm,condition,contact_email,asking_price)
VALUES
 ('d3190002-0000-4000-8000-000000000001','d3190001-0000-4000-8000-000000000001','D3 delete deal one','Athens',75,'good','d3-delete-seller@example.test',350000),
 ('d3190002-0000-4000-8000-000000000002','d3190001-0000-4000-8000-000000000001','D3 delete deal two','Athens',76,'good','d3-delete-seller@example.test',360000);
SELECT * FROM public.admin_set_firesale_investor_publication_for_user('d3190001-0000-4000-8000-000000000004','d3190002-0000-4000-8000-000000000001',true);
SELECT * FROM public.admin_set_firesale_investor_publication_for_user('d3190001-0000-4000-8000-000000000004','d3190002-0000-4000-8000-000000000002',true);
SELECT public.submit_firesale_interest_for_user('d3190001-0000-4000-8000-000000000002','d3190002-0000-4000-8000-000000000001','one',NULL,NULL);
SELECT public.submit_firesale_interest_for_user('d3190001-0000-4000-8000-000000000003','d3190002-0000-4000-8000-000000000002','two',NULL,NULL);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.firesale_interest WHERE deal_id::text LIKE 'd3190002-%'),2,'two real interests created');
SELECT is((SELECT count(*)::integer FROM public.firesale_interest_audit_log WHERE deal_id::text LIKE 'd3190002-%'),2,'two normal INSERT audit rows created');
SET LOCAL ROLE service_role;
SELECT public.submit_firesale_interest_for_user('d3190001-0000-4000-8000-000000000002','d3190002-0000-4000-8000-000000000001','one updated',100000,NULL);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.firesale_interest_audit_log
 WHERE deal_id='d3190002-0000-4000-8000-000000000001' AND action='status_changed'
 AND from_status='interested' AND to_status='prioritized'),
 1,'normal UPDATE audit remains active');

CREATE FUNCTION pg_temp.d3_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3190001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3190001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3190001-%'),
  'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)),'{}'::jsonb) FROM public.investor_subscriptions s WHERE user_id::text LIKE 'd3190001-%'),
  'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)),'{}'::jsonb) FROM public.firesale_requests r WHERE id::text LIKE 'd3190002-%'),
  'feed',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(f)),'{}'::jsonb) FROM public.firesale_requests_investor_feed f WHERE id::text LIKE 'd3190002-%'),
  'interest',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}'::jsonb) FROM public.firesale_interest i WHERE deal_id::text LIKE 'd3190002-%'),
  'audit',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.firesale_interest_audit_log a WHERE deal_id::text LIKE 'd3190002-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n)
 )
$$;
CREATE FUNCTION pg_temp.d3_drop_key(s jsonb,part text,k text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[part],(s->part)-k,false)
$$;
CREATE FUNCTION pg_temp.d3_drop_matching(s jsonb,part text,field text,match_value text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[part],
  (SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb)
   FROM jsonb_each(s->part) e WHERE e.value->>field IS DISTINCT FROM match_value),false)
$$;
CREATE TEMP TABLE d3_delete_before AS SELECT pg_temp.d3_state() state;
CREATE TEMP TABLE d3_delete_outcomes(action text,sqlstate text,constraint_name text,message text,affected integer);
GRANT INSERT ON d3_delete_outcomes TO service_role;

-- Exact Edge rollback predicate under service/no subject; capture a failure without aborting the test transaction.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
DO $$ DECLARE v_rows integer; v_state text; v_constraint text; v_message text; BEGIN
 BEGIN
  DELETE FROM public.firesale_requests
  WHERE id='d3190002-0000-4000-8000-000000000001'
    AND user_id='d3190001-0000-4000-8000-000000000001';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO d3_delete_outcomes VALUES('owned_rollback',NULL,NULL,NULL,v_rows);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_constraint=CONSTRAINT_NAME,v_message=MESSAGE_TEXT;
  INSERT INTO d3_delete_outcomes VALUES('owned_rollback',v_state,v_constraint,v_message,NULL);
 END;
END $$;
RESET ROLE;
SELECT * FROM d3_delete_outcomes WHERE action='owned_rollback';
SELECT is((SELECT sqlstate FROM d3_delete_outcomes WHERE action='owned_rollback'),NULL::text,'interest-bearing owned rollback succeeds');
SELECT is((SELECT affected FROM d3_delete_outcomes WHERE action='owned_rollback'),1,'owned rollback deletes exactly one request');
SELECT is(pg_temp.d3_state(),
 (SELECT CASE WHEN (SELECT sqlstate FROM d3_delete_outcomes WHERE action='owned_rollback') IS NULL THEN
  pg_temp.d3_drop_matching(pg_temp.d3_drop_matching(
   pg_temp.d3_drop_key(pg_temp.d3_drop_key(state,'requests','d3190002-0000-4000-8000-000000000001'),
    'feed','d3190002-0000-4000-8000-000000000001'),
   'interest','deal_id','d3190002-0000-4000-8000-000000000001'),
   'audit','deal_id','d3190002-0000-4000-8000-000000000001')
 ELSE state END FROM d3_delete_before),
 'owned rollback removes only request/feed/interest/audit for its deal; failure leaves full graph unchanged');

-- SQL analogue of auth.admin.deleteUser: privileged auth row removal, normal profile/interest cascades.
CREATE TEMP TABLE d3_account_before AS SELECT pg_temp.d3_state() state;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true);
DO $$ DECLARE v_rows integer; v_state text; v_constraint text; v_message text; BEGIN
 BEGIN
  DELETE FROM auth.users WHERE id='d3190001-0000-4000-8000-000000000003';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  INSERT INTO d3_delete_outcomes VALUES('investor_auth_cascade',NULL,NULL,NULL,v_rows);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_constraint=CONSTRAINT_NAME,v_message=MESSAGE_TEXT;
  INSERT INTO d3_delete_outcomes VALUES('investor_auth_cascade',v_state,v_constraint,v_message,NULL);
 END;
END $$;
SELECT * FROM d3_delete_outcomes WHERE action='investor_auth_cascade';
SELECT is((SELECT sqlstate FROM d3_delete_outcomes WHERE action='investor_auth_cascade'),NULL::text,'investor auth cascade succeeds');
SELECT is((SELECT affected FROM d3_delete_outcomes WHERE action='investor_auth_cascade'),1,'investor auth cascade deletes exactly one user');
CREATE TEMP TABLE d3_account_expected AS
 SELECT CASE WHEN (SELECT sqlstate FROM d3_delete_outcomes WHERE action='investor_auth_cascade') IS NULL THEN
  pg_temp.d3_drop_matching(pg_temp.d3_drop_matching(pg_temp.d3_drop_matching(
   pg_temp.d3_drop_key(pg_temp.d3_drop_key(pg_temp.d3_drop_key(state,
    'auth','d3190001-0000-4000-8000-000000000003'),
    'profiles','d3190001-0000-4000-8000-000000000003'),
    'profiles_public','d3190001-0000-4000-8000-000000000003'),
   'interest','investor_id','d3190001-0000-4000-8000-000000000003'),
   'notifications','user_id','d3190001-0000-4000-8000-000000000003'),
   'audit','interest_id',
    (SELECT e.key FROM jsonb_each(state->'interest') e
     WHERE e.value->>'investor_id'='d3190001-0000-4000-8000-000000000003'))
 ELSE state END AS state FROM d3_account_before;
SELECT part, (actual.value=expected.value) AS exact,
 (SELECT coalesce(jsonb_agg(k),'[]'::jsonb) FROM (
  SELECT key AS k FROM jsonb_each(actual.value)
  EXCEPT SELECT key FROM jsonb_each(expected.value)
 ) x) AS unexpected_keys,
 (SELECT coalesce(jsonb_agg(k),'[]'::jsonb) FROM (
  SELECT key AS k FROM jsonb_each(expected.value)
  EXCEPT SELECT key FROM jsonb_each(actual.value)
 ) x) AS missing_keys
FROM jsonb_each(pg_temp.d3_state()) actual(part,value)
JOIN jsonb_each((SELECT state FROM d3_account_expected)) expected(part,value) USING(part)
WHERE actual.value <> expected.value;
SELECT is(pg_temp.d3_state(),(SELECT state FROM d3_account_expected),
 'investor auth cascade removes only user/profile/interest/audit/notices and retains unrelated graph and unlinked subscription');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers stayed enabled');
SELECT * FROM finish();
ROLLBACK;
