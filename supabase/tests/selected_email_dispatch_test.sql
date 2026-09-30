\set ON_ERROR_STOP on
BEGIN;
SELECT plan(10);

INSERT INTO auth.users(id,email) VALUES
 ('120b2000-0000-4000-8000-000000000001','selected-alert@example.test');
INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
  created_at,status,followup_step)
VALUES ('120b2000-0000-4000-8000-000000000002','Selected Fixture','+306900000001',
  'selected-lead@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,last_alert_listing_ids)
VALUES ('120b2000-0000-4000-8000-000000000003','120b2000-0000-4000-8000-000000000001',
  'Selected fixture','{"area":"Athens"}'::jsonb,true,NULL);
INSERT INTO public.scheduled_http_dispatches(dispatch_id,integration,origin,transport_state,
  application_state,execution_token,started_at)
VALUES
 ('120b2000-0000-4000-8000-000000000004','scheduled_followups','cron','enqueued',
  'running','120b2000-0000-4000-8000-000000000005',now()),
 ('120b2000-0000-4000-8000-000000000006','saved_search_alerts','cron','enqueued',
  'running','120b2000-0000-4000-8000-000000000007',now());

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.email_send_log(template_name,status,recipient_email)
      VALUES ('legacy_fixture','pending',NULL);
    RAISE EXCEPTION 'legacy_null_recipient_admitted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$test$;

SET LOCAL ROLE anon;
DO $test$
BEGIN
  IF has_function_privilege('anon','public.begin_email_dispatch_for_service(uuid,uuid)','EXECUTE')
    OR has_table_privilege('anon','public.email_send_log','SELECT') THEN
    RAISE EXCEPTION 'anon_selected_email_access';
  END IF;
END;
$test$;
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF has_function_privilege('authenticated','public.prepare_marketing_followup_for_service(uuid,integer,uuid,uuid,jsonb,jsonb)','EXECUTE')
    OR has_table_privilege('authenticated','public.email_send_log','SELECT') THEN
    RAISE EXCEPTION 'authenticated_selected_email_access';
  END IF;
END;
$test$;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE selected_email_fixture_ops(kind text PRIMARY KEY,operation_id uuid) ON COMMIT DROP;
DO $test$
DECLARE v_result jsonb; v_op uuid; v_payload jsonb;
BEGIN
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-lead@example.test','name','Selected Fixture')),
    'subject','Selected followup','htmlContent','<p>Selected fixture</p>');
  IF public.prepare_marketing_followup_for_service(
    '120b2000-0000-4000-8000-000000000002',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-lead@example.test","followup_step":0,"status":"new"}'::jsonb,
    jsonb_set(v_payload,'{sender}','{}'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'empty_sender_marketing_admitted';
  END IF;
  IF public.prepare_marketing_followup_for_service(
    '120b2000-0000-4000-8000-000000000002',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-lead@example.test","followup_step":0,"status":"new"}'::jsonb,
    jsonb_set(v_payload,'{sender}','{"name":"mAI Prop"}'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'missing_sender_email_marketing_admitted';
  END IF;
  IF public.prepare_marketing_followup_for_service(
    '120b2000-0000-4000-8000-000000000002',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-lead@example.test","followup_step":0,"status":"new"}'::jsonb,
    jsonb_set(v_payload,'{to}','[{}]'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'empty_recipient_marketing_admitted';
  END IF;
  IF public.prepare_marketing_followup_for_service(
    '120b2000-0000-4000-8000-000000000002',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-lead@example.test","followup_step":0,"status":"new"}'::jsonb,
    jsonb_set(v_payload,'{to}','[{"name":"Missing email"}]'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'missing_recipient_email_marketing_admitted';
  END IF;
  BEGIN
    PERFORM public.prepare_marketing_followup_for_service(
      '120b2000-0000-4000-8000-000000000002',1,
      '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000099',
      '{"email":"selected-lead@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
    RAISE EXCEPTION 'wrong_parent_token_prepared';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  v_result:=public.prepare_marketing_followup_for_service(
    '120b2000-0000-4000-8000-000000000002',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-lead@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'marketing_prepare_%',v_result; END IF;
  v_op:=(v_result->>'operation_id')::uuid;
  INSERT INTO selected_email_fixture_ops VALUES('lead',v_op);
  IF public.get_selected_email_operation_for_service('marketing_followup',
    '120b2000-0000-4000-8000-000000000002',1)->>'state'<>'prepared' THEN
    RAISE EXCEPTION 'marketing_lookup';
  END IF;
  v_result:=public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000008');
  IF v_result->>'decision'<>'send' OR v_result->'payload'<>v_payload THEN RAISE EXCEPTION 'marketing_begin_%',v_result; END IF;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000009')->>'decision'<>'busy' THEN
    RAISE EXCEPTION 'duplicate_begin';
  END IF;
  BEGIN
    PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000009',
      'accepted',NULL,201,NULL);
    RAISE EXCEPTION 'stale_token_admitted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000008',
    'accepted',NULL,201,NULL);
  BEGIN
    PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000008',
      'rejected_final',NULL,400,'provider_rejected');
    RAISE EXCEPTION 'accepted_demoted';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000008',
    'accepted',NULL,201,NULL);
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'marketing_apply';
  END IF;
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'already_applied' THEN
    RAISE EXCEPTION 'marketing_apply_replay';
  END IF;
END;
$test$;

DO $test$
DECLARE v_result jsonb; v_op uuid; v_payload jsonb; v_expected jsonb;
BEGIN
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-alert@example.test')),
    'subject','Selected alert','htmlContent','<p>Selected listings</p>');
  v_expected:=jsonb_build_object('user_id','120b2000-0000-4000-8000-000000000001',
    'filters',jsonb_build_object('area','Athens'),'last_alert_listing_ids','null'::jsonb,
    'last_alert_sent_at','null'::jsonb,'recipient_email','selected-alert@example.test');
  IF public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    jsonb_set(v_payload,'{sender}','{}'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'empty_sender_saved_admitted';
  END IF;
  IF public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    jsonb_set(v_payload,'{sender}','{"name":"mAI Prop"}'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'missing_sender_email_saved_admitted';
  END IF;
  IF public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    jsonb_set(v_payload,'{sender}','{"email":"kr@maiprop.co"}'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'missing_sender_name_saved_admitted';
  END IF;
  IF public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    jsonb_set(v_payload,'{to}','[{}]'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'empty_recipient_saved_admitted';
  END IF;
  IF public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    jsonb_set(v_payload,'{to}','[{"name":"Missing email"}]'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'missing_recipient_email_saved_admitted';
  END IF;
  BEGIN
    PERFORM public.prepare_saved_search_alert_for_service(
      '120b2000-0000-4000-8000-000000000003',
      '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
      v_expected,ARRAY[]::uuid[],ARRAY[]::uuid[],v_payload);
    RAISE EXCEPTION 'empty_candidate_prepared';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  IF public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    v_payload||'{"apiKey":"synthetic"}'::jsonb)->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'transport_secret_payload_prepared';
  END IF;
  v_result:=public.prepare_saved_search_alert_for_service(
    '120b2000-0000-4000-8000-000000000003',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'saved_prepare_%',v_result; END IF;
  v_op:=(v_result->>'operation_id')::uuid;
  INSERT INTO selected_email_fixture_ops VALUES('saved',v_op);
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000011')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'saved_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000011',
    'accepted','provider-fixture',201,NULL);
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'saved_apply';
  END IF;
END;
$test$;

DO $test$
DECLARE v_lead public.marketing_leads%ROWTYPE; v_search public.saved_searches%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.marketing_leads WHERE id='120b2000-0000-4000-8000-000000000002';
  SELECT * INTO v_search FROM public.saved_searches WHERE id='120b2000-0000-4000-8000-000000000003';
  IF v_lead.followup_step<>1 OR v_lead.status<>'contacted' THEN RAISE EXCEPTION 'lead_checkpoint'; END IF;
  IF v_search.last_alert_listing_ids<>ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[]
    OR v_search.last_alert_sent_at IS NULL THEN RAISE EXCEPTION 'search_checkpoint'; END IF;
  IF (SELECT count(*) FROM public.email_send_log WHERE operation_id IS NOT NULL
    AND entity_id IN ('120b2000-0000-4000-8000-000000000002'::uuid,
      '120b2000-0000-4000-8000-000000000003'::uuid))<>2 THEN
    RAISE EXCEPTION 'canonical_count';
  END IF;
  IF public.list_accepted_unapplied_email_operations_for_service(10)<>'[]'::jsonb THEN
    RAISE EXCEPTION 'accepted_repair_listing';
  END IF;
END;
$test$;

SELECT ok(true,'legacy contract, roles, frozen prepare/begin, known acceptance and exact checkpoints');

DO $test$
DECLARE v_result jsonb; v_op uuid; v_payload jsonb;
BEGIN
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES ('120b2000-0000-4000-8000-000000000020','Selected Retry','+306900000020',
    'selected-retry@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-retry@example.test')),
    'subject','Frozen retry','htmlContent','<p>Frozen retry</p>');
  v_result:=public.prepare_marketing_followup_for_service(
    '120b2000-0000-4000-8000-000000000020',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-retry@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'retry_prepare_%',v_result; END IF;
  v_op:=(v_result->>'operation_id')::uuid;
  IF public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000020',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-retry@example.test","followup_step":0,"status":"new"}'::jsonb,
    jsonb_set(v_payload,'{subject}','"Different"'::jsonb))->>'reason'<>'payload_conflict' THEN
    RAISE EXCEPTION 'different_frozen_payload_admitted';
  END IF;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000021')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'retry_first_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000021',
    'rejected_retryable',NULL,429,'rate_limited');
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000022')->>'decision'<>'busy' THEN
    RAISE EXCEPTION 'retry_not_before_bypassed';
  END IF;
  UPDATE public.email_send_log SET not_before=now()-INTERVAL '1 second' WHERE operation_id=v_op;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000021')->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'immediate_attempt_token_reuse';
  END IF;
  v_result:=public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000022');
  IF v_result->>'decision'<>'send' OR v_result->'payload'<>v_payload THEN
    RAISE EXCEPTION 'frozen_retry_changed_%',v_result;
  END IF;
  BEGIN
    PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000021',
      'rejected_retryable',NULL,429,'rate_limited');
    RAISE EXCEPTION 'delayed_old_429_released_fresh_attempt';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000022',
    'rejected_retryable',NULL,429,'rate_limited');
  UPDATE public.email_send_log SET not_before=now()-INTERVAL '1 second' WHERE operation_id=v_op;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000021')->>'decision'<>'conflict'
    OR public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000022')->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'historical_attempt_token_reuse';
  END IF;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000023')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'third_fresh_attempt_missing';
  END IF;
  BEGIN
    PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000021',
      'rejected_retryable',NULL,429,'rate_limited');
    RAISE EXCEPTION 'first_429_released_third_attempt';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000022',
      'rejected_retryable',NULL,429,'rate_limited');
    RAISE EXCEPTION 'second_429_released_third_attempt';
  EXCEPTION WHEN sqlstate '22023' THEN NULL;
  END;
  IF (SELECT dispatch_state FROM public.email_send_log WHERE operation_id=v_op)<>'sending' THEN
    RAISE EXCEPTION 'delayed_old_result_changed_third_attempt';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000023',
    'accepted',NULL,201,NULL);
  UPDATE public.marketing_leads SET status='closed' WHERE id='120b2000-0000-4000-8000-000000000020';
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'changed_new_status_overwritten';
  END IF;
  IF (SELECT entity_hold FROM public.email_send_log WHERE operation_id=v_op) IS NOT TRUE THEN
    RAISE EXCEPTION 'accepted_conflict_hold_released';
  END IF;
  DELETE FROM public.marketing_leads WHERE id='120b2000-0000-4000-8000-000000000020';
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op AND accepted_at IS NOT NULL) THEN
    RAISE EXCEPTION 'entity_delete_erased_barrier';
  END IF;
  IF public.list_accepted_unapplied_email_operations_for_service(10)<>'[]'::jsonb
    OR public.get_selected_email_operation_for_service('marketing_followup',
      '120b2000-0000-4000-8000-000000000020',1)->>'state'<>'accepted_conflict' THEN
    RAISE EXCEPTION 'held_repair_not_visible_or_incorrectly_enumerated';
  END IF;
