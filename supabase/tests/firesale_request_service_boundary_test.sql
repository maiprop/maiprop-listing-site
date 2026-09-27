\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_setting('maiprop.test_disposable_database', true) IS DISTINCT FROM current_database()
     OR inet_server_addr() IS NOT NULL
     OR current_database() !~ '^(maiprop_d0_[a-z0-9_]{6,48}|maiprop_t13_firesale_acl_[0-9]{8})$'
     OR current_database() = 'maiprop_d0_20260927_run01'
  THEN RAISE EXCEPTION 'Explicit matching Task 13 disposable socket database required';
  END IF;
END $$;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = public, extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();
SELECT ok(NOT has_table_privilege('anon', 'public.firesale_requests', 'INSERT')
          AND NOT has_any_column_privilege('anon', 'public.firesale_requests', 'INSERT')
          AND NOT has_table_privilege('anon', 'public.firesale_requests', 'DELETE'),
          'anonymous has no effective table or column write capability');
SELECT ok(NOT has_table_privilege('authenticated', 'public.firesale_requests', 'INSERT')
          AND NOT has_any_column_privilege('authenticated', 'public.firesale_requests', 'INSERT')
          AND NOT has_table_privilege('authenticated', 'public.firesale_requests', 'DELETE'),
          'authenticated has no effective table or column write capability');
SELECT ok(has_table_privilege('service_role', 'public.firesale_requests', 'SELECT')
          AND has_table_privilege('service_role', 'public.firesale_requests', 'INSERT')
          AND has_table_privilege('service_role', 'public.firesale_requests', 'DELETE'),
          'service retains read, create and rollback capability');
SELECT ok(has_table_privilege('authenticated', 'public.firesale_requests', 'SELECT')
          AND has_table_privilege('authenticated', 'public.firesale_requests', 'UPDATE'),
          'existing read and admin update grants remain');

-- Only identity setup bypasses triggers. Every request write below uses normal triggers.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id, email) VALUES
  ('f13e0000-0000-4000-8000-000000000001', 't13-owner@example.test'),
  ('f13e0000-0000-4000-8000-000000000002', 't13-other@example.test'),
  ('f13e0000-0000-4000-8000-000000000003', 't13-admin@example.test');
INSERT INTO public.profiles(user_id, role, is_platform_admin) VALUES
  ('f13e0000-0000-4000-8000-000000000001', 'seller', false),
  ('f13e0000-0000-4000-8000-000000000002', 'seller', false),
  ('f13e0000-0000-4000-8000-000000000003', 'admin', true);
SET LOCAL session_replication_role = origin;

SELECT set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT lives_ok($q$
  INSERT INTO public.firesale_requests
    (id, user_id, address, city, sqm, contact_email)
  VALUES
    ('f13e1000-0000-4000-8000-000000000001',
     'f13e0000-0000-4000-8000-000000000001',
     'Task 13 service request', 'Athens', 75, 't13-owner@example.test')
  RETURNING id
$q$, 'service INSERT RETURNING succeeds with normal triggers');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.firesale_requests
           WHERE id = 'f13e1000-0000-4000-8000-000000000001'),
          1, 'service creation left one request');

SELECT set_config('request.jwt.claim.sub', 'f13e0000-0000-4000-8000-000000000001', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"f13e0000-0000-4000-8000-000000000001"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.firesale_requests
           WHERE id = 'f13e1000-0000-4000-8000-000000000001'),
          1, 'seller reads own request');
SELECT throws_ok($q$
  INSERT INTO public.firesale_requests
    (id, user_id, address, city, sqm, contact_email)
  VALUES
    ('f13e1000-0000-4000-8000-000000000002',
     'f13e0000-0000-4000-8000-000000000001',
     'Forbidden direct creation', 'Athens', 75, 't13-owner@example.test')
$q$, '42501', 'permission denied for table firesale_requests',
  'seller cannot create directly despite permissive insert policy');
SELECT throws_ok($q$
  DELETE FROM public.firesale_requests
  WHERE id = 'f13e1000-0000-4000-8000-000000000001'
$q$, '42501', 'permission denied for table firesale_requests',
  'seller cannot roll back directly');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'f13e0000-0000-4000-8000-000000000002', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"f13e0000-0000-4000-8000-000000000002"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.firesale_requests
           WHERE id = 'f13e1000-0000-4000-8000-000000000001'),
          0, 'unrelated seller cannot read request');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"anon"}', true);
SET LOCAL ROLE anon;
SELECT throws_ok($q$
  INSERT INTO public.firesale_requests
    (id, address, city, sqm, contact_email)
  VALUES
    ('f13e1000-0000-4000-8000-000000000003',
     'Forbidden anonymous creation', 'Athens', 75, 'anon@example.test')
$q$, '42501', 'permission denied for table firesale_requests',
  'anonymous cannot create directly');
SELECT throws_ok($q$
  DELETE FROM public.firesale_requests
  WHERE id = 'f13e1000-0000-4000-8000-000000000001'
$q$, '42501', 'permission denied for table firesale_requests',
  'anonymous cannot delete directly');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'f13e0000-0000-4000-8000-000000000003', true),
       set_config('request.jwt.claims', '{"role":"authenticated","sub":"f13e0000-0000-4000-8000-000000000003"}', true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.firesale_requests
           WHERE id = 'f13e1000-0000-4000-8000-000000000001'),
          1, 'platform admin keeps intended SELECT policy');
SELECT lives_ok($q$
  UPDATE public.firesale_requests SET admin_notes = 'Task 13 reviewed'
  WHERE id = 'f13e1000-0000-4000-8000-000000000001'
$q$, 'platform admin keeps intended UPDATE capability');
RESET ROLE;
SELECT is((SELECT admin_notes FROM public.firesale_requests
           WHERE id = 'f13e1000-0000-4000-8000-000000000001'),
          'Task 13 reviewed', 'platform admin update reached the row');
SELECT is((SELECT count(*)::integer FROM public.firesale_requests
           WHERE id::text LIKE 'f13e1000-%'),
          1, 'rejected browser writes changed no rows');

SELECT set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL ROLE service_role;
SELECT lives_ok($q$
  DELETE FROM public.firesale_requests
  WHERE id = 'f13e1000-0000-4000-8000-000000000001'
$q$, 'service rollback DELETE succeeds with normal triggers');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.firesale_requests
           WHERE id::text LIKE 'f13e1000-%'),
          0, 'service rollback removed request');
SELECT * FROM finish();
ROLLBACK;
