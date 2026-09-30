BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(43);

-- The fixture replaces only the local pg_net stub inside this rolled-back test.
CREATE TABLE net.t12b1_capture (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url text NOT NULL,
  headers jsonb NOT NULL,
  body jsonb NOT NULL,
  timeout_milliseconds integer NOT NULL
);
CREATE OR REPLACE FUNCTION net.http_post(url text,headers jsonb DEFAULT '{}'::jsonb,
  body jsonb DEFAULT '{}'::jsonb,timeout_milliseconds integer DEFAULT 1000)
RETURNS bigint LANGUAGE plpgsql AS $stub$
DECLARE v_id bigint;
BEGIN
  IF url LIKE '%fail.invalid%' THEN RAISE EXCEPTION 'synthetic_enqueue_failure'; END IF;
  INSERT INTO net.t12b1_capture(url,headers,body,timeout_milliseconds)
    VALUES(url,headers,body,timeout_milliseconds) RETURNING id INTO v_id;
  RETURN v_id;
END;
$stub$;

SELECT has_table('public','scheduled_http_dispatches','scheduled dispatch trace exists'); -- 1
SELECT has_column('public','sync_log','dispatch_id','poll outcome can link dispatch'); -- 2
SELECT ok(NOT has_table_privilege('anon','public.scheduled_http_dispatches','SELECT'),'anon has no trace read'); -- 3
SELECT ok(NOT has_function_privilege('authenticated','public.start_scheduled_http_dispatch_for_service(uuid,text)','EXECUTE'),'client cannot start'); -- 4
SELECT ok(NOT has_function_privilege('service_role','private.invoke_scheduled_followups_cron()','EXECUTE'),'followup invoker retains postgres-only ACL'); -- 5

SET LOCAL ROLE anon;
SELECT throws_ok('SELECT * FROM public.scheduled_http_dispatches LIMIT 1','42501','permission denied for table scheduled_http_dispatches','anon actual table read denied'); -- 6
SELECT throws_ok('SELECT public.start_scheduled_http_dispatch_for_service(NULL,''poll_os_auctions'')','42501','permission denied for function start_scheduled_http_dispatch_for_service','anon actual start denied'); -- 7
RESET ROLE;

SELECT pg_catalog.set_config('app.settings.cron_secret','synthetic-secret',true);
SELECT pg_catalog.set_config('app.settings.supabase_url','https://source.invalid',true);
SELECT lives_ok('SELECT private.invoke_poll_os_auctions_cron()','poll enqueues'); -- 8
SELECT is((SELECT count(*)::integer FROM public.scheduled_http_dispatches d JOIN net.t12b1_capture c
  ON c.id=d.net_request_id WHERE d.integration='poll_os_auctions' AND c.headers->>'x-maiprop-dispatch-id'=d.dispatch_id::text),1,'poll dispatch equals net ID and header'); -- 9
SELECT is((SELECT pg_catalog.jsonb_build_object('body',body,'timeout',timeout_milliseconds)
  FROM net.t12b1_capture WHERE url LIKE '%poll-os-auctions'),
  '{"body":{"pageSize":600,"sampleAcrossGreece":true,"sortBy":"AUCTION_DATE","order":"ASC","source":"daily-canonical-pool"},"timeout":120000}'::jsonb,'poll body and timeout preserved'); -- 10
SELECT lives_ok('SELECT private.invoke_scheduled_followups_cron()','followup enqueues'); -- 11
SELECT is((SELECT pg_catalog.jsonb_build_object('body',body,'timeout',timeout_milliseconds,'secret',headers->>'x-cron-secret')
  FROM net.t12b1_capture WHERE url LIKE '%scheduled-followups'),
  '{"body":{},"timeout":60000,"secret":"synthetic-secret"}'::jsonb,'followup auth, body and timeout preserved'); -- 12
SELECT lives_ok('SELECT public.invoke_send_saved_search_alerts_cron()','saved alerts enqueue'); -- 13
SELECT ok((SELECT CASE
  WHEN pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n'))='05481c2968907e6d6f9c8f500020e6db'
    THEN c.url='https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/send-saved-search-alerts'
  ELSE c.url='https://source.invalid/functions/v1/send-saved-search-alerts' END
  FROM net.t12b1_capture c CROSS JOIN pg_catalog.pg_proc p
  WHERE p.oid='public.invoke_send_saved_search_alerts_cron()'::regprocedure
    AND c.url LIKE '%send-saved-search-alerts'),
  'saved alert keeps captured fixed or source dynamic endpoint'); -- 14