END;
$test$;
SELECT ok(true,'frozen retry, checked not-before, stale token and accepted conflict hold');

DO $test$
DECLARE v_i integer; v_lead_id uuid; v_op uuid; v_token uuid; v_email text;
  v_result jsonb; v_payload jsonb;
BEGIN
  FOR v_i IN 1..100 LOOP
    v_lead_id:=('120b2001-0000-4000-8000-'||lpad(v_i::text,12,'0'))::uuid;
    v_email:='held-'||v_i||'@example.test';
    INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
      created_at,status,followup_step)
    VALUES (v_lead_id,'Held repair page '||v_i,'+306910000000',v_email,'Greek',300000,
      now()-INTERVAL '40 days','new',0);
    v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
      'to',jsonb_build_array(jsonb_build_object('email',v_email)),
      'subject','Held repair','htmlContent','<p>Held</p>');
    v_result:=public.prepare_marketing_followup_for_service(v_lead_id,1,
      '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
      jsonb_build_object('email',v_email,'followup_step',0,'status','new'),v_payload);
    IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'held_page_prepare_%_%',v_i,v_result; END IF;
    v_op:=(v_result->>'operation_id')::uuid;
    v_token:=pg_catalog.gen_random_uuid();
    IF public.begin_email_dispatch_for_service(v_op,v_token)->>'decision'<>'send' THEN
      RAISE EXCEPTION 'held_page_begin_%',v_i;
    END IF;
    PERFORM public.record_email_dispatch_result_for_service(v_op,v_token,'accepted',NULL,201,NULL);
    UPDATE public.marketing_leads SET status='closed' WHERE id=v_lead_id;
    IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'conflict' THEN
      RAISE EXCEPTION 'held_page_not_conflict_%',v_i;
    END IF;
  END LOOP;
  v_lead_id:='120b2001-0000-4000-8000-000000000101';
  v_email:='repairable-101@example.test';
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES (v_lead_id,'Repairable after held page','+306910000101',v_email,'Greek',300000,
    now()-INTERVAL '40 days','new',0);
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email',v_email)),
    'subject','Repairable','htmlContent','<p>Repairable</p>');
  v_result:=public.prepare_marketing_followup_for_service(v_lead_id,1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    jsonb_build_object('email',v_email,'followup_step',0,'status','new'),v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'later_repair_prepare_%',v_result; END IF;
  v_op:=(v_result->>'operation_id')::uuid;
  v_token:=pg_catalog.gen_random_uuid();
  IF public.begin_email_dispatch_for_service(v_op,v_token)->>'decision'<>'send' THEN
    RAISE EXCEPTION 'later_repair_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,v_token,'accepted',NULL,201,NULL);
  IF NOT public.list_accepted_unapplied_email_operations_for_service(100)
    @> jsonb_build_array(jsonb_build_object('operation_id',v_op)) THEN
    RAISE EXCEPTION 'later_repair_starved';
  END IF;
  IF (SELECT count(*) FROM public.email_send_log WHERE dispatch_state='accepted_conflict'
    AND entity_id::text LIKE '120b2001-%')<>100
    OR public.get_selected_email_operation_for_service('marketing_followup',
      '120b2001-0000-4000-8000-000000000001',1)->>'state'<>'accepted_conflict' THEN
    RAISE EXCEPTION 'held_page_visibility_lost';
  END IF;
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'later_repair_not_applied';
  END IF;
END;
$test$;
SELECT ok(true,'bounded repair reaches later acceptance past 100 permanent holds');

DO $test$
DECLARE v_result jsonb; v_op uuid; v_payload jsonb;
BEGIN
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES ('120b2000-0000-4000-8000-000000000030','Selected Unknown','+306900000030',
    'selected-unknown@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-unknown@example.test')),
    'subject','Unknown','htmlContent','<p>Unknown</p>');
  v_result:=public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000030',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-unknown@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  v_op:=(v_result->>'operation_id')::uuid;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000031')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'unknown_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000031',
    'unknown',NULL,NULL,'transport_unknown');
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000032')->>'decision'<>'unknown' THEN
    RAISE EXCEPTION 'unknown_reissued';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000031',
    'accepted',NULL,201,NULL);
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'matching_late_acceptance_not_repaired';
  END IF;
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES ('120b2000-0000-4000-8000-000000000040','Selected Expiry','+306900000040',
    'selected-expiry@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
  v_payload:=jsonb_set(v_payload,'{to,0,email}','"selected-expiry@example.test"'::jsonb);
  v_result:=public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000040',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-expiry@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  v_op:=(v_result->>'operation_id')::uuid;
  UPDATE public.email_send_log SET expires_at=now()-INTERVAL '1 second' WHERE operation_id=v_op;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000041')->>'decision'<>'expired' THEN
    RAISE EXCEPTION 'expired_prepare_sent';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op
    AND recipient_email IS NULL AND prepared_payload IS NULL AND expected_state IS NULL
    AND dispatch_state='expired_unsent' AND operation_key IS NOT NULL AND NOT entity_hold) THEN
    RAISE EXCEPTION 'expiry_purge_incomplete';
  END IF;
