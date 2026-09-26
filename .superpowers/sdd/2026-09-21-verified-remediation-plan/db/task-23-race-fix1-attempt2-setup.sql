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
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210000,NULL,'EUR');RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000003"}',true); SET LOCAL ROLE authenticated;
SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',220000,NULL,'EUR');RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
UPDATE public.open_house_settings SET offer_deadline=now()-interval '1 hour'; UPDATE public.open_house_offers SET status='revealed'; COMMIT;