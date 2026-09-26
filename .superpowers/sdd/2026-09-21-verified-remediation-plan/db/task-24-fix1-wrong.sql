\set ON_ERROR_STOP on
SET maiprop.test_disposable_database='maiprop_task24_fix1_wrong_20260927';
\i supabase/tests/ai_reservation_last_credit_race_test.sql