END;
$test$;
SELECT ok(true,'unknown holds, late matching acceptance and seven-day purge barrier');

DO $test$
DECLARE v_search public.saved_searches%ROWTYPE; v_expected jsonb; v_payload jsonb;
  v_result jsonb; v_b uuid; v_a uuid; v_empty uuid;
BEGIN
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-alert@example.test')),
    'subject','Selected cycle','htmlContent','<p>Selected cycle</p>');
  SELECT * INTO v_search FROM public.saved_searches WHERE id='120b2000-0000-4000-8000-000000000003';
  v_expected:=jsonb_build_object('user_id',v_search.user_id,'filters',v_search.filters,
    'last_alert_listing_ids',to_jsonb(v_search.last_alert_listing_ids),
    'last_alert_sent_at',v_search.last_alert_sent_at,'recipient_email','selected-alert@example.test');
  v_result:=public.prepare_saved_search_alert_for_service(v_search.id,
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000011']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000011']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'cycle_b_prepare_%',v_result; END IF;
  v_b:=(v_result->>'operation_id')::uuid;
  IF public.prepare_saved_search_alert_for_service(v_search.id,
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000011']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000011']::uuid[],
    jsonb_set(v_payload,'{subject}','"Different"'::jsonb))->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'saved_payload_conflict_missing';
  END IF;
  IF public.begin_email_dispatch_for_service(v_b,'120b2000-0000-4000-8000-000000000012')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'cycle_b_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_b,'120b2000-0000-4000-8000-000000000012',
    'accepted',NULL,201,NULL);
  IF public.apply_email_dispatch_result_for_service(v_b)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'cycle_b_apply';
  END IF;
  SELECT * INTO v_search FROM public.saved_searches WHERE id=v_search.id;
  v_expected:=jsonb_build_object('user_id',v_search.user_id,'filters',v_search.filters,
    'last_alert_listing_ids',to_jsonb(v_search.last_alert_listing_ids),
    'last_alert_sent_at',v_search.last_alert_sent_at,'recipient_email','selected-alert@example.test');
  v_result:=public.prepare_saved_search_alert_for_service(v_search.id,
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000010']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'cycle_a_prepare_%',v_result; END IF;
  v_a:=(v_result->>'operation_id')::uuid;
  IF v_a=v_b OR (SELECT operation_key FROM public.email_send_log WHERE operation_id=v_a)
    =(SELECT operation_key FROM public.email_send_log WHERE operation_id=v_b) THEN
    RAISE EXCEPTION 'cycle_a_key_not_distinct';
  END IF;
  UPDATE public.saved_searches SET filters='{"area":"Patras"}'::jsonb WHERE id=v_search.id;
  SELECT * INTO v_search FROM public.saved_searches WHERE id=v_search.id;
  v_expected:=jsonb_build_object('user_id',v_search.user_id,'filters',v_search.filters,
    'last_alert_listing_ids',to_jsonb(v_search.last_alert_listing_ids),
    'last_alert_sent_at',v_search.last_alert_sent_at,'recipient_email','selected-alert@example.test');
  IF public.prepare_saved_search_alert_for_service(v_search.id,
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000012']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000012']::uuid[],v_payload)->>'decision'<>'held' THEN
    RAISE EXCEPTION 'filter_revision_bypassed_hold';
  END IF;
  IF public.begin_email_dispatch_for_service(v_a,'120b2000-0000-4000-8000-000000000013')->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'changed_filters_sent';
  END IF;
  INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,last_alert_listing_ids)
  VALUES ('120b2000-0000-4000-8000-000000000050','120b2000-0000-4000-8000-000000000001',
    'Empty snapshot','{"area":"Athens"}'::jsonb,true,ARRAY[]::uuid[]);
  v_expected:=jsonb_build_object('user_id','120b2000-0000-4000-8000-000000000001',
    'filters',jsonb_build_object('area','Athens'),'last_alert_listing_ids','null'::jsonb,
    'last_alert_sent_at','null'::jsonb,'recipient_email','selected-alert@example.test');
  IF public.prepare_saved_search_alert_for_service('120b2000-0000-4000-8000-000000000050',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000013']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000013']::uuid[],v_payload)->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'null_empty_snapshot_collapsed';
  END IF;
  v_expected:=jsonb_set(v_expected,'{last_alert_listing_ids}','[]'::jsonb);
  v_result:=public.prepare_saved_search_alert_for_service('120b2000-0000-4000-8000-000000000050',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000013']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000013']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'empty_snapshot_prepare_%',v_result; END IF;
  v_empty:=(v_result->>'operation_id')::uuid;
  IF public.begin_email_dispatch_for_service(v_empty,'120b2000-0000-4000-8000-000000000014')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'empty_snapshot_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_empty,'120b2000-0000-4000-8000-000000000014',
    'accepted',NULL,201,NULL);
  UPDATE public.saved_searches SET last_alert_listing_ids=NULL
    WHERE id='120b2000-0000-4000-8000-000000000050';
  IF public.apply_email_dispatch_result_for_service(v_empty)->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'null_empty_apply_collapsed';
  END IF;
  INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,last_alert_listing_ids)
  VALUES ('120b2000-0000-4000-8000-000000000051','120b2000-0000-4000-8000-000000000001',
    'Timestamp revision','{"area":"Athens"}'::jsonb,true,NULL);
  v_expected:=jsonb_build_object('user_id','120b2000-0000-4000-8000-000000000001',
    'filters',jsonb_build_object('area','Athens'),'last_alert_listing_ids','null'::jsonb,
    'last_alert_sent_at','null'::jsonb,'recipient_email','selected-alert@example.test');
  v_result:=public.prepare_saved_search_alert_for_service('120b2000-0000-4000-8000-000000000051',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    v_expected,ARRAY['120b2000-0000-4000-8000-000000000013']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000013']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'timestamp_prepare_%',v_result; END IF;
  UPDATE public.saved_searches SET last_alert_sent_at=pg_catalog.now()
    WHERE id='120b2000-0000-4000-8000-000000000051';
  IF public.begin_email_dispatch_for_service((v_result->>'operation_id')::uuid,
    '120b2000-0000-4000-8000-000000000015')->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'timestamp_revision_sent';
  END IF;
END;
$test$;
SELECT ok(true,'saved predecessor A-B-A, payload conflict, revision hold, timestamp and NULL versus empty CAS');

RESET ROLE;
INSERT INTO auth.users(id,email)
VALUES ('120b2000-0000-4000-8000-000000000099','alternate-owner@example.test');
SET LOCAL ROLE service_role;
DO $test$
DECLARE v_case text; v_search_id uuid; v_op uuid; v_token uuid; v_result jsonb;
  v_payload jsonb; v_expected jsonb;
BEGIN
  v_expected:='{"user_id":"120b2000-0000-4000-8000-000000000001","filters":{"area":"Athens"},"last_alert_listing_ids":null,"last_alert_sent_at":null,"recipient_email":"selected-alert@example.test"}'::jsonb;
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-alert@example.test')),
    'subject','CAS field','htmlContent','<p>CAS field</p>');
  FOREACH v_case IN ARRAY ARRAY['user','consent','delete'] LOOP
    v_search_id:=CASE v_case WHEN 'user' THEN '120b2000-0000-4000-8000-000000000055'::uuid
      WHEN 'consent' THEN '120b2000-0000-4000-8000-000000000056'::uuid
      ELSE '120b2000-0000-4000-8000-000000000057'::uuid END;
    INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,last_alert_listing_ids)
    VALUES (v_search_id,'120b2000-0000-4000-8000-000000000001',
      'CAS '||v_case,'{"area":"Athens"}'::jsonb,true,NULL);
    v_result:=public.prepare_saved_search_alert_for_service(v_search_id,
      '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
      v_expected,ARRAY['120b2000-0000-4000-8000-000000000071']::uuid[],
      ARRAY['120b2000-0000-4000-8000-000000000071']::uuid[],v_payload);
    IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'saved_cas_prepare_%_%',v_case,v_result; END IF;
    v_op:=(v_result->>'operation_id')::uuid;
    v_token:=pg_catalog.gen_random_uuid();
    IF public.begin_email_dispatch_for_service(v_op,v_token)->>'decision'<>'send' THEN
      RAISE EXCEPTION 'saved_cas_begin_%',v_case;
    END IF;
    PERFORM public.record_email_dispatch_result_for_service(v_op,v_token,'accepted',NULL,201,NULL);
    CASE v_case
      WHEN 'user' THEN UPDATE public.saved_searches SET user_id='120b2000-0000-4000-8000-000000000099' WHERE id=v_search_id;
      WHEN 'consent' THEN UPDATE public.saved_searches SET email_alerts=false WHERE id=v_search_id;
      ELSE DELETE FROM public.saved_searches WHERE id=v_search_id;
    END CASE;
    IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'conflict'
      OR NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op
        AND accepted_at IS NOT NULL AND entity_hold AND applied_at IS NULL)
      OR public.get_selected_email_operation_for_service('saved_search_alert',v_search_id)->>'state'<>'accepted_conflict' THEN
      RAISE EXCEPTION 'saved_cas_field_or_delete_bypassed_%',v_case;
    END IF;
  END LOOP;
