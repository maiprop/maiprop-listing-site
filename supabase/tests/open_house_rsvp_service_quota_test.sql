\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(40);

-- Synthetic identities/listings are the only setup that bypasses onboarding
-- triggers. Every registration action below runs with origin triggers enabled.
SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id) VALUES
  ('d1220001-0000-4000-8000-000000000001'),
  ('d1220001-0000-4000-8000-000000000002'),
  ('d1220001-0000-4000-8000-000000000003'),
  ('d1220001-0000-4000-8000-000000000004'),
  ('d1220001-0000-4000-8000-000000000005'),
  ('d1220001-0000-4000-8000-000000000006');
INSERT INTO public.profiles(user_id, role, force_pro_access, is_platform_admin, account_status) VALUES
  ('d1220001-0000-4000-8000-000000000001','seller',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000002','buyer',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000003','buyer',true,false,'active'),
  ('d1220001-0000-4000-8000-000000000004','seller',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000005','buyer',false,false,'active'),
  ('d1220001-0000-4000-8000-000000000006','buyer',false,false,'active');
INSERT INTO public.listings(id, owner_id, title, city, price, sqm, property_type, listing_type, status, open_house_date, open_house_transaction_type)
SELECT ('d1220002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'd1220001-0000-4000-8000-000000000001', 'Task22 listing ' || n, 'Athens', 200000, 80,
  'apartment', 'open_house', 'active', now() + interval '7 days', 'sale'
FROM generate_series(1,8) n;
INSERT INTO public.open_house_settings(listing_id,max_total_visitors,timeslots)
VALUES ('d1220002-0000-4000-8000-000000000007',1,'[]'),
       ('d1220002-0000-4000-8000-000000000008',NULL,'[{"start":"10:00","end":"11:00","max_visitors":1}]');
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
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000002' AND listing_id='d1220002-0000-4000-8000-000000000001'), 1, 'first listing has one registration before replay');
SET LOCAL ROLE service_role;
SELECT lives_ok($$DO $body$ BEGIN
  FOR n IN 1..4 LOOP
    PERFORM set_config('maiprop.open_house_registration_rpc','',true);
    PERFORM public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000003',('d1220002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,NULL,'Pro Buyer','pro@example.test','+30000000002',NULL,NULL,true,true,true);
  END LOOP;
END $body$; $$, 'Pro buyer admits four distinct RSVPs');
SELECT lives_ok($$DO $body$ BEGIN
  FOR n IN 1..4 LOOP
    PERFORM set_config('maiprop.open_house_registration_rpc','',true);
    PERFORM public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000004',('d1220002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,NULL,'Seller','seller@example.test','+30000000003',NULL,NULL,true,true,true);
  END LOOP;
END $body$; $$, 'non-buyer admits four distinct RSVPs');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000003'),4,'Pro fourth admission is stored');
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000004'),4,'non-buyer fourth admission is stored');

-- Capture the first receipt as an observer, then replay as the real caller at
-- quota with changed contact fields. Compare the entire returned stored row.
CREATE TEMP TABLE task22_receipt AS SELECT to_jsonb(r) AS receipt
FROM public.open_house_registrations r
WHERE requester_id='d1220001-0000-4000-8000-000000000002'
  AND listing_id='d1220002-0000-4000-8000-000000000001';
GRANT SELECT ON task22_receipt TO service_role;
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'active service proof has no user subject');
SELECT set_config('maiprop.open_house_registration_rpc','',true);
SELECT is(to_jsonb(public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000002','d1220002-0000-4000-8000-000000000001',NULL,'Changed Buyer','changed@example.test','+30000000999',NULL,'changed',true,true,true)),(SELECT receipt FROM task22_receipt),'retry at quota returns the exact stored receipt without adopting changed fields');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000002'),3,'retry at quota creates no fourth row');

-- The retained RPC uses a real requester subject and the same quota trigger.
SELECT set_config('request.jwt.claim.sub','d1220001-0000-4000-8000-000000000002',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1220001-0000-4000-8000-000000000002"}',true),
       set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.create_open_house_registration('d1220002-0000-4000-8000-000000000004',NULL,'Free Buyer','free@example.test','+30000000001',NULL,NULL,true,true,true)$$,'P0001','open_house_rsvp_limit_reached','legacy subject path also rejects a fourth RSVP');
SELECT is(to_jsonb(public.create_open_house_registration('d1220002-0000-4000-8000-000000000001',NULL,'Changed Buyer','changed@example.test','+30000000999',NULL,NULL,true,true,true)),(SELECT receipt FROM task22_receipt),'legacy retry returns the same stored receipt at quota');
SELECT set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),
       set_config('maiprop.open_house_registration_rpc','',true);

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
SELECT is((public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000005','d1220002-0000-4000-8000-000000000005',NULL,'Buyer Five','five@example.test','+30000000005',NULL,NULL,true,true,true)).status::text,'cancelled','retry does not reactivate an existing cancelled registration');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000005'),6,'cancelled retry leaves all six existing rows intact');
SET LOCAL ROLE service_role;

