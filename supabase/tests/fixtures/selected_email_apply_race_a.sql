\set ON_ERROR_STOP on
BEGIN;
SET application_name='t12b2_apply_a';
UPDATE public.saved_searches SET filters='{"area":"Patras"}'::jsonb
  WHERE id='120b2ace-0000-4000-8000-000000000003';
SELECT pg_sleep(4);
COMMIT;