SELECT is((SELECT pg_catalog.jsonb_build_object('body',body,'timeout',timeout_milliseconds,'auth',headers->>'Authorization')
  FROM net.t12b1_capture WHERE url LIKE '%send-saved-search-alerts'),
  '{"body":{},"timeout":1000,"auth":"Bearer synthetic-secret"}'::jsonb,'saved alert implicit timeout and bearer preserved'); -- 15

CREATE TEMP TABLE t12b1_before_rollback AS
SELECT (SELECT count(*) FROM net.t12b1_capture) AS net_count,
       (SELECT count(*) FROM public.scheduled_http_dispatches) AS trace_count;
SAVEPOINT t12b1_outbound_rollback;
SELECT private.invoke_poll_os_auctions_cron();
ROLLBACK TO SAVEPOINT t12b1_outbound_rollback;
SELECT is((SELECT count(*) FROM net.t12b1_capture),(SELECT net_count FROM t12b1_before_rollback),'caller rollback removes enqueued net request'); -- 16
SELECT is((SELECT count(*) FROM public.scheduled_http_dispatches),(SELECT trace_count FROM t12b1_before_rollback),'caller rollback removes trace'); -- 17

SELECT pg_catalog.set_config('app.settings.cron_secret','',true);
SELECT lives_ok('SELECT private.invoke_poll_os_auctions_cron()','missing credential records skip'); -- 18
SELECT is((SELECT count(*)::integer FROM public.scheduled_http_dispatches WHERE integration='poll_os_auctions' AND application_state='skipped_config' AND net_request_id IS NULL),1,'config skip has no request'); -- 19
SELECT pg_catalog.set_config('app.settings.cron_secret','synthetic-secret',true);
SELECT pg_catalog.set_config('app.settings.supabase_url','https://fail.invalid',true);
SELECT lives_ok('SELECT private.invoke_poll_os_auctions_cron()','enqueue error is caught after rollback'); -- 20
SELECT is((SELECT count(*)::integer FROM public.scheduled_http_dispatches WHERE integration='poll_os_auctions' AND application_state='enqueue_failed' AND net_request_id IS NULL),1,'enqueue failure leaves safe trace without request'); -- 21

CREATE TEMP TABLE t12b1_run AS
SELECT d.dispatch_id, public.start_scheduled_http_dispatch_for_service(d.dispatch_id,d.integration) AS started
FROM public.scheduled_http_dispatches d WHERE d.integration='poll_os_auctions' AND d.net_request_id IS NOT NULL;
SELECT is((SELECT started->>'decision' FROM t12b1_run),'run','first start admits exactly one execution'); -- 20
SELECT is((SELECT public.start_scheduled_http_dispatch_for_service(dispatch_id,'poll_os_auctions')->>'decision' FROM t12b1_run),'in_progress','duplicate start cannot run'); -- 21
SELECT throws_ok('SELECT public.start_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),''saved_search_alerts'')','22023','scheduled_dispatch_identity_mismatch','wrong integration rejected'); -- 22
SELECT throws_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),pg_catalog.gen_random_uuid(),''succeeded'',''{}''::jsonb)','22023','scheduled_dispatch_token_mismatch','wrong token rejected'); -- 23
SELECT throws_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),(SELECT (started->>''execution_token'')::uuid FROM t12b1_run),''succeeded'',''{"recipient":"private@example.invalid"}''::jsonb)','22023','scheduled_dispatch_invalid_result','PII summary rejected'); -- 24
SELECT throws_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),(SELECT (started->>''execution_token'')::uuid FROM t12b1_run),''succeeded'',''{"outcome":"failed"}''::jsonb)','22023','scheduled_dispatch_invalid_result','summary outcome must match finished outcome');
SELECT lives_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),(SELECT (started->>''execution_token'')::uuid FROM t12b1_run),''succeeded'',''{"imported":1,"page_fetch_failures":0}''::jsonb)','finish records application outcome'); -- 25
SELECT lives_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),(SELECT (started->>''execution_token'')::uuid FROM t12b1_run),''succeeded'',''{"imported":1,"page_fetch_failures":0}''::jsonb)','same terminal result idempotent'); -- 26
SELECT throws_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_run),(SELECT (started->>''execution_token'')::uuid FROM t12b1_run),''failed'',''{}''::jsonb)','22023','scheduled_dispatch_terminal_conflict','conflicting finish rejected'); -- 27

