\set ON_ERROR_STOP on
BEGIN;
SET application_name='t12b2_apply_b';
SET LOCAL ROLE service_role;
DO $race$
DECLARE v_op uuid; v_result jsonb;
BEGIN
  SELECT operation_id INTO v_op FROM public.email_send_log
    WHERE producer='saved_search_alert' AND entity_id='120b2ace-0000-4000-8000-000000000003';
  v_result:=public.apply_email_dispatch_result_for_service(v_op);
  IF v_result->>'decision'<>'conflict' THEN RAISE EXCEPTION 'apply_race_expected_conflict_%',v_result; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.email_send_log WHERE operation_id=v_op
    AND accepted_at IS NOT NULL AND applied_at IS NULL AND dispatch_state='accepted_conflict' AND entity_hold)
    OR NOT EXISTS (SELECT 1 FROM public.saved_searches
      WHERE id='120b2ace-0000-4000-8000-000000000003' AND last_alert_listing_ids IS NULL
        AND filters='{"area":"Patras"}'::jsonb) THEN
    RAISE EXCEPTION 'apply_race_checkpoint_or_hold';
  END IF;
END;
$race$;
COMMIT;
