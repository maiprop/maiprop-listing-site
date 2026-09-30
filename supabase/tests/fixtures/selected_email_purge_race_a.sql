\set ON_ERROR_STOP on
BEGIN;
SET application_name='t12b2_purge_a';
SELECT operation_id FROM public.email_send_log
  WHERE producer='marketing_followup' AND entity_id='120b2ace-0000-4000-8000-000000000002'
  FOR UPDATE;
SELECT pg_sleep(4);
COMMIT;