END;
$test$;
SELECT ok(true,'accepted saved CAS rejects changed user, consent and deletion while retaining barrier');

INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,last_alert_listing_ids)
VALUES ('120b2000-0000-4000-8000-000000000060','120b2000-0000-4000-8000-000000000001',
  'Rollback fixture','{"area":"Athens"}'::jsonb,true,NULL);
DO $test$
DECLARE v_result jsonb; v_payload jsonb; v_op uuid;
BEGIN
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-alert@example.test')),
    'subject','Rollback','htmlContent','<p>Rollback</p>');
  v_result:=public.prepare_saved_search_alert_for_service('120b2000-0000-4000-8000-000000000060',
    '120b2000-0000-4000-8000-000000000006','120b2000-0000-4000-8000-000000000007',
    '{"user_id":"120b2000-0000-4000-8000-000000000001","filters":{"area":"Athens"},"last_alert_listing_ids":null,"last_alert_sent_at":null,"recipient_email":"selected-alert@example.test"}'::jsonb,
    ARRAY['120b2000-0000-4000-8000-000000000061']::uuid[],
    ARRAY['120b2000-0000-4000-8000-000000000061']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'rollback_prepare_%',v_result; END IF;
  v_op:=(v_result->>'operation_id')::uuid;
  INSERT INTO selected_email_fixture_ops VALUES('rollback',v_op);
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000062')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'rollback_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000062',
    'accepted',NULL,201,NULL);
