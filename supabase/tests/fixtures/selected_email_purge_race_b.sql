\set ON_ERROR_STOP on
BEGIN;
SET application_name='t12b2_purge_b';
SET LOCAL ROLE service_role;
DO $race$
DECLARE v_result jsonb;
BEGIN
  v_result:=public.maintain_selected_email_operations_for_service(100);
  IF (v_result->>'purged')::integer<>0 THEN RAISE EXCEPTION 'purge_bypassed_row_lock_%',v_result; END IF;
END;
$race$;
COMMIT;
