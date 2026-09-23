\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE EXTENSION IF NOT EXISTS dblink;

BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('e1850000-0000-4000-8000-000000000001'),
  ('e1850000-0000-4000-8000-000000000002');
INSERT INTO public.profiles (user_id, role) VALUES
  ('e1850000-0000-4000-8000-000000000001', 'developer'),
  ('e1850000-0000-4000-8000-000000000002', 'buyer');
INSERT INTO public.projects (id, owner_id, name, status)
VALUES ('e1860000-0000-4000-8000-000000000001', 'e1850000-0000-4000-8000-000000000001', 'Task18 race project', 'active');
INSERT INTO public.listings (id, owner_id, title, city, price, sqm, property_type, listing_type, status, project_id)
VALUES ('e1870000-0000-4000-8000-000000000001', 'e1850000-0000-4000-8000-000000000001', 'Task18 race listing', 'Athens', 430000, 86, 'apartment', 'new_build', 'active', 'e1860000-0000-4000-8000-000000000001');
COMMIT;

SELECT plan(10);
SELECT dblink_connect('race_a', 'dbname=' || current_database());
SELECT dblink_connect('race_b', 'dbname=' || current_database());
CREATE TEMP TABLE task18_receipts (phase text, id uuid, listing_id uuid, created_at timestamptz);

SELECT dblink_exec('race_a', $$BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"e1850000-0000-4000-8000-000000000002","role":"authenticated"}'$$);
INSERT INTO task18_receipts
SELECT 'commit-a', r.* FROM dblink(
  'race_a',
  $$SELECT * FROM public.submit_new_build_enquiry('e1880000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000002','e1870000-0000-4000-8000-000000000001','race@example.com','Race Buyer',NULL,'Commit winner')$$
) AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT dblink_exec('race_b', $$BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"e1850000-0000-4000-8000-000000000002","role":"authenticated"}'$$);
SELECT is(dblink_send_query(
  'race_b',
  $$SELECT * FROM public.submit_new_build_enquiry('e1880000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000002','e1870000-0000-4000-8000-000000000001','race@example.com','Race Buyer',NULL,'Commit winner')$$
), 1, 'overlapping replay query starts in a separate session');
SELECT pg_sleep(0.2);
SELECT is(dblink_is_busy('race_b'), 1, 'same-key replay blocks on the uncommitted winner');
SELECT dblink_exec('race_a', 'COMMIT');
INSERT INTO task18_receipts
SELECT 'commit-b', r.* FROM dblink_get_result('race_b') AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT count(*) FROM dblink_get_result('race_b') AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT dblink_exec('race_b', 'COMMIT');
SELECT is((SELECT count(DISTINCT id)::integer FROM task18_receipts WHERE phase LIKE 'commit-%'), 1, 'commit race returns the winning stored id to both sessions');
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1880000-0000-4000-8000-000000000001'), 1, 'commit race persists one raw row');

SELECT dblink_exec('race_a', $$BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"e1850000-0000-4000-8000-000000000002","role":"authenticated"}'$$);
INSERT INTO task18_receipts
SELECT 'rollback-a', r.* FROM dblink(
  'race_a',
  $$SELECT * FROM public.submit_new_build_enquiry('e1880000-0000-4000-8000-000000000002','e1850000-0000-4000-8000-000000000002','e1870000-0000-4000-8000-000000000001','race@example.com','Race Buyer',NULL,'Rollback winner')$$
) AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT dblink_exec('race_b', $$BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"e1850000-0000-4000-8000-000000000002","role":"authenticated"}'$$);
SELECT is(dblink_send_query(
  'race_b',
  $$SELECT * FROM public.submit_new_build_enquiry('e1880000-0000-4000-8000-000000000002','e1850000-0000-4000-8000-000000000002','e1870000-0000-4000-8000-000000000001','race@example.com','Race Buyer',NULL,'Rollback winner')$$
), 1, 'rollback contender starts in a separate session');
SELECT pg_sleep(0.2);
SELECT is(dblink_is_busy('race_b'), 1, 'rollback contender blocks on the uncommitted row');
SELECT dblink_exec('race_a', 'ROLLBACK');
INSERT INTO task18_receipts
SELECT 'rollback-b', r.* FROM dblink_get_result('race_b') AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT count(*) FROM dblink_get_result('race_b') AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT dblink_exec('race_b', 'COMMIT');
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1880000-0000-4000-8000-000000000002'), 1, 'rollback contender becomes the sole committed insert');

SELECT dblink_exec('race_a', $$BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"e1850000-0000-4000-8000-000000000002","role":"authenticated"}'$$);
INSERT INTO task18_receipts
SELECT 'conflict-a', r.* FROM dblink(
  'race_a',
  $$SELECT * FROM public.submit_new_build_enquiry('e1880000-0000-4000-8000-000000000003','e1850000-0000-4000-8000-000000000002','e1870000-0000-4000-8000-000000000001','race@example.com','Race Buyer',NULL,'Original details')$$
) AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT dblink_exec('race_b', $$BEGIN; SET ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"e1850000-0000-4000-8000-000000000002","role":"authenticated"}'$$);
SELECT dblink_send_query(
  'race_b',
  $$SELECT * FROM public.submit_new_build_enquiry('e1880000-0000-4000-8000-000000000003','e1850000-0000-4000-8000-000000000002','e1870000-0000-4000-8000-000000000001','race@example.com','Race Buyer',NULL,'Changed details')$$
);
SELECT pg_sleep(0.2);
SELECT dblink_exec('race_a', 'COMMIT');
SELECT throws_ok(
  $$SELECT * FROM dblink_get_result('race_b') AS r(id uuid, listing_id uuid, created_at timestamptz)$$,
  'PT409', 'enquiry_submission_payload_conflict', 'overlapping changed payload rejects after the winner commits'
);
SELECT count(*) FROM dblink_get_result('race_b') AS r(id uuid, listing_id uuid, created_at timestamptz);
SELECT dblink_exec('race_b', 'ROLLBACK');
SELECT is((SELECT notes FROM public.new_building_leads WHERE submission_key='e1880000-0000-4000-8000-000000000003'), 'Original details', 'conflict race does not mutate the winner');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e1850000-0000-4000-8000-000000000001' AND type='new_interest'), 3, 'three winning physical inserts emit three notifications');

SELECT dblink_disconnect('race_a');
SELECT dblink_disconnect('race_b');
SELECT * FROM finish();

BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM public.notifications WHERE user_id IN ('e1850000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000002');
DELETE FROM public.project_leads WHERE project_id='e1860000-0000-4000-8000-000000000001';
DELETE FROM public.leads WHERE listing_id='e1870000-0000-4000-8000-000000000001';
DELETE FROM public.new_building_leads WHERE new_building_id='e1870000-0000-4000-8000-000000000001';
DELETE FROM public.listings WHERE id='e1870000-0000-4000-8000-000000000001';
DELETE FROM public.projects WHERE id='e1860000-0000-4000-8000-000000000001';
DELETE FROM public.profiles WHERE user_id IN ('e1850000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000002');
DELETE FROM auth.users WHERE id IN ('e1850000-0000-4000-8000-000000000001','e1850000-0000-4000-8000-000000000002');
COMMIT;