END;
$test$;
RESET ROLE;
CREATE FUNCTION pg_temp.selected_email_checkpoint_fail() RETURNS trigger LANGUAGE plpgsql AS $trigger$
BEGIN
  IF NEW.id='120b2000-0000-4000-8000-000000000060'::uuid THEN
    RAISE EXCEPTION 'selected_email_injected_checkpoint_failure' USING ERRCODE='ZX001';
  END IF;
  RETURN NEW;
END;
$trigger$;
CREATE TRIGGER selected_email_test_checkpoint_failure AFTER UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION pg_temp.selected_email_checkpoint_fail();
SET LOCAL ROLE service_role;
DO $test$
DECLARE v_op uuid; v_failed boolean:=false;
BEGIN
  SELECT operation_id INTO v_op FROM selected_email_fixture_ops WHERE kind='rollback';
  BEGIN
    PERFORM public.apply_email_dispatch_result_for_service(v_op);
  EXCEPTION WHEN sqlstate 'ZX001' THEN v_failed:=true;
  END;
  IF NOT v_failed THEN RAISE EXCEPTION 'checkpoint_failure_not_observed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op
      AND accepted_at IS NOT NULL AND applied_at IS NULL AND dispatch_state='accepted')
    OR NOT EXISTS (SELECT 1 FROM public.saved_searches
      WHERE id='120b2000-0000-4000-8000-000000000060' AND last_alert_listing_ids IS NULL) THEN
    RAISE EXCEPTION 'checkpoint_or_applied_flag_not_rolled_back';
  END IF;
