\set ON_ERROR_STOP on
\i supabase/tests/ai_reservation_spendable_credits_test.sql
SET app.billing_runtime_mode='test';
\i supabase/tests/ai_reservation_spendable_credits_test.sql
RESET app.billing_runtime_mode;
SELECT to_regclass('pg_temp.task24_receipts') AS temp_receipts_after, to_regprocedure('pg_temp.task24_steps(uuid,text,integer,integer)') AS temp_helper_after;
