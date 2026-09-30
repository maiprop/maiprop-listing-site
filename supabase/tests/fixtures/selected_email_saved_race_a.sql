\set ON_ERROR_STOP on
BEGIN;
SET application_name='t12b2_saved_only_a';
SET LOCAL ROLE service_role;
DO $race$
DECLARE v_result jsonb; v_payload jsonb;
BEGIN
  v_payload:='{"sender":{"email":"kr@maiprop.co","name":"mAI Prop"},"to":[{"email":"selected-race-alert@example.test"}],"subject":"Saved only race","htmlContent":"<p>Race</p>"}'::jsonb;
  v_result:=public.prepare_saved_search_alert_for_service('120b2ace-0000-4000-8000-000000000003',
    '120b2ace-0000-4000-8000-000000000006','120b2ace-0000-4000-8000-000000000007',
    '{"user_id":"120b2ace-0000-4000-8000-000000000001","filters":{"area":"Athens"},"last_alert_listing_ids":null,"last_alert_sent_at":null,"recipient_email":"selected-race-alert@example.test"}'::jsonb,
    ARRAY['120b2ace-0000-4000-8000-000000000010']::uuid[],
    ARRAY['120b2ace-0000-4000-8000-000000000010']::uuid[],v_payload);
  IF v_result->>'decision'<>'prepared' THEN RAISE EXCEPTION 'saved_only_a_prepare_%',v_result; END IF;
  PERFORM pg_sleep(4);
  IF public.begin_email_dispatch_for_service((v_result->>'operation_id')::uuid,
    '120b2ace-0000-4000-8000-000000000011')->>'decision'<>'send' THEN
    RAISE EXCEPTION 'saved_only_a_begin';
  END IF;
END;
$race$;
COMMIT;