-- A service RPC cannot use a mismatched authenticated subject, even though the
-- explicit requester is normally supplied by the trusted Edge Function.
SELECT set_config('request.jwt.claim.sub','d1220001-0000-4000-8000-000000000002',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1220001-0000-4000-8000-000000000002"}',true);
SELECT throws_ok($$SELECT (public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000003','d1220002-0000-4000-8000-000000000005',NULL,'Pro Buyer','pro@example.test','+30000000002',NULL,NULL,true,true,true)).id$$, 'P0001', 'open_house_rsvp_requester_mismatch', 'service RPC rejects a mismatched authenticated subject');

-- The privileged observer reaches the RPC guard directly. The real service
-- role also has an earlier table-ACL boundary on this local source fixture.
SELECT set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),
       set_config('maiprop.open_house_registration_rpc','',true);
RESET ROLE;
SELECT throws_ok($$INSERT INTO public.open_house_registrations(listing_id,requester_id,contact_name,contact_email,contact_phone,contact_permission_at,id_verification_consent_at,privacy_acknowledged_at,status) VALUES ('d1220002-0000-4000-8000-000000000008','d1220001-0000-4000-8000-000000000004','Direct Insert','direct@example.test','+30000000004',now(),now(),now(),'pending')$$, '42501', 'use_create_open_house_registration_rpc', 'raw insert without the RPC marker remains denied');
SELECT set_config('maiprop.open_house_registration_rpc','d1220001-0000-4000-8000-000000000003',true);
SELECT throws_ok($$INSERT INTO public.open_house_registrations(listing_id,requester_id,contact_name,contact_email,contact_phone,contact_permission_at,id_verification_consent_at,privacy_acknowledged_at,status) VALUES ('d1220002-0000-4000-8000-000000000008','d1220001-0000-4000-8000-000000000004','Direct Insert','direct@example.test','+30000000004',now(),now(),now(),'pending')$$, '42501', 'use_create_open_house_registration_rpc', 'raw insert with a different requester marker remains denied');

-- A separate legacy buyer must still be admitted three times, not merely
-- denied after the explicit-user path populated their allowance.
SELECT set_config('request.jwt.claim.sub','d1220001-0000-4000-8000-000000000006',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1220001-0000-4000-8000-000000000006"}',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($$DO $body$ BEGIN
  FOR n IN 1..3 LOOP
    PERFORM set_config('maiprop.open_house_registration_rpc','',true);
    PERFORM public.create_open_house_registration(('d1220002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,NULL,'Legacy Buyer','legacy@example.test','+30000000006',NULL,NULL,true,true,true);
  END LOOP;
END $body$; $$,'legacy path admits three distinct free registrations');
SELECT throws_ok($$SELECT public.create_open_house_registration('d1220002-0000-4000-8000-000000000004',NULL,'Legacy Buyer','legacy@example.test','+30000000006',NULL,NULL,true,true,true)$$,'P0001','open_house_rsvp_limit_reached','legacy fourth admission is rejected');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE requester_id='d1220001-0000-4000-8000-000000000006'),3,'legacy denial preserves exactly three stored rows');

-- Unlimited account quotas do not bypass venue or timeslot capacity.
SELECT set_config('request.jwt.claim.sub','',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),
       set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000003','d1220002-0000-4000-8000-000000000007',NULL,'Pro Buyer','pro@example.test','+30000000002',NULL,NULL,true,true,true)$$,'23514','open_house_total_capacity_reached','existing registration still consumes venue capacity regardless of its month');
SELECT lives_ok($$SELECT public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000003','d1220002-0000-4000-8000-000000000008',0,'Pro Buyer','pro@example.test','+30000000002',NULL,NULL,true,true,true)$$,'one visitor fills the slot');
SELECT throws_ok($$SELECT public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000004','d1220002-0000-4000-8000-000000000008',0,'Seller','seller@example.test','+30000000003',NULL,NULL,true,true,true)$$,'23514','open_house_timeslot_capacity_reached','non-buyer quota does not bypass slot capacity');
SELECT throws_ok($$SELECT public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000004','d1220002-0000-4000-8000-000000000008',NULL,'Seller','seller@example.test','+30000000003',NULL,NULL,true,true,true)$$,'23514','open_house_timeslot_required','required slot validation is preserved');
SELECT throws_ok($$SELECT public.create_open_house_registration_for_user('d1220001-0000-4000-8000-000000000004','d1220002-0000-4000-8000-000000000008',1,'Seller','seller@example.test','+30000000003',NULL,NULL,true,true,true)$$,'22023','open_house_timeslot_invalid','invalid slot validation is preserved');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE listing_id='d1220002-0000-4000-8000-000000000008'),1,'failed slot admissions leave only the winning registration');
SELECT is((SELECT count(*)::integer FROM public.open_house_registrations WHERE listing_id='d1220002-0000-4000-8000-000000000007'),1,'failed venue admission leaves the original registration intact');

SELECT * FROM finish();
ROLLBACK;
