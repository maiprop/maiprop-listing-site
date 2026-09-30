\set ON_ERROR_STOP on
BEGIN;
SET application_name='t12b2_admission_a';
SET LOCAL ROLE service_role;
DO $race$
DECLARE v_lead jsonb; v_saved jsonb; v_payload jsonb;
BEGIN
  v_payload:=jsonb_build_object('sender',jsonb_build_object('name','mAI Prop','email','kr@maiprop.co'),
    'to',jsonb_build_array(jsonb_build_object('email','selected-race-lead@example.test')),
    'subject','Race lead','htmlContent','<p>Race</p>');
  v_lead:=public.prepare_marketing_followup_for_service('120b2ace-0000-4000-8000-000000000002',1,
    '120b2ace-0000-4000-8000-000000000004','120b2ace-0000-4000-8000-000000000005',
    '{"email":"selected-race-lead@example.test","followup_step":0,"status":"new"}'::jsonb,v_payload);
  IF v_lead->>'decision'<>'prepared' THEN RAISE EXCEPTION 'race_a_lead_%',v_lead; END IF;
  v_payload:=jsonb_set(v_payload,'{to,0,email}','"selected-race-alert@example.test"'::jsonb);
  v_saved:=public.prepare_saved_search_alert_for_service('120b2ace-0000-4000-8000-000000000003',
    '120b2ace-0000-4000-8000-000000000006','120b2ace-0000-4000-8000-000000000007',
    '{"user_id":"120b2ace-0000-4000-8000-000000000001","filters":{"area":"Athens"},"last_alert_listing_ids":null,"last_alert_sent_at":null,"recipient_email":"selected-race-alert@example.test"}'::jsonb,
    ARRAY['120b2ace-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2ace-0000-4000-8000-000000000010']::uuid[],v_payload);
  IF v_saved->>'decision'<>'prepared' THEN RAISE EXCEPTION 'race_a_saved_%',v_saved; END IF;
  PERFORM pg_sleep(4);
  IF public.begin_email_dispatch_for_service((v_lead->>'operation_id')::uuid,
    '120b2ace-0000-4000-8000-000000000011')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'race_a_lead_begin';
  END IF;
  IF public.begin_email_dispatch_for_service((v_saved->>'operation_id')::uuid,
    '120b2ace-0000-4000-8000-000000000012')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'race_a_saved_begin';
  END IF;
END;
$race$;
COMMIT;
