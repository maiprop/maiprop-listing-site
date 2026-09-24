\set ON_ERROR_STOP on
\pset pager off
CREATE EXTENSION IF NOT EXISTS pgtap;
CREATE EXTENSION IF NOT EXISTS dblink;

-- Seed two active rows for a free buyer, then race two service sessions for
-- different listings. The requester-month advisory lock must serialize them.
BEGIN;
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES
  ('d1221001-0000-4000-8000-000000000001'),
  ('d1221001-0000-4000-8000-000000000002');
INSERT INTO public.profiles(user_id, role, force_pro_access, is_platform_admin, account_status) VALUES
  ('d1221001-0000-4000-8000-000000000001', 'seller', false, false, 'active'),
  ('d1221001-0000-4000-8000-000000000002', 'buyer', false, false, 'active');
INSERT INTO public.listings(id, owner_id, title, city, price, sqm, property_type, listing_type, status, open_house_date, open_house_transaction_type)
SELECT ('d1221002-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1221001-0000-4000-8000-000000000001', 'Task22 race listing ' || n, 'Athens', 200000, 80,
  'apartment', 'open_house', 'active', now() + interval '7 days', 'sale'
FROM generate_series(9, 12) n;
INSERT INTO public.open_house_registrations(
  id, listing_id, requester_id, contact_name, contact_email, contact_phone,
  contact_permission_at, id_verification_consent_at, privacy_acknowledged_at,
  status, created_at, updated_at
)
SELECT ('d1221003-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  ('d1221002-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'd1221001-0000-4000-8000-000000000002', 'Seed Buyer', 'seed@example.test', '+30000000006',
  now(), now(), now(), 'pending', now(), now()
FROM generate_series(9, 10) n;
COMMIT;

BEGIN;
SELECT plan(6);
SELECT dblink_connect('rsvp_a', 'dbname=' || current_database());
SELECT dblink_connect('rsvp_b', 'dbname=' || current_database());

SELECT dblink_exec('rsvp_a', $$BEGIN; SET ROLE service_role; SET LOCAL request.jwt.claim.sub = ''; SET LOCAL request.jwt.claims = '{"role":"service_role"}'$$);
SELECT is((SELECT count(*)::integer FROM dblink(
  'rsvp_a',
  $$SELECT (public.create_open_house_registration_for_user('d1221001-0000-4000-8000-000000000002','d1221002-0000-4000-8000-000000000011',NULL,'Race Buyer','race@example.test','+30000000006',NULL,NULL,true,true,true)).id$$
) AS result(id uuid)), 1, 'first service RSVP race query completes while uncommitted');

SELECT dblink_exec('rsvp_b', $$BEGIN; SET ROLE service_role; SET LOCAL request.jwt.claim.sub = ''; SET LOCAL request.jwt.claims = '{"role":"service_role"}'$$);
SELECT is(dblink_send_query(
  'rsvp_b',
  $$SELECT (public.create_open_house_registration_for_user('d1221001-0000-4000-8000-000000000002','d1221002-0000-4000-8000-000000000012',NULL,'Race Buyer','race@example.test','+30000000006',NULL,NULL,true,true,true)).id$$
), 1, 'second service RSVP race query starts');
SELECT pg_sleep(0.2);
SELECT is(dblink_is_busy('rsvp_b'), 1, 'second RSVP blocks on the requester-month lock');
SELECT dblink_exec('rsvp_a', 'COMMIT');
SELECT throws_ok(
  $$SELECT * FROM dblink_get_result('rsvp_b') AS result(id uuid)$$,
  'P0001', 'open_house_rsvp_limit_reached',
  'second RSVP is rejected after the first commit reaches the free limit'
);
SELECT count(*) FROM dblink_get_result('rsvp_b') AS result(id uuid);
SELECT dblink_exec('rsvp_b', 'ROLLBACK');
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id = 'd1221001-0000-4000-8000-000000000002'), 3, 'race leaves exactly three active free-tier rows');
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE listing_id = 'd1221002-0000-4000-8000-000000000012'), 0, 'rejected contender does not persist a row');
SELECT dblink_disconnect('rsvp_a');
SELECT dblink_disconnect('rsvp_b');
SELECT * FROM finish();
ROLLBACK;

BEGIN;
SET LOCAL session_replication_role = replica;
DELETE FROM public.open_house_registrations WHERE requester_id = 'd1221001-0000-4000-8000-000000000002';
DELETE FROM public.listings WHERE id IN (
  'd1221002-0000-4000-8000-000000000009',
  'd1221002-0000-4000-8000-000000000010',
  'd1221002-0000-4000-8000-000000000011',
  'd1221002-0000-4000-8000-000000000012'
);
DELETE FROM public.profiles WHERE user_id IN (
  'd1221001-0000-4000-8000-000000000001',
  'd1221001-0000-4000-8000-000000000002'
);
DELETE FROM auth.users WHERE id IN (
  'd1221001-0000-4000-8000-000000000001',
  'd1221001-0000-4000-8000-000000000002'
);
COMMIT;
