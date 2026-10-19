\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SELECT plan(37);
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='5s';
SET LOCAL session_replication_role=origin;
CREATE TABLE public.oh_t12_capture(ordinal bigint GENERATED ALWAYS AS IDENTITY, url text, headers jsonb, body jsonb);
CREATE OR REPLACE FUNCTION net.http_post(url text, headers jsonb DEFAULT '{}'::jsonb, body jsonb DEFAULT '{}'::jsonb, timeout_milliseconds integer DEFAULT 1000)
RETURNS bigint LANGUAGE plpgsql AS $net$
DECLARE v_id bigint;
BEGIN
  IF url <> 'https://source.invalid/functions/v1/oh-registration-notify'
    OR headers->>'Authorization' <> 'Bearer synthetic-oh-secret'
    OR headers->>'Content-Type' <> 'application/json'
    OR body->>'type' <> 'UPDATE' THEN
    RAISE EXCEPTION 'synthetic_net_stub_rejected';
  END IF;
  INSERT INTO public.oh_t12_capture(url,headers,body) VALUES(url,headers,body) RETURNING ordinal INTO v_id;
  RETURN v_id;
END $net$;
DO $$ BEGIN
  IF pg_get_functiondef('net.http_post(text,jsonb,jsonb,integer)'::regprocedure) NOT LIKE '%synthetic_net_stub_rejected%'
    OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net' AND p.proname='http_post' AND p.oid<>'net.http_post(text,jsonb,jsonb,integer)'::regprocedure) THEN
    RAISE EXCEPTION 'no_network_stub_preflight_failed';
  END IF;
  RAISE NOTICE 'NO_NETWORK_STUB_EFFECTIVE';
END $$;
SELECT set_config('app.settings.webhook_secret','synthetic-oh-secret',true),set_config('app.settings.supabase_url','https://source.invalid',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('WEBHOOK_SECRET','SUPABASE_URL','supabase_url','saved_search_alerts_project_url')) THEN
    RAISE EXCEPTION 'vault_secret_precedence_not_empty';
  END IF;
  RAISE NOTICE 'VAULT_PRECEDENCE_EMPTY';
END $$;
SELECT is((SELECT count(*) FROM public.oh_registration_status_events),0::bigint,'fresh event table');
SELECT 'SOURCE_BEFORE' label,(SELECT count(*) FROM public.open_house_registrations) registrations,(SELECT count(*) FROM public.notifications) notifications;
INSERT INTO auth.users(id,email) VALUES
('d1200001-0000-4000-8000-000000000001','owner-oh@example.test'),
('d1200001-0000-4000-8000-000000000002','requester-oh@example.test');
SELECT is((SELECT count(*) FROM public.profiles WHERE user_id::text LIKE 'd1200001-%'),2::bigint,'normal signup provisions both profiles');
SELECT 'PROFILE_FIXTURE' label,user_id,role FROM public.profiles WHERE user_id::text LIKE 'd1200001-%' ORDER BY user_id;
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,open_house_date,open_house_transaction_type)
VALUES ('d1200002-0000-4000-8000-000000000001','d1200001-0000-4000-8000-000000000001','Synthetic Open House','Athens',200000,80,'apartment','open_house','active',now()+interval '7 days','sale');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT 'RPC_CREATED' label,id,status,listing_id,requester_id FROM public.create_open_house_registration_for_user(
  'd1200001-0000-4000-8000-000000000002','d1200002-0000-4000-8000-000000000001',NULL,
  'Synthetic Requester','requester-oh@example.test','+30000000000',NULL,NULL,true,true,true);
