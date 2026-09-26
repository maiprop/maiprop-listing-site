\set ON_ERROR_STOP on
SET maiprop.test_disposable_database='maiprop_task24_fix1_20260927';
SELECT pg_backend_pid() AS backend_before_race;
\i supabase/tests/ai_reservation_last_credit_race_test.sql
DO $$ BEGIN
 IF COALESCE(array_length(dblink_get_connections(),1),0)<>0 THEN RAISE EXCEPTION 'Remote connections remain'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()) THEN RAISE EXCEPTION 'Race temporary/TAP relation residue'; END IF;
END $$;
SELECT pg_backend_pid() AS backend_between_suites;
\i supabase/tests/ai_reservation_spendable_credits_test.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()) OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema()) THEN RAISE EXCEPTION 'Temporary/TAP residue after both suites'; END IF;
 IF COALESCE(array_length(dblink_get_connections(),1),0)<>0 THEN RAISE EXCEPTION 'Remote connections remain after both suites'; END IF;
END $$;
SELECT pg_backend_pid() AS backend_after_contract, (SELECT count(*) FROM pg_class WHERE relnamespace=pg_my_temp_schema()) AS temp_and_tap_relations, (SELECT count(*) FROM pg_proc WHERE pronamespace=pg_my_temp_schema()) AS temp_helpers;
\i .superpowers/sdd/2026-09-21-verified-remediation-plan/db/task-24-cleanup.sql
RESET maiprop.test_disposable_database;
