\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
DO $$ BEGIN
 IF current_database()<>'maiprop_t23_impl_0927' OR inet_server_addr() IS NOT NULL
 THEN RAISE EXCEPTION 'Named local socket database required'; END IF;
END $$;
SELECT current_database(),version(),inet_server_addr() IS NULL AS unix_socket;
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id) VALUES ('d1131001-0000-4000-8000-000000000001'),('d1131001-0000-4000-8000-000000000002'),('d1131001-0000-4000-8000-000000000003');
INSERT INTO public.profiles(user_id,role) VALUES ('d1131001-0000-4000-8000-000000000001','seller'),('d1131001-0000-4000-8000-000000000002','buyer'),('d1131001-0000-4000-8000-000000000003','buyer');
SET LOCAL session_replication_role=origin;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,open_house_date,open_house_transaction_type)
VALUES ('d1131002-0000-4000-8000-000000000001','d1131001-0000-4000-8000-000000000001','Synthetic offer reopen probe','Athens',200000,80,'apartment','open_house','active',now()+interval '7 days','sale');
INSERT INTO public.open_house_settings(listing_id,timeslots,allow_sealed_bids,require_proof_of_funds,offer_deadline)
VALUES ('d1131002-0000-4000-8000-000000000001','[]',true,false,now()+interval '1 hour');
SET LOCAL ROLE service_role;
SELECT id,status FROM public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000002','d1131002-0000-4000-8000-000000000001',NULL,'Synthetic A','a@example.test','+300000001',NULL,NULL,true,true,true);
SELECT id,status FROM public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000003','d1131002-0000-4000-8000-000000000001',NULL,'Synthetic B','b@example.test','+300000002',NULL,NULL,true,true,true);
RESET ROLE;
-- Fixture-only attendance preparation, privileged observer with host identity and origin triggers.
-- This is not evidence of authenticated host UPDATE permission.
SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true);
UPDATE public.open_house_registrations SET status='approved',approved_by='d1131001-0000-4000-8000-000000000001',approved_at=now() WHERE listing_id='d1131002-0000-4000-8000-000000000001';
UPDATE public.open_house_registrations SET status='attended',attended_at=now() WHERE listing_id='d1131002-0000-4000-8000-000000000001';
UPDATE public.listings SET open_house_date=now()-interval '2 hours' WHERE id='d1131002-0000-4000-8000-000000000001';
SELECT requester_id,status FROM public.open_house_registrations WHERE listing_id='d1131002-0000-4000-8000-000000000001' ORDER BY requester_id;
CREATE EXTENSION IF NOT EXISTS pgtap; SELECT no_plan();
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id) VALUES ('d1131001-0000-4000-8000-000000000005');
INSERT INTO public.profiles(user_id,role) VALUES ('d1131001-0000-4000-8000-000000000005','buyer');
INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('d1131003-0000-4000-8000-000000000001','Task23 organization','task23-organization','d1131001-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships(organization_id,user_id,role,status) VALUES ('d1131003-0000-4000-8000-000000000001','d1131001-0000-4000-8000-000000000005','admin','active');
UPDATE public.listings SET organization_id='d1131003-0000-4000-8000-000000000001' WHERE id='d1131002-0000-4000-8000-000000000001';
SET LOCAL session_replication_role=origin;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000005',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000005"}',true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),0,'organization administrator gains no unrelated public context');
SELECT is((SELECT count(*)::int FROM public.open_house_registrations),0,'organization administrator gains no child rows');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT ok(private.current_user_owns_listing('d1131002-0000-4000-8000-000000000001'),'actual organization listing owner remains owner');
RESET ROLE; UPDATE public.listings SET listing_type='sale',open_house_transaction_type=NULL WHERE id='d1131002-0000-4000-8000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),1,'historical type-changed active participant summary retained');
SELECT is((SELECT open_house_settings FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),'[]'::jsonb,'type-changed participant does not get hidden settings');
RESET ROLE; UPDATE public.listings SET is_off_market=true WHERE id='d1131002-0000-4000-8000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),0,'off-market participant context absent');
SELECT is((SELECT count(*)::int FROM public.open_house_registrations),1,'off-market participant own registration retained');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::int FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),1,'type-changed off-market owner keeps context');
SELECT ok(private.current_user_owns_listing('d1131002-0000-4000-8000-000000000001'),'shared helper retains type-changed off-market owner semantics');
SELECT ok(NOT private.current_user_owns_listing(NULL),'NULL listing is not owned');
SELECT ok(NOT private.current_user_owns_listing('00000000-0000-0000-0000-000000000000'),'absent listing is not owned');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true); SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::int FROM public.open_house_settings),0,'anon settings hide off-market row through stored private helper policy');
RESET ROLE; UPDATE public.listings SET listing_type='open_house',open_house_transaction_type='sale',is_off_market=false WHERE id='d1131002-0000-4000-8000-000000000001';
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true); SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'','a@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_contact_name_required','required name preserved');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'Name','','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_contact_email_required','required email preserved');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'Name','a@example.test','',NULL,NULL,true,true,true)$q$,'23514','open_house_contact_phone_required','required phone preserved');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'Name','a@example.test','+3000',NULL,NULL,false,true,true)$q$,'23514','open_house_contact_permission_required','required permission preserved');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'Name','a@example.test','+3000',NULL,NULL,true,false,true)$q$,'23514','open_house_id_verification_consent_required','required id_verification_consent preserved');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'Name','a@example.test','+3000',NULL,NULL,true,true,false)$q$,'23514','open_house_privacy_acknowledgement_required','required privacy_acknowledgement preserved');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1131001-0000-4000-8000-000000000005','d1131002-0000-4000-8000-000000000001',NULL,'Name','a@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_registration_closed','past event closes RSVP');
RESET ROLE; SELECT is((SELECT count(*)::int FROM public.open_house_registrations),2,'all rejected statements preserve original registration count');
SELECT * FROM finish(); ROLLBACK;