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
SELECT json_build_object('phase','before_offer','listing',(SELECT row_to_json(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT COALESCE(json_agg(row_to_json(o)),'[]') FROM (SELECT id,bidder_id,status,decided_by,decided_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001') o),'notifications',(SELECT COALESCE(json_agg(row_to_json(n)),'[]') FROM (SELECT user_id,type,title FROM public.notifications WHERE user_id IN ('d1131001-0000-4000-8000-000000000002','d1131001-0000-4000-8000-000000000003') ORDER BY user_id,type) n)) AS before_state;
SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true),set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT current_user,auth.uid(),auth.role(),current_setting('session_replication_role') AS triggers,
 has_table_privilege(current_user,'public.listings','SELECT') AS listing_select,
 has_column_privilege(current_user,'public.listings','id','SELECT') AS listing_id_select,
 has_column_privilege(current_user,'public.listings','owner_id','SELECT') AS listing_owner_select,
 has_table_privilege(current_user,'public.listings','UPDATE') AS listing_update;
DO $$ DECLARE v_blocked boolean:=false; BEGIN
 BEGIN
  PERFORM public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210000,'Synthetic valid attended offer','EUR');
 EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM <> 'permission denied for table listings' THEN RAISE; END IF;
  v_blocked:=true;
  RAISE NOTICE 'WORKFLOW_BLOCKED stage=submit_open_house_offer SQLSTATE=% message=%',SQLSTATE,SQLERRM;
 END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'Expected inspected listing ACL block was not reproduced; reassess workflow continuation'; END IF;
END $$;
RESET ROLE;
SELECT json_build_object('phase','after_block','listing',(SELECT row_to_json(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT COALESCE(json_agg(row_to_json(o)),'[]') FROM (SELECT id,bidder_id,status,decided_by,decided_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001') o),'notifications',(SELECT COALESCE(json_agg(row_to_json(n)),'[]') FROM (SELECT user_id,type,title FROM public.notifications WHERE user_id IN ('d1131001-0000-4000-8000-000000000002','d1131001-0000-4000-8000-000000000003') ORDER BY user_id,type) n)) AS after_state;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001')
 OR (SELECT status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') <> 'active'
 OR (SELECT count(*) FROM public.notifications WHERE user_id IN ('d1131001-0000-4000-8000-000000000002','d1131001-0000-4000-8000-000000000003')) <> 2
 THEN RAISE EXCEPTION 'Failed submit changed fixture workflow state'; END IF;
END $$;
ROLLBACK;
SELECT json_build_object('users',(SELECT count(*) FROM auth.users WHERE id::text LIKE 'd1131001-%'),'profiles',(SELECT count(*) FROM public.profiles WHERE user_id::text LIKE 'd1131001-%'),'listings',(SELECT count(*) FROM public.listings WHERE id::text LIKE 'd1131002-%'),'settings',(SELECT count(*) FROM public.open_house_settings WHERE listing_id::text LIKE 'd1131002-%'),'registrations',(SELECT count(*) FROM public.open_house_registrations WHERE listing_id::text LIKE 'd1131002-%'),'offers',(SELECT count(*) FROM public.open_house_offers WHERE listing_id::text LIKE 'd1131002-%'),'notifications',(SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1131001-%')) AS after_rollback;
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd1131001-%') OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'd1131001-%') OR EXISTS (SELECT 1 FROM public.listings WHERE id::text LIKE 'd1131002-%') OR EXISTS (SELECT 1 FROM public.open_house_settings WHERE listing_id::text LIKE 'd1131002-%') OR EXISTS (SELECT 1 FROM public.open_house_registrations WHERE listing_id::text LIKE 'd1131002-%') OR EXISTS (SELECT 1 FROM public.open_house_offers WHERE listing_id::text LIKE 'd1131002-%') OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'd1131001-%') THEN RAISE EXCEPTION 'Synthetic residue'; END IF;
END $$;
