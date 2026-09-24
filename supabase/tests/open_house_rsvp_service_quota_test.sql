\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(20);

-- Synthetic identities/listings are the only setup that bypasses onboarding
-- triggers. Every registration action below runs with origin triggers enabled.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES
  ('d1220001-0000-4000-8000-000000000001'),
  ('d1220001-0000-4000-8000-000000000002'),
  ('d1220001-0000-4000-8000-000000000003'),
  ('d1220001-0000-4000-8000-000000000004'),
  ('d1220001-0000-4000-8000-000000000005');
INSERT INTO public.profiles(user_id, role, force_pro_access, is_platform_admin, account_status) VALUES
  ('d1220001-0000-4000-8000-000000000001','seller',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000002','buyer',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000003','buyer',true,false,'active'),
  ('d1220001-0000-4000-8000-000000000004','seller',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000005','buyer',false,false,'active');
INSERT INTO public.listings(id, owner_id, title, city, price, sqm, property_type, listing_type, status, open_house_date, open_house_transaction_type)
SELECT ('d1220002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'd1220001-0000-4000-8000-000000000001', 'Task22 listing ' || n, 'Athens', 200000, 80,
  'apartment', 'open_house', 'active', now() + interval '7 days', 'sale'
FROM generate_series(1,8) n;
SET LOCAL session_replication_role = origin;
SELECT set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true);

SELECT is(public.get_open_house_rsvp_monthly_limit('d1220001-0000-4000-8000-000000000002'), 3, 'free buyer keeps the existing limit');
SELECT is(public.get_open_house_rsvp_monthly_limit('d1220001-0000-4000-8000-000000000003'), 999, 'Pro buyer remains unlimited');
SELECT is(public.get_open_house_rsvp_monthly_limit('d1220001-0000-4000-8000-000000000004'), 999, 'non-buyer remains unlimited');
SELECT ok((SELECT tgenabled = 'O' FROM pg_trigger WHERE tgname = 'trg_check_open_house_rsvp_monthly_limit' AND tgrelid = 'public.open_house_registrations'::regclass), 'quota trigger remains enabled');
SELECT ok(has_function_privilege('service_role', 'public.create_open_house_registration_for_user(uuid,uuid,integer,text,text,text,text,text,boolean,boolean,boolean)', 'EXECUTE'), 'service RPC remains service-only executable');
SELECT ok(has_function_privilege('service_role', 'public.create_open_house_registration(uuid,integer,text,text,text,text,text,boolean,boolean,boolean)', 'EXECUTE'), 'legacy RPC remains service-role executable');

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000002','d1220002-0000-4000-8000-000000000001',NULL,'Free Buyer','free@example.test','+30000000001',NULL,NULL,true,true,true)).id$$, 'service path admits first free RSVP');
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000002','d1220002-0000-4000-8000-000000000002',NULL,'Free Buyer','free@example.test','+30000000001',NULL,NULL,true,true,true)).id$$, 'service path admits second free RSVP');
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000002','d1220002-0000-4000-8000-000000000003',NULL,'Free Buyer','free@example.test','+30000000001',NULL,NULL,true,true,true)).id$$, 'service path admits third free RSVP');
SELECT throws_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000002','d1220002-0000-4000-8000-000000000004',NULL,'Free Buyer','free@example.test','+30000000001',NULL,NULL,true,true,true)).id$$, 'P0001', 'open_house_rsvp_limit_reached', 'service path rejects the fourth free RSVP');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000002'), 3, 'service path preserves exactly three free rows');
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000002' AND listing_id='d1220002-0000-4000-8000-000000000001'), 1, 'duplicate service RSVP keeps one identity');
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000003','d1220002-0000-4000-8000-000000000001',NULL,'Pro Buyer','pro@example.test','+30000000002',NULL,NULL,true,true,true)).id$$, 'Pro buyer remains admitted above free limit');
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000004','d1220002-0000-4000-8000-000000000002',NULL,'Seller','seller@example.test','+30000000003',NULL,NULL,true,true,true)).id$$, 'non-buyer remains admitted above free limit');

-- Current-month cancelled/rejected and prior-month rows do not consume the limit.
RESET ROLE;
SET LOCAL session_replication_role = replica;
INSERT INTO public.open_house_registrations(id, listing_id, requester_id, status, created_at, updated_at)
VALUES
 ('d1220003-0000-4000-8000-000000000001','d1220002-0000-4000-8000-000000000005','d1220001-0000-4000-8000-000000000005','cancelled',now(),now()),
 ('d1220003-0000-4000-8000-000000000002','d1220002-0000-4000-8000-000000000006','d1220001-0000-4000-8000-000000000005','rejected',now(),now()),
 ('d1220003-0000-4000-8000-000000000003','d1220002-0000-4000-8000-000000000007','d1220001-0000-4000-8000-000000000005','pending',date_trunc('month',now()) - interval '1 day',date_trunc('month',now()) - interval '1 day');
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE service_role;
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000005','d1220002-0000-4000-8000-000000000001',NULL,'Buyer Five','five@example.test','+30000000005',NULL,NULL,true,true,true)).id$$, 'excluded statuses and prior-month row do not consume quota');
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000005','d1220002-0000-4000-8000-000000000002',NULL,'Buyer Five','five@example.test','+30000000005',NULL,NULL,true,true,true)).id$$, 'buyer with excluded rows reaches second active RSVP');
SELECT lives_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000005','d1220002-0000-4000-8000-000000000003',NULL,'Buyer Five','five@example.test','+30000000005',NULL,NULL,true,true,true)).id$$, 'buyer with excluded rows reaches third active RSVP');
SELECT throws_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000005','d1220002-0000-4000-8000-000000000004',NULL,'Buyer Five','five@example.test','+30000000005',NULL,NULL,true,true,true)).id$$, 'P0001', 'open_house_rsvp_limit_reached', 'excluded rows do not change the existing limit');

-- A service RPC cannot use a mismatched authenticated subject, even though the
-- explicit requester is normally supplied by the trusted Edge Function.
SELECT set_config('request.jwt.claim.sub','d1220001-0000-4000-8000-000000000002',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1220001-0000-4000-8000-000000000002"}',true);
SELECT throws_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000003','d1220002-0000-4000-8000-000000000005',NULL,'Pro Buyer','pro@example.test','+30000000002',NULL,NULL,true,true,true)).id$$, 'P0001', 'open_house_rsvp_requester_mismatch', 'service RPC rejects a mismatched authenticated subject');

-- A direct service-role insert without the established marker remains blocked.
SELECT set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),
       set_config('maiprop.open_house_registration_rpc','',true);
RESET ROLE;
SELECT throws_ok($$INSERT INTO public.open_house_registrations(listing_id,requester_id,contact_name,contact_email,contact_phone,contact_permission_at,id_verification_consent_at,privacy_acknowledged_at,status) VALUES ('d1220002-0000-4000-8000-000000000008','d1220001-0000-4000-8000-000000000004','Direct Insert','direct@example.test','+30000000004',now(),now(),now(),'pending')$$, '42501', 'use_create_open_house_registration_rpc', 'raw insert without the RPC marker remains denied');

SELECT * FROM finish();
ROLLBACK;
