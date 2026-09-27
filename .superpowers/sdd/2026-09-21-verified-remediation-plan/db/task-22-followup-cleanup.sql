\pset pager off
SELECT current_database() AS database, pg_backend_pid() AS backend_pid,
       to_regclass('pg_temp.task22_receipt') IS NULL AS receipt_temp_gone,
       (SELECT count(*) FROM auth.users WHERE id::text LIKE 'd1220001-%') AS fixture_users,
       (SELECT count(*) FROM public.profiles WHERE user_id::text LIKE 'd1220001-%') AS fixture_profiles,
       (SELECT count(*) FROM public.listings WHERE id::text LIKE 'd1220002-%') AS fixture_listings,
       (SELECT count(*) FROM public.open_house_registrations WHERE requester_id::text LIKE 'd1220001-%') AS fixture_registrations;
BEGIN;
SELECT plan(1);
SELECT ok(to_regclass('pg_temp.task22_receipt') IS NULL
          AND NOT EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd1220001-%')
          AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'd1220001-%')
          AND NOT EXISTS (SELECT 1 FROM public.listings WHERE id::text LIKE 'd1220002-%')
          AND NOT EXISTS (SELECT 1 FROM public.open_house_registrations WHERE requester_id::text LIKE 'd1220001-%'),
          'ordinary suite leaves no temp receipt or synthetic fixture in the same backend');
SELECT * FROM finish();
ROLLBACK;