RESET ROLE;
CREATE TEMP TABLE oh_registration_before AS SELECT to_jsonb(r)-'updated_at'-'status'-'rejection_reason' AS row FROM public.open_house_registrations r WHERE listing_id='d1200002-0000-4000-8000-000000000001';
SELECT 'PRE_ACTION' label,r.id,r.status,r.requester_id,r.listing_id,(SELECT count(*) FROM public.oh_t12_capture) queued,
 (SELECT count(*) FROM public.notifications n WHERE n.user_id=r.requester_id) notices
 FROM public.open_house_registrations r WHERE r.listing_id='d1200002-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claim.sub','d1200001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1200001-0000-4000-8000-000000000001"}',true),set_config('maiprop.open_house_registration_rpc','',true),set_config('maiprop.open_house_pof_review_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT 'OWNER_IDENTITY' label,current_user,auth.uid(),current_setting('session_replication_role');
UPDATE public.open_house_registrations SET status='approved'
WHERE listing_id='d1200002-0000-4000-8000-000000000001' AND requester_id='d1200001-0000-4000-8000-000000000002'
RETURNING 'ACTION_1' label,id,status;
RESET ROLE;
SELECT 'AFTER_1' label,(SELECT count(*) FROM public.oh_t12_capture) queued,(SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002') notices;
SET LOCAL ROLE authenticated;
UPDATE public.open_house_registrations SET status='rejected',rejection_reason='Historical rejection'
WHERE listing_id='d1200002-0000-4000-8000-000000000001' AND requester_id='d1200001-0000-4000-8000-000000000002'
RETURNING 'ACTION_2' label,id,status;
RESET ROLE;
SELECT 'AFTER_2' label,(SELECT count(*) FROM public.oh_t12_capture) queued,(SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002') notices;
SET LOCAL ROLE authenticated;
UPDATE public.open_house_registrations SET status='approved'
WHERE listing_id='d1200002-0000-4000-8000-000000000001' AND requester_id='d1200001-0000-4000-8000-000000000002'
RETURNING 'ACTION_3' label,id,status;
RESET ROLE;
SELECT 'AFTER_3' label,(SELECT count(*) FROM public.oh_t12_capture) queued,(SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002') notices;
SET LOCAL ROLE authenticated;
UPDATE public.open_house_registrations SET status='approved'
WHERE listing_id='d1200002-0000-4000-8000-000000000001' AND requester_id='d1200001-0000-4000-8000-000000000002'
RETURNING 'ACTION_4_SAME' label,id,status;
RESET ROLE;
SELECT 'AFTER_4' label,(SELECT count(*) FROM public.oh_t12_capture) queued,(SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002') notices;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.oh_t12_capture) <> 3
   OR (SELECT string_agg((body->'old_record'->>'status')||'>'||(body->'record'->>'status'),',' ORDER BY ordinal) FROM public.oh_t12_capture) <> 'pending>approved,approved>rejected,rejected>approved'
   OR EXISTS(SELECT 1 FROM public.oh_t12_capture WHERE body->'record'->>'id' <> body->'old_record'->>'id'
     OR body->'record'->>'requester_id' <> 'd1200001-0000-4000-8000-000000000002'
     OR body->'record'->>'listing_id' <> 'd1200002-0000-4000-8000-000000000001')
   OR (SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002') <> 3
   OR (SELECT status FROM public.open_house_registrations WHERE listing_id='d1200002-0000-4000-8000-000000000001') <> 'approved'
  THEN RAISE EXCEPTION 'OH_ASSERTION_FAILED'; END IF;
  RAISE NOTICE 'OH_ASSERTIONS_PASS_3_TRANSITIONS_3_IN_APP_FINAL_APPROVED_SAME_NO_ENQUEUE';
END $$;

SELECT is((SELECT count(DISTINCT event_id) FROM public.oh_registration_status_events),3::bigint,'three independent transition IDs; unchanged adds none');
SELECT is((SELECT string_agg(old_status||'>'||new_status,',' ORDER BY c.ordinal) FROM public.oh_registration_status_events e JOIN public.oh_t12_capture c ON (c.body->>'event_id')::uuid=e.event_id),'pending>approved,approved>rejected,rejected>approved','exact transition history');
SELECT ok(NOT EXISTS(SELECT FROM public.oh_t12_capture c JOIN public.oh_registration_status_events e ON e.event_id=(c.body->>'event_id')::uuid WHERE c.body->>'event_version'<>'1' OR c.body->'record' <> jsonb_build_object('id',e.registration_id,'requester_id',e.requester_id,'listing_id',e.listing_id,'status',e.new_status,'rejection_reason',e.rejection_reason,'timeslot_index',e.timeslot_index) OR e.state<>'ready' OR e.attempt_count<>0),'every minimal queued snapshot matches authoritative event');
SELECT is((SELECT to_jsonb(r)-'updated_at'-'status'-'rejection_reason' FROM public.open_house_registrations r WHERE listing_id='d1200002-0000-4000-8000-000000000001'),(SELECT row FROM oh_registration_before),'all other registration fields unchanged');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002' AND title='Open house registration approved' AND body='Your registration for Synthetic Open House was approved.' AND type='open_house' AND link='/dashboard?tab=open-houses'),2::bigint,'both approval in-app notices have exact recipient content type link');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d1200001-0000-4000-8000-000000000002' AND title='Open house registration rejected' AND body='Your registration for Synthetic Open House was rejected. Historical rejection' AND type='open_house' AND link='/dashboard?tab=open-houses'),1::bigint,'rejection in-app notice preserves historical reason');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid='public.oh_registration_status_events'::regclass) AND NOT EXISTS(SELECT FROM pg_policies WHERE tablename='oh_registration_status_events'),'restricted table RLS has no policies');
SELECT ok(NOT has_table_privilege('anon','public.oh_registration_status_events','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('authenticated','public.oh_registration_status_events','SELECT,INSERT,UPDATE,DELETE') AND NOT has_table_privilege('service_role','public.oh_registration_status_events','SELECT,INSERT,UPDATE,DELETE'),'no application role has direct table access');
SELECT ok(NOT has_function_privilege('anon','public.begin_oh_registration_status_event_for_service(uuid,uuid)','EXECUTE') AND NOT has_function_privilege('authenticated','public.begin_oh_registration_status_event_for_service(uuid,uuid)','EXECUTE') AND has_function_privilege('service_role','public.begin_oh_registration_status_event_for_service(uuid,uuid)','EXECUTE'),'service-only admission execution');
-- Optional local integration export; output is minimal synthetic fixture data only.
\if :{?oh_payloads_file}
\o :oh_payloads_file
SELECT body::text FROM public.oh_t12_capture ORDER BY ordinal;
\o
\endif
SELECT set_config('test.oh_event',(SELECT body->>'event_id' FROM public.oh_t12_capture WHERE ordinal=1),true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT set_config('test.oh_begin',public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001')::text,true);
RESET ROLE;
SELECT is(current_setting('test.oh_begin')::jsonb->>'decision','send','first service admission authorizes send');
SELECT is(current_setting('test.oh_begin')::jsonb->'snapshot',(SELECT body->'record' FROM public.oh_t12_capture WHERE ordinal=1),'admission returns exact original snapshot');
SET LOCAL ROLE service_role;
SELECT set_config('test.oh_again',public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000002')::text,true);
SELECT set_config('test.oh_missing',public.begin_oh_registration_status_event_for_service('d1200005-0000-4000-8000-000000000001','d1200004-0000-4000-8000-000000000002')::text,true);
RESET ROLE;
SELECT is(current_setting('test.oh_again')::jsonb->>'decision','busy','second token cannot readmit sending');
SELECT is(current_setting('test.oh_missing')::jsonb->>'decision','not_found','unknown IDs never mint events');
SELECT is((SELECT count(*) FROM public.oh_registration_status_events),3::bigint,'missing begin leaves graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.begin_oh_registration_status_event_for_service(NULL,NULL)$$,'22023','oh_event_invalid_begin','null token rejected');
SELECT throws_ok($$SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000002','accepted',202,'accepted_2xx')$$,'22023','oh_event_token_mismatch','wrong token cannot checkpoint');
SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','unknown',503,'http_unconfirmed');
RESET ROLE;
SELECT ok((SELECT state='unknown' AND registration_id IS NULL AND requester_id IS NULL AND listing_id IS NULL AND rejection_reason IS NULL AND timeslot_index IS NULL FROM public.oh_registration_status_events WHERE event_id=current_setting('test.oh_event')::uuid),'unknown checkpoint scrubs snapshot');
SET LOCAL ROLE service_role;
SELECT set_config('test.oh_again',public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000002')::text,true);
SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','accepted',202,'accepted_2xx');
SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','accepted',202,'accepted_2xx');
SELECT throws_ok($$SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','unknown',NULL,'transport_unknown')$$,'22023','oh_event_result_conflict','accepted cannot regress');
RESET ROLE;
SELECT is(current_setting('test.oh_again')::jsonb->>'decision','unknown','unknown never readmits');
SELECT ok((SELECT state='accepted' AND accepted_at IS NOT NULL AND attempt_count=1 AND registration_id IS NULL FROM public.oh_registration_status_events WHERE event_id=current_setting('test.oh_event')::uuid),'original token late acceptance resolves scrubbed unknown');
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','accepted',503,'accepted_2xx')$$,'22023','oh_event_invalid_result','non-2xx cannot claim acceptance');
SELECT throws_ok($$SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','unknown',202,'http_unconfirmed')$$,'22023','oh_event_invalid_result','2xx cannot checkpoint unconfirmed HTTP');
SELECT throws_ok($$SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001','unknown',NULL,'PRIVATE_RESULT')$$,'22023','oh_event_invalid_result','arbitrary result text rejected');
RESET ROLE;
SELECT ok(NOT EXISTS(SELECT FROM pg_constraint WHERE conrelid='public.oh_registration_status_events'::regclass AND contype='f'),'no foreign key can cascade tombstones');
DO $$ DECLARE constraint_name text; BEGIN
 BEGIN
  UPDATE public.oh_registration_status_events SET requester_id='d1200001-0000-4000-8000-000000000002' WHERE event_id=current_setting('test.oh_event')::uuid;
  RAISE EXCEPTION 'scrub_constraint_missing';
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME; IF constraint_name<>'oh_event_snapshot' THEN RAISE EXCEPTION 'wrong_scrub_constraint'; END IF;
 END;
 BEGIN
  UPDATE public.oh_registration_status_events SET attempt_count=2 WHERE event_id=current_setting('test.oh_event')::uuid;
  RAISE EXCEPTION 'attempt_constraint_missing';
 EXCEPTION WHEN check_violation THEN GET STACKED DIAGNOSTICS constraint_name=CONSTRAINT_NAME; IF constraint_name<>'oh_event_evidence' THEN RAISE EXCEPTION 'wrong_attempt_constraint'; END IF;
 END;
END $$;
SELECT ok((SELECT requester_id IS NULL AND attempt_count=1 FROM public.oh_registration_status_events WHERE event_id=current_setting('test.oh_event')::uuid),'constraints reject restored snapshot and second provider attempt');
SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated"}',true);
SELECT throws_ok($$SELECT public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000001')$$,'42501','service_role_required','definer validates caller role even when executor has privileges');
SELECT set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('test.oh_event2',(SELECT body->>'event_id' FROM public.oh_t12_capture WHERE ordinal=2),true);
SET LOCAL ROLE service_role;
SELECT public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event2')::uuid,'d1200004-0000-4000-8000-000000000002');
RESET ROLE;
UPDATE public.oh_registration_status_events SET attempt_started_at=now()-interval '16 minutes' WHERE event_id=current_setting('test.oh_event2')::uuid;
SET LOCAL ROLE service_role;
SELECT set_config('test.oh_expired',public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event2')::uuid,'d1200004-0000-4000-8000-000000000003')::text,true);
RESET ROLE;
SELECT is(current_setting('test.oh_expired')::jsonb->>'decision','unknown','expired sending is unknown not ready');
SELECT ok((SELECT result_code='sending_expired' AND requester_id IS NULL AND rejection_reason IS NULL FROM public.oh_registration_status_events WHERE event_id=current_setting('test.oh_event2')::uuid),'expiry scrubs sensitive snapshot');
SET LOCAL ROLE service_role;
SELECT public.record_oh_registration_status_event_result_for_service(current_setting('test.oh_event2')::uuid,'d1200004-0000-4000-8000-000000000002','accepted',204,'accepted_2xx');
RESET ROLE;
SELECT is((SELECT state FROM public.oh_registration_status_events WHERE event_id=current_setting('test.oh_event2')::uuid),'accepted','late original-token acceptance after expiry');
SAVEPOINT no_enqueue;
SELECT set_config('request.jwt.claim.sub','d1200001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1200001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.open_house_registrations SET status='rejected' WHERE listing_id='d1200002-0000-4000-8000-000000000001';
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.oh_registration_status_events)<>4 THEN RAISE EXCEPTION 'transaction_event_missing'; END IF; END $$;
ROLLBACK TO no_enqueue;
SELECT is((SELECT count(*) FROM public.oh_registration_status_events),3::bigint,'rollback removes event');
SELECT is((SELECT count(*) FROM public.oh_t12_capture),3::bigint,'rollback removes enqueue');
SAVEPOINT missing_config;
SELECT set_config('app.settings.webhook_secret','',true),set_config('request.jwt.claim.sub','d1200001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1200001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.open_house_registrations SET status='rejected' WHERE listing_id='d1200002-0000-4000-8000-000000000001';
RESET ROLE;
DO $$ BEGIN IF (SELECT count(*) FROM public.oh_registration_status_events)<>4 THEN RAISE EXCEPTION 'missing_config_event_missing'; END IF; END $$;
DO $$ BEGIN IF (SELECT count(*) FROM public.oh_t12_capture)<>3 THEN RAISE EXCEPTION 'missing_config_enqueued'; END IF; END $$;
DO $$ BEGIN IF (SELECT status::text FROM public.open_house_registrations WHERE listing_id='d1200002-0000-4000-8000-000000000001')<>'rejected' THEN RAISE EXCEPTION 'missing_config_update_failed'; END IF; END $$;
ROLLBACK TO missing_config;
DELETE FROM public.open_house_registrations WHERE listing_id='d1200002-0000-4000-8000-000000000001';
DELETE FROM public.listings WHERE id='d1200002-0000-4000-8000-000000000001';
DELETE FROM auth.users WHERE id='d1200001-0000-4000-8000-000000000002';
SELECT is((SELECT count(*) FROM public.oh_registration_status_events),3::bigint,'deletion does not cascade admission tombstones or ready history');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT set_config('test.oh_again',public.begin_oh_registration_status_event_for_service(current_setting('test.oh_event')::uuid,'d1200004-0000-4000-8000-000000000002')::text,true);
RESET ROLE;
SELECT is(current_setting('test.oh_again')::jsonb->>'decision','replay_accepted','accepted replay survives all entity deletions');
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT public.begin_oh_registration_status_event_for_service('d1200003-0000-4000-8000-000000000001','d1200004-0000-4000-8000-000000000001')$$,'42501','permission denied for function begin_oh_registration_status_event_for_service','actual anon denied');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT * FROM public.oh_registration_status_events$$,'42501','permission denied for table oh_registration_status_events','actual authenticated table access denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
