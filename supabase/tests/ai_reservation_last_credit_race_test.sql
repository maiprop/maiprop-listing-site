\set ON_ERROR_STOP on
\pset pager off
-- Commits synthetic fixtures: the controlling runner must explicitly select its
-- authorized disposable database with SET maiprop.test_disposable_database='...'.
-- Never derive that setting from current_database() or set it for a shared baseline.
DO $$ DECLARE expected_database text := current_setting('maiprop.test_disposable_database',true); BEGIN
 IF expected_database IS NULL OR expected_database='' OR current_database()<>expected_database
    OR inet_server_addr() IS NOT NULL
    OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921')
 THEN RAISE EXCEPTION 'Explicit matching disposable socket database required'; END IF;
 IF current_setting('session_replication_role')<>'origin' THEN RAISE EXCEPTION 'Normal triggers required'; END IF;
 IF EXISTS(SELECT 1 FROM auth.users WHERE id='d1241001-0000-4000-8000-000000000001') THEN RAISE EXCEPTION 'Fixture collision'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE EXTENSION IF NOT EXISTS dblink;
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO auth.users(id,email) VALUES('d1241001-0000-4000-8000-000000000001','task24-race@example.test');
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d1241001-0000-4000-8000-000000000001','buyer','buyer');
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
INSERT INTO public.addon_purchases(id,user_id,addon_key,module,audience,unit,quantity,checkout_mode,status,stripe_session_id,runtime_mode,livemode)
VALUES('d1241002-0000-4000-8000-000000000001','d1241001-0000-4000-8000-000000000001','valuation_single','ai_valuation','participant','credit',1,'payment','paid','cs_task24_race',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SET LOCAL ROLE service_role;
DO $$ DECLARE n integer; r jsonb; BEGIN
 IF auth.uid() IS NOT NULL OR current_user<>'service_role' THEN RAISE EXCEPTION 'service/no-sub required'; END IF;
 IF public.get_ai_call_monthly_base_limit('d1241001-0000-4000-8000-000000000001','property-valuation')<>5 THEN RAISE EXCEPTION 'Expected actual base5'; END IF;
 FOR n IN 1..5 LOOP
  r:=public.reserve_ai_quota_for_user('d1241001-0000-4000-8000-000000000001','property-valuation');
  IF (r->>'allowed')::boolean IS DISTINCT FROM true OR (r->>'addon_credit_consumed')::boolean IS DISTINCT FROM false THEN RAISE EXCEPTION 'base seed failed'; END IF;
 END LOOP;
END $$;
RESET ROLE;
COMMIT;

BEGIN;
SET LOCAL statement_timeout='20s';
SELECT plan(14);
CREATE TEMP TABLE task24_race_results(session text,result jsonb);
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d1241002-0000-4000-8000-000000000001'),0,'committed normal fixture has one remaining credit');
SELECT dblink_connect('task24_a','host=/var/run/postgresql port=5432 dbname='||current_database());
SELECT dblink_connect('task24_b','host=/var/run/postgresql port=5432 dbname='||current_database());
SELECT dblink_exec('task24_a',$$BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL application_name='task24_ai_a'; SET ROLE service_role; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{"role":"service_role"}'$$);
SELECT dblink_exec('task24_b',$$BEGIN; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='5s'; SET LOCAL idle_in_transaction_session_timeout='30s'; SET LOCAL application_name='task24_ai_b'; SET ROLE service_role; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{"role":"service_role"}'$$);
SELECT ok((SELECT valid FROM dblink('task24_a',$$SELECT current_user='service_role' AND auth.uid() IS NULL AND auth.role()='service_role' AND current_setting('session_replication_role')='origin'$$) AS t(valid boolean)),'session A is actual service/no-sub with normal triggers');
SELECT ok((SELECT valid FROM dblink('task24_b',$$SELECT current_user='service_role' AND auth.uid() IS NULL AND auth.role()='service_role' AND current_setting('session_replication_role')='origin'$$) AS t(valid boolean)),'session B is actual service/no-sub with normal triggers');
INSERT INTO task24_race_results SELECT 'a',result FROM dblink('task24_a',$$SELECT public.reserve_ai_quota_for_user('d1241001-0000-4000-8000-000000000001','property-valuation')$$) AS t(result jsonb);
SELECT ok((SELECT (result->>'allowed')::boolean AND (result->>'addon_credit_consumed')::boolean FROM task24_race_results WHERE session='a'),'A reserves last credit and holds transaction');
SELECT is(dblink_send_query('task24_b',$$SELECT public.reserve_ai_quota_for_user('d1241001-0000-4000-8000-000000000001','property-valuation')$$),1,'B starts competing reservation');
-- Bounded polling detects actual advisory wait, never infers contention from timing.
DO $$ DECLARE n integer; BEGIN
 FOR n IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  EXIT WHEN EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name='task24_ai_b' AND wait_event_type='Lock' AND wait_event='advisory');
  PERFORM pg_sleep(0.01);
 END LOOP;
END $$;
SELECT is(dblink_is_busy('task24_b'),1,'B remains busy while A owns reservation transaction');
SELECT ok(EXISTS(SELECT 1 FROM pg_stat_activity b JOIN pg_stat_activity a ON a.pid=ANY(pg_blocking_pids(b.pid)) WHERE a.datname=current_database() AND b.datname=current_database() AND a.application_name='task24_ai_a' AND b.application_name='task24_ai_b' AND b.wait_event_type='Lock' AND b.wait_event='advisory'),'observer proves B advisory wait blocked by A');
SELECT a.pid AS winner_pid,b.pid AS contender_pid,b.wait_event_type,b.wait_event,pg_blocking_pids(b.pid) AS blocking_pids FROM pg_stat_activity b JOIN pg_stat_activity a ON a.pid=ANY(pg_blocking_pids(b.pid)) WHERE a.application_name='task24_ai_a' AND b.application_name='task24_ai_b';
SELECT dblink_exec('task24_a','COMMIT');
INSERT INTO task24_race_results SELECT 'b',result FROM dblink_get_result('task24_b') AS t(result jsonb);
SELECT count(*) FROM dblink_get_result('task24_b') AS t(result jsonb);
SELECT dblink_exec('task24_b','ROLLBACK');
SELECT is((SELECT result FROM task24_race_results WHERE session='b'),'{"allowed":false,"reason":"monthly_limit_reached","used":6,"limit":6}'::jsonb,'B denies after A commits last credit');
SELECT is((SELECT count(*)::integer FROM public.usage_ai_calls WHERE user_id='d1241001-0000-4000-8000-000000000001'),6,'exactly one additional committed usage row');
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d1241002-0000-4000-8000-000000000001'),1,'exactly one committed credit consumption');
SELECT ok(EXISTS(SELECT 1 FROM public.usage_ai_calls WHERE id=(SELECT (result->>'reservation_id')::uuid FROM task24_race_results WHERE session='a') AND user_id='d1241001-0000-4000-8000-000000000001' AND bucket='property-valuation'),'winning returned reservation id matches committed usage');
SELECT dblink_exec('task24_a',$$BEGIN; SET LOCAL request.jwt.claim.sub=''; SET LOCAL request.jwt.claim.role='service_role'; SET LOCAL request.jwt.claims='{"role":"service_role"}'; SET LOCAL statement_timeout='15s'$$);
SELECT is((SELECT result FROM dblink('task24_a',$$SELECT public.check_ai_quotas_for_user('d1241001-0000-4000-8000-000000000001',ARRAY['property-valuation'])->'property-valuation'$$) AS t(result jsonb)),'{"allowed":false,"reason":"monthly_limit_reached","used":6,"limit":6}'::jsonb,'batch status confirms committed exhaustion');
SELECT dblink_exec('task24_a','ROLLBACK');
TABLE task24_race_results;
SELECT dblink_disconnect('task24_a');
SELECT dblink_disconnect('task24_b');
SELECT ok(COALESCE(array_length(dblink_get_connections(),1),0)=0,'both dblink sessions disconnected');
DO $$ DECLARE n integer; BEGIN
 FOR n IN 1..100 LOOP
  PERFORM pg_stat_clear_snapshot();
  EXIT WHEN NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('task24_ai_a','task24_ai_b'));
  PERFORM pg_sleep(0.01);
 END LOOP;
END $$;
SELECT is((SELECT count(*)::integer FROM pg_stat_activity WHERE datname=current_database() AND application_name IN ('task24_ai_a','task24_ai_b')),0,'no remote task24 sessions remain');
SELECT * FROM finish();
ROLLBACK;

-- Exact committed synthetic cleanup, with normal delete triggers.
BEGIN;
DELETE FROM public.usage_ai_calls WHERE user_id='d1241001-0000-4000-8000-000000000001';
DELETE FROM public.addon_purchases WHERE id='d1241002-0000-4000-8000-000000000001';
DELETE FROM public.notifications WHERE user_id='d1241001-0000-4000-8000-000000000001';
DELETE FROM public.profiles WHERE user_id='d1241001-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id='d1241001-0000-4000-8000-000000000001';
COMMIT;
SELECT 'task24 race residue', (SELECT count(*) FROM auth.users WHERE id='d1241001-0000-4000-8000-000000000001')+(SELECT count(*) FROM public.profiles WHERE user_id='d1241001-0000-4000-8000-000000000001')+(SELECT count(*) FROM public.profiles_public WHERE user_id='d1241001-0000-4000-8000-000000000001')+(SELECT count(*) FROM public.addon_purchases WHERE user_id='d1241001-0000-4000-8000-000000000001')+(SELECT count(*) FROM public.usage_ai_calls WHERE user_id='d1241001-0000-4000-8000-000000000001')+(SELECT count(*) FROM public.notifications WHERE user_id='d1241001-0000-4000-8000-000000000001');