INSERT INTO net._http_response(id,status_code,timed_out,content)
SELECT d.net_request_id,504,true,pg_catalog.jsonb_build_object('dispatch_id',d.dispatch_id,'outcome','failed')::text
FROM public.scheduled_http_dispatches d JOIN t12b1_run x USING(dispatch_id);
SELECT lives_ok('SELECT public.reconcile_scheduled_http_dispatches_for_service(100)','operator reconciliation runs'); -- 28
SELECT is((SELECT (transport_state,application_state,application_outcome,evidence_conflict)::text
  FROM public.scheduled_http_dispatches d JOIN t12b1_run x USING(dispatch_id)),
  '(timeout,finished,succeeded,t)','transport timeout retains finished application and conflict'); -- 29

UPDATE public.scheduled_http_dispatches SET requested_at=pg_catalog.now()-INTERVAL '1 hour'
WHERE integration='scheduled_followups' AND net_request_id IS NOT NULL;
SELECT is((SELECT public.reconcile_scheduled_http_dispatches_for_service(100)),1,'missing old response reconciled once'); -- 30
SELECT is((SELECT transport_state FROM public.scheduled_http_dispatches WHERE integration='scheduled_followups' AND net_request_id IS NOT NULL),'transport_unknown','missing response is unknown'); -- 31

INSERT INTO public.sync_log(direction,entity_type,entity_id,status,dispatch_id)
SELECT 'os_to_hub','auction','synthetic-poll','success',dispatch_id FROM t12b1_run;
SELECT is((SELECT count(*)::integer FROM public.sync_log l JOIN t12b1_run r USING(dispatch_id)),1,'poll sync log links exact dispatch'); -- 32
SELECT throws_ok('SELECT public.start_scheduled_http_dispatch_for_service(pg_catalog.gen_random_uuid(),''poll_os_auctions'')','22023','scheduled_dispatch_identity_mismatch','supplied unknown dispatch cannot create a trace'); -- 33
CREATE TEMP TABLE t12b1_late AS
SELECT d.dispatch_id,public.start_scheduled_http_dispatch_for_service(d.dispatch_id,d.integration) AS started
FROM public.scheduled_http_dispatches d WHERE d.integration='saved_search_alerts' AND d.net_request_id IS NOT NULL;
UPDATE public.scheduled_http_dispatches SET started_at=pg_catalog.now()-INTERVAL '1 hour'
WHERE dispatch_id=(SELECT dispatch_id FROM t12b1_late);
SELECT lives_ok('SELECT public.reconcile_scheduled_http_dispatches_for_service(100)','old running execution observed unknown'); -- 34
SELECT is((SELECT public.start_scheduled_http_dispatch_for_service(dispatch_id,'saved_search_alerts')->>'decision' FROM t12b1_late),'unknown','unknown cannot acquire another execution'); -- 35
SELECT lives_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_late),(SELECT (started->>''execution_token'')::uuid FROM t12b1_late),''partial'',''{"processed":1,"failed":1}''::jsonb)','late matching completion resolves unknown'); -- 36
SELECT is((SELECT application_state FROM public.scheduled_http_dispatches d JOIN t12b1_late l USING(dispatch_id)),'finished','late completion is authoritative'); -- 37
SELECT throws_ok('SELECT public.finish_scheduled_http_dispatch_for_service((SELECT dispatch_id FROM t12b1_late),(SELECT (started->>''execution_token'')::uuid FROM t12b1_late),''partial'',pg_catalog.jsonb_build_object(''processed'',pg_catalog.repeat(''9'',4097)) )','22023','scheduled_dispatch_invalid_result','oversized or non-count summary rejected'); -- 38

CREATE FUNCTION net.t12b1_block_trace() RETURNS trigger LANGUAGE plpgsql AS $block$
BEGIN RAISE EXCEPTION 'synthetic_trace_failure'; END;
$block$;
CREATE TRIGGER t12b1_block_trace BEFORE INSERT ON public.scheduled_http_dispatches
FOR EACH ROW EXECUTE FUNCTION net.t12b1_block_trace();
SELECT throws_ok('SELECT private.invoke_poll_os_auctions_cron()','P0001','synthetic_trace_failure','trace insert failure stops wrapper'); -- 39
SELECT is((SELECT count(*)::integer FROM net.t12b1_capture),3,'trace failure creates no net request'); -- 40

SELECT * FROM finish();
ROLLBACK;