END;
$test$;
RESET ROLE;
DROP TRIGGER selected_email_test_checkpoint_failure ON public.saved_searches;
DROP FUNCTION pg_temp.selected_email_checkpoint_fail();
SET LOCAL ROLE service_role;
DO $test$
DECLARE v_op uuid;
BEGIN
  SELECT operation_id INTO v_op FROM selected_email_fixture_ops WHERE kind='rollback';
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'accepted_repair_after_error_failed';
  END IF;
END;
$test$;
SELECT ok(true,'accepted checkpoint error rolls back business row and applied flag, then repairs');

DO $test$
DECLARE v_result jsonb; v_op uuid; v_payload jsonb; v_maint jsonb;
BEGIN
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES ('120b2000-0000-4000-8000-000000000070','Accepted Expiry','+306900000070',
    'accepted-expiry@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','accepted-expiry@example.test')),
    'subject','Accepted expiry','htmlContent','<p>Accepted expiry</p>');
  v_result:=public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000070',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"accepted-expiry@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  v_op:=(v_result->>'operation_id')::uuid;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000071')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'accepted_expiry_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000071',
    'accepted',NULL,201,NULL);
  UPDATE public.email_send_log SET expires_at=now()-INTERVAL '1 second' WHERE operation_id=v_op;
  v_maint:=public.maintain_selected_email_operations_for_service(100);
  IF (v_maint->>'purged')::integer<1 THEN RAISE EXCEPTION 'accepted_expiry_not_maintained'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op
    AND recipient_email IS NULL AND prepared_payload IS NULL AND expected_state IS NULL
    AND accepted_at IS NOT NULL AND dispatch_state='checkpoint_payload_expired' AND entity_hold) THEN
    RAISE EXCEPTION 'accepted_expiry_lost_barrier_or_pii';
  END IF;
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'expired' THEN
    RAISE EXCEPTION 'expired_checkpoint_applied';
  END IF;
  IF public.list_accepted_unapplied_email_operations_for_service(100)<>'[]'::jsonb
    OR NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op
      AND accepted_at IS NOT NULL AND dispatch_state='checkpoint_payload_expired'
      AND entity_hold AND applied_at IS NULL) THEN
    RAISE EXCEPTION 'expired_accepted_actionability_or_visibility';
  END IF;
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES ('120b2000-0000-4000-8000-000000000080','Stale Sending','+306900000080',
    'stale-sending@example.test','Greek',300000,now()-INTERVAL '40 days','new',0);
  v_payload:=jsonb_set(v_payload,'{to,0,email}','"stale-sending@example.test"'::jsonb);
  v_result:=public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000080',1,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"stale-sending@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  v_op:=(v_result->>'operation_id')::uuid;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000081')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'stale_begin';
  END IF;
  UPDATE public.email_send_log SET attempt_started_at=now()-INTERVAL '16 minutes' WHERE operation_id=v_op;
  v_maint:=public.maintain_selected_email_operations_for_service(100);
  IF (v_maint->>'unknown')::integer<1
    OR public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000082')->>'decision'<>'unknown' THEN
    RAISE EXCEPTION 'stale_sending_released';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000081',
    'accepted',NULL,201,NULL);
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'stale_matching_acceptance_not_applied';
  END IF;
END;
$test$;
SELECT ok(true,'bounded maintenance purges accepted PII and stale sending never grants a new lease');

DO $test$
DECLARE v_result jsonb; v_op uuid; v_payload jsonb;
BEGIN
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-lead@example.test')),
    'subject','Step two','htmlContent','<p>Step two</p>');
  v_result:=public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000002',2,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"selected-lead@example.test","followup_step":1,"status":"contacted"}'::jsonb,v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'step2_due_%',v_result; END IF;
  v_op:=(v_result->>'operation_id')::uuid;
  IF public.begin_email_dispatch_for_service(v_op,'120b2000-0000-4000-8000-000000000091')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'step2_begin';
  END IF;
  PERFORM public.record_email_dispatch_result_for_service(v_op,'120b2000-0000-4000-8000-000000000091',
    'accepted',NULL,201,NULL);
  UPDATE public.marketing_leads SET status='qualified' WHERE id='120b2000-0000-4000-8000-000000000002';
  IF public.apply_email_dispatch_result_for_service(v_op)->>'decision'<>'applied' THEN
    RAISE EXCEPTION 'non_new_status_invented_apply_predicate';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.marketing_leads
    WHERE id='120b2000-0000-4000-8000-000000000002' AND status='qualified' AND followup_step=2) THEN
    RAISE EXCEPTION 'non_new_apply_status_or_step';
  END IF;
  INSERT INTO public.marketing_leads(id,full_name,phone,email,nationality,investment_budget,
    created_at,status,followup_step)
  VALUES ('120b2000-0000-4000-8000-000000000090','Not Yet Due','+306900000090',
    'not-yet-due@example.test','Greek',300000,now()-INTERVAL '7 days','contacted',1);
  v_payload:=jsonb_set(v_payload,'{to,0,email}','"not-yet-due@example.test"'::jsonb);
  IF public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000090',2,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"not-yet-due@example.test","followup_step":1,"status":"contacted"}'::jsonb,v_payload)->>'decision'<>'conflict' THEN
    RAISE EXCEPTION 'day8_due_bypassed';
  END IF;
  UPDATE public.marketing_leads SET created_at=now()-INTERVAL '29 days',followup_step=2
    WHERE id='120b2000-0000-4000-8000-000000000090';
  v_result:=public.prepare_marketing_followup_for_service('120b2000-0000-4000-8000-000000000090',3,
    '120b2000-0000-4000-8000-000000000004','120b2000-0000-4000-8000-000000000005',
    '{"email":"not-yet-due@example.test","followup_step":2,"status":"contacted"}'::jsonb,v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'day29_step3_not_due_%',v_result; END IF;
END;
$test$;
SELECT ok(true,'day 1/8/29 progression and original non-new Task12a apply predicate');

SELECT ok(true,'selected email transactional source and captured contract assertions');
SELECT * FROM finish();
ROLLBACK;
