\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
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
INSERT INTO auth.users(id) VALUES ('d1131001-0000-4000-8000-000000000004'),('d1131001-0000-4000-8000-000000000005');
INSERT INTO public.profiles(user_id,role,is_platform_admin) VALUES ('d1131001-0000-4000-8000-000000000004','admin',false),('d1131001-0000-4000-8000-000000000005','buyer',true);
SET LOCAL session_replication_role=origin;
UPDATE public.open_house_registrations SET id_doc_url='secret-id',proof_of_funds_url=requester_id::text||'/'||listing_id::text||'/proof.pdf',status='approved',rejection_reason='ADMISSION_REASON';
UPDATE public.open_house_registrations SET status='attended';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*)=1 FROM public.open_house_registrations),'requester reads own full row');
SELECT ok((SELECT count(*)=1 FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid,'d1131002-0000-4000-8000-000000000001'::uuid])),'participant context deduplicates');
SELECT throws_ok($q$SELECT * FROM public.listings$q$,'42501','permission denied for table listings','raw listing select remains denied');
SELECT throws_ok($q$UPDATE public.listings SET title='bad' WHERE id='d1131002-0000-4000-8000-000000000001'$q$,'42501','permission denied for table listings','raw listing update remains denied');
SELECT lives_ok($q$SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210002,'bid','EUR')$q$,'attended A submits as authenticated');
SELECT throws_ok($q$UPDATE public.open_house_offers SET bidder_id='d1131001-0000-4000-8000-000000000003'$q$,'P0001','offer_identity_fields_are_immutable','bidder identity immutable');
SELECT throws_ok($q$UPDATE public.open_house_offers SET status='accepted'$q$,'P0001','bidder_can_only_withdraw_active_offer','direct bidder acceptance denied');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000003"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210003,'bid','EUR')$q$,'attended B submits as authenticated');
RESET ROLE; SELECT 'submitted' AS phase,jsonb_build_object('listing',(SELECT to_jsonb(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT id,bidder_id,status,decided_by,decided_at,revealed_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' ORDER BY bidder_id) o),'notifications',(SELECT jsonb_agg(to_jsonb(n)) FROM (SELECT user_id,type,title,body FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' ORDER BY user_id,title) n));
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*)=2 FROM public.open_house_registrations),'host sees both registrations');
SELECT lives_ok($q$INSERT INTO public.open_house_settings(listing_id,broker_required) VALUES ('d1131002-0000-4000-8000-000000000001',true) ON CONFLICT(listing_id) DO UPDATE SET broker_required=true$q$,'host settings upsert returning policy');
SELECT throws_ok($q$UPDATE public.open_house_offers SET status='revealed'$q$,'P0001','bids_cannot_be_revealed_before_deadline','deadline guards direct host reveal');
SELECT lives_ok($q$UPDATE public.open_house_settings SET offer_deadline=now()-interval '1 hour' WHERE listing_id='d1131002-0000-4000-8000-000000000001'$q$,'host closes fixture deadline');
SELECT lives_ok($q$UPDATE public.open_house_offers SET status='revealed',revealed_at=now() WHERE status='submitted'$q$,'host reveals both');
SELECT throws_ok($q$UPDATE public.open_house_offers SET status='accepted' WHERE bidder_id='d1131001-0000-4000-8000-000000000002'$q$,'P0001','accepted_offers_must_use_accept_rpc','direct host acceptance requires RPC');
RESET ROLE; SELECT 'revealed' AS phase,jsonb_build_object('listing',(SELECT to_jsonb(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT id,bidder_id,status,decided_by,decided_at,revealed_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' ORDER BY bidder_id) o),'notifications',(SELECT jsonb_agg(to_jsonb(n)) FROM (SELECT user_id,type,title,body FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' ORDER BY user_id,title) n));
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT public.accept_open_house_offer((SELECT id FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND bidder_id='d1131001-0000-4000-8000-000000000002'))$q$,'host accepts A');
RESET ROLE; SELECT 'accepted_A' AS phase,jsonb_build_object('listing',(SELECT to_jsonb(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT id,bidder_id,status,decided_by,decided_at,revealed_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' ORDER BY bidder_id) o),'notifications',(SELECT jsonb_agg(to_jsonb(n)) FROM (SELECT user_id,type,title,body FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' ORDER BY user_id,title) n));
SELECT ok((SELECT status='paused' FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001'),'acceptance pauses listing');
SELECT ok((SELECT count(*)=2 FROM public.open_house_offers WHERE decided_by='d1131001-0000-4000-8000-000000000001' AND decided_at IS NOT NULL),'both decisions identify host');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*)=0 FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),'paused participant context absent');
SELECT ok((SELECT count(*)=1 FROM public.open_house_offers),'paused participant retains own offer');
SELECT throws_ok($q$UPDATE public.open_house_offers SET status='withdrawn'$q$,'P0001','open_house_listing_not_found','paused listing mutation denied');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*)=1 FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),'paused owner context retained');
SELECT lives_ok($q$SELECT public.reopen_open_house_offer_selection('d1131002-0000-4000-8000-000000000001')$q$,'host reopens paused selection');
RESET ROLE; SELECT 'reopened' AS phase,jsonb_build_object('listing',(SELECT to_jsonb(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT id,bidder_id,status,decided_by,decided_at,revealed_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' ORDER BY bidder_id) o),'notifications',(SELECT jsonb_agg(to_jsonb(n)) FROM (SELECT user_id,type,title,body FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' ORDER BY user_id,title) n));
SELECT ok((SELECT status='active' FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001'),'reopen reactivates');
SELECT ok((SELECT count(*)=2 FROM public.open_house_offers WHERE status='revealed' AND decided_at IS NULL AND decided_by IS NULL),'reopen clears both decisions');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.reopen_open_house_offer_selection('d1131002-0000-4000-8000-000000000001')$q$,'P0001','open_house_no_accepted_offer_to_reopen','stale reopen fails');
SELECT lives_ok($q$SELECT public.accept_open_house_offer((SELECT id FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND bidder_id='d1131001-0000-4000-8000-000000000003'))$q$,'host selects B');
SELECT throws_ok($q$SELECT public.accept_open_house_offer((SELECT id FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND bidder_id='d1131001-0000-4000-8000-000000000002'))$q$,'P0001','only_revealed_offers_can_be_accepted','stale accept fails');
RESET ROLE; SELECT 'accepted_B' AS phase,jsonb_build_object('listing',(SELECT to_jsonb(l) FROM (SELECT id,status FROM public.listings WHERE id='d1131002-0000-4000-8000-000000000001') l),'offers',(SELECT jsonb_agg(to_jsonb(o)) FROM (SELECT id,bidder_id,status,decided_by,decided_at,revealed_at FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' ORDER BY bidder_id) o),'notifications',(SELECT jsonb_agg(to_jsonb(n)) FROM (SELECT user_id,type,title,body FROM public.notifications WHERE user_id::text LIKE 'd1131001-%' ORDER BY user_id,title) n));
SELECT ok((SELECT count(*)=8 FROM public.notifications WHERE type='open_house_offer' AND user_id::text LIKE 'd1131001-%'),'exact reveal accept reopen reselect transitions, stale operations add none');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000004"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT private.has_platform_admin(auth.uid())),'profile role is authoritative admin');
SELECT ok((SELECT count(*)=0 FROM public.open_house_registrations),'admin has no general registration authority');
SELECT ok((SELECT count(*)=0 FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),'admin no private context');
SELECT ok((SELECT count(*)=2 FROM public.get_admin_open_house_pof_reviews()),'dedicated admin reads proof rows');
SELECT throws_ok($q$SELECT public.accept_open_house_offer('00000000-0000-0000-0000-000000000000')$q$,'P0001','open_house_offer_not_found','missing offer handled');
SELECT lives_ok($q$UPDATE public.open_house_registrations SET pof_verified_status='verified'$q$,'raw admin update affects zero rows');
RESET ROLE; CREATE TEMP TABLE t23_before AS SELECT id,to_jsonb(r) AS doc,updated_at FROM public.open_house_registrations r; GRANT SELECT ON t23_before TO authenticated;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000004"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM t23_before LIMIT 1),'rejected','POF_REASON',(SELECT updated_at FROM t23_before LIMIT 1))$q$,'admin reviews exact proof with real row');
SELECT ok((SELECT pof_verified_status='rejected' AND pof_rejection_reason='POF_REASON' FROM public.get_admin_open_house_pof_reviews() WHERE id=(SELECT id FROM t23_before LIMIT 1)),'admin result stores decision and reason');
SELECT throws_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM t23_before LIMIT 1),'verified',NULL,'2000-01-01')$q$,'40001','open_house_pof_review_conflict','stale review conflicts');
SELECT throws_ok($q$SELECT * FROM public.review_admin_open_house_pof('00000000-0000-0000-0000-000000000000','verified',NULL,NULL)$q$,'P0002','open_house_pof_review_not_found','missing review not zero-row success');
SELECT throws_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM t23_before LIMIT 1),'rejected',' ',NULL)$q$,'22023','invalid_open_house_pof_decision','blank rejection invalid');
RESET ROLE;
SELECT ok((SELECT bool_and((to_jsonb(r)-ARRAY['pof_verified_status','pof_rejection_reason','updated_at'])=(b.doc-ARRAY['pof_verified_status','pof_rejection_reason','updated_at'])) FROM public.open_house_registrations r JOIN t23_before b USING(id)),'admin preserves every unrelated column');
SELECT ok((SELECT count(*)=1 FROM public.notifications WHERE type='pof_review' AND body LIKE '%POF_REASON'),'POF notification uses proof rejection reason');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000005',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000005"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT NOT private.has_platform_admin(auth.uid())),'legacy admin flag grants no authority');
SELECT throws_ok($q$SELECT * FROM public.get_admin_open_house_pof_reviews()$q$,'42501','platform_admin_required','nonadmin dedicated read denied');
SELECT throws_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM t23_before LIMIT 1),'verified',NULL,NULL)$q$,'42501','platform_admin_required','nonadmin review denied');
RESET ROLE; UPDATE public.listings SET status='active' WHERE id='d1131002-0000-4000-8000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000005',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000005"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT count(*)=0 FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),'unrelated actor cannot probe active public id');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.accept_open_house_offer((SELECT id FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001' AND bidder_id='d1131001-0000-4000-8000-000000000002'))$q$,'P0001','only_host_can_accept_offer','bidder cannot accept own offer');
SELECT throws_ok($q$SELECT public.reopen_open_house_offer_selection('d1131002-0000-4000-8000-000000000001')$q$,'P0001','only_host_can_reopen_offer_selection','bidder cannot reopen');
SELECT throws_ok($q$SELECT * FROM public.get_open_house_listing_context(NULL)$q$,'22023','invalid_open_house_listing_ids','null list invalid');
SELECT throws_ok($q$SELECT * FROM public.get_open_house_listing_context(ARRAY[NULL::uuid])$q$,'22023','invalid_open_house_listing_ids','null list member invalid');
SELECT throws_ok($q$SELECT * FROM public.get_open_house_listing_context(array_fill('d1131002-0000-4000-8000-000000000001'::uuid,ARRAY[101]))$q$,'22023','invalid_open_house_listing_ids','oversized list invalid');
SELECT ok((SELECT count(*)=0 FROM public.get_open_house_listing_context('{}')),'empty list empty');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true); SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.accept_open_house_offer('00000000-0000-0000-0000-000000000000')$q$,'P0001','not_authenticated','no-sub service cannot accept');
SELECT throws_ok($q$SELECT * FROM public.get_admin_open_house_pof_reviews()$q$,'42501','platform_admin_required','no-sub service cannot review');
SELECT ok((SELECT NOT private.current_user_owns_listing('d1131002-0000-4000-8000-000000000001')),'service without sub is not owner');
SELECT ok((SELECT count(*)=0 FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])),'no-sub context empty');
RESET ROLE; SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT * FROM public.get_open_house_listing_context(ARRAY['d1131002-0000-4000-8000-000000000001'::uuid])$q$,'42501','permission denied for function get_open_house_listing_context','anon context execute denied');
SELECT ok((SELECT count(*)=1 FROM public.open_house_settings),'anonymous active settings policy remains compatible without private schema usage');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000004"}',true); SET LOCAL ROLE authenticated;
RESET ROLE; SELECT set_config('maiprop.open_house_pof_review_rpc',(SELECT id::text FROM t23_before LIMIT 1),true);
SELECT throws_ok($q$UPDATE public.open_house_registrations SET mortgage_status='yes',pof_verified_status='verified',pof_rejection_reason=NULL WHERE id=(SELECT id FROM t23_before LIMIT 1)$q$,'P0001','not_authorized_for_open_house_registration','admin marker cannot change mortgage_status');
SELECT throws_ok($q$UPDATE public.open_house_registrations SET working_with_agent='yes',pof_verified_status='verified',pof_rejection_reason=NULL WHERE id=(SELECT id FROM t23_before LIMIT 1)$q$,'P0001','not_authorized_for_open_house_registration','admin marker cannot change working_with_agent');
SELECT throws_ok($q$UPDATE public.open_house_registrations SET screening_doc_url='yes',pof_verified_status='verified',pof_rejection_reason=NULL WHERE id=(SELECT id FROM t23_before LIMIT 1)$q$,'P0001','not_authorized_for_open_house_registration','admin marker cannot change screening_doc_url');
SELECT throws_ok($q$UPDATE public.open_house_registrations SET contact_name='yes',pof_verified_status='verified',pof_rejection_reason=NULL WHERE id=(SELECT id FROM t23_before LIMIT 1)$q$,'P0001','not_authorized_for_open_house_registration','admin marker cannot change contact_name');
SELECT throws_ok($q$UPDATE public.open_house_registrations SET id_doc_url='yes',pof_verified_status='verified',pof_rejection_reason=NULL WHERE id=(SELECT id FROM t23_before LIMIT 1)$q$,'P0001','not_authorized_for_open_house_registration','admin marker cannot change id_doc_url');
SELECT set_config('maiprop.open_house_pof_review_rpc','',true); INSERT INTO storage.objects(bucket_id,name) SELECT 'open-house-docs',requester_id::text||'/'||listing_id::text||'/proof.pdf' FROM public.open_house_registrations WHERE listing_id='d1131002-0000-4000-8000-000000000001';
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
-- Full document RLS proof needs the managed pre-replay Storage ACL baseline.
SELECT CASE WHEN has_table_privilege(current_user,'storage.objects','SELECT')
 THEN lives_ok($q$SELECT * FROM storage.objects WHERE bucket_id='open-house-docs'$q$,'host storage policy evaluates with managed baseline')
 ELSE skip('D0 storage table ACL prerequisite absent; no grant workaround',1) END;
SELECT ok((SELECT private.can_select_open_house_document('d1131001-0000-4000-8000-000000000002','d1131002-0000-4000-8000-000000000001')),'existing document helper permits exact owner');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000005',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000005"}',true); SET LOCAL ROLE authenticated;
SELECT ok((SELECT NOT private.can_select_open_house_document('d1131001-0000-4000-8000-000000000002','d1131002-0000-4000-8000-000000000001')),'existing document helper rejects nonowner');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT public.reopen_open_house_offer_selection('d1131002-0000-4000-8000-000000000001')$q$,'reopen for negative gate probes');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$DELETE FROM public.open_house_offers WHERE listing_id='d1131002-0000-4000-8000-000000000001'$q$,'bidder delete policy preserved');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_settings SET require_proof_of_funds=true,offer_deadline=now()+interval '1 hour' WHERE listing_id='d1131002-0000-4000-8000-000000000001'$q$,'fixture restores offer deadline');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210002,'bid','EUR')$q$,'P0001','proof_of_funds_must_be_verified','unverified proof gates submit');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_settings SET require_proof_of_funds=false,allow_sealed_bids=false WHERE listing_id='d1131002-0000-4000-8000-000000000001'$q$,'fixture disables sealed bids');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210002,'bid','EUR')$q$,'P0001','sealed_bids_disabled_for_open_house','sealed-disabled gates submit');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_settings SET allow_sealed_bids=true,offer_deadline=now()-interval '1 hour' WHERE listing_id='d1131002-0000-4000-8000-000000000001'$q$,'fixture restores sealed bids');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210002,'bid','EUR')$q$,'P0001','sealed_bid_deadline_passed','past deadline gates submit');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000001"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_registrations SET status='approved' WHERE requester_id='d1131001-0000-4000-8000-000000000002'$q$,'fixture resets attendee');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000002"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1131002-0000-4000-8000-000000000001',210002,'bid','EUR')$q$,'P0001','only_attendees_can_submit_offers','nonattendee denied');
SELECT throws_ok($q$UPDATE public.open_house_registrations SET pof_verified_status='verified'$q$,'P0001','host_controlled_open_house_fields','requester cannot self-verify');
SELECT lives_ok($q$UPDATE public.open_house_registrations SET proof_of_funds_url='replacement.pdf',proof_amount=123$q$,'requester may replace own proof');
SELECT ok((SELECT pof_verified_status='unreviewed' AND pof_rejection_reason IS NULL FROM public.open_house_registrations),'proof replacement resets review');
SELECT lives_ok($q$UPDATE public.open_house_registrations SET status='cancelled'$q$,'requester cancellation retained');
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000004"}',true); SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM t23_before WHERE doc->>'requester_id'='d1131001-0000-4000-8000-000000000002'),'verified',NULL,'2000-01-01')$q$,'40001','open_house_pof_review_conflict','changed proof stale review conflicts');
RESET ROLE; SET LOCAL session_replication_role=replica; UPDATE public.open_house_registrations SET updated_at=NULL WHERE requester_id='d1131001-0000-4000-8000-000000000002'; SET LOCAL session_replication_role=origin;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000004"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM t23_before WHERE doc->>'requester_id'='d1131001-0000-4000-8000-000000000002'),'verified',NULL,NULL)$q$,'legacy NULL version accepts exact NULL and returns normal new version');
RESET ROLE; CREATE TEMP TABLE t23_notify_count AS SELECT count(*) n FROM public.notifications WHERE type='pof_review'; GRANT SELECT ON t23_notify_count TO authenticated;
RESET ROLE; SELECT set_config('request.jwt.claim.sub','d1131001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1131001-0000-4000-8000-000000000004"}',true); SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT * FROM public.review_admin_open_house_pof((SELECT id FROM public.get_admin_open_house_pof_reviews() WHERE requester_id='d1131001-0000-4000-8000-000000000002'),'verified',NULL,(SELECT updated_at FROM public.get_admin_open_house_pof_reviews() WHERE requester_id='d1131001-0000-4000-8000-000000000002'))$q$,'same-status review accepted with current version');
RESET ROLE;
SELECT ok((SELECT (SELECT count(*) FROM public.notifications WHERE type='pof_review')=(SELECT n FROM t23_notify_count)),'same-status POF review adds no notification');
SELECT * FROM finish(); ROLLBACK; SELECT count(*) AS fixture_users_after_rollback FROM auth.users WHERE id::text LIKE 'd1131001-%';
-- Additional historical-context and required-field matrix.
\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
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
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(45);

SELECT is(
  (SELECT prosecdef FROM pg_proc WHERE oid = 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)'::regprocedure),
  false,
  'submission RPC remains security invoker'
);
SELECT ok(has_function_privilege('authenticated', 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'), 'authenticated can execute submit RPC');
SELECT ok(NOT has_function_privilege('anon', 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'), 'anon cannot execute submit RPC');
SELECT ok(NOT has_function_privilege('service_role', 'public.submit_new_build_enquiry(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'), 'service role cannot execute browser submit RPC');
SELECT ok(has_function_privilege('authenticated', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'authenticated may evaluate exact-owner predicate');
SELECT ok(has_function_privilege('anon', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'anon may evaluate a stored PUBLIC policy predicate');
-- Task23 reuses the exact Task18 predicate and adds only service-role EXECUTE.
SELECT ok(has_function_privilege('service_role', 'private.current_user_owns_listing(uuid)', 'EXECUTE'), 'Task23 shared helper service grant is present');
SELECT ok(NOT has_table_privilege('authenticated', 'public.listings', 'SELECT'), 'raw listing SELECT remains denied');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND cmd IN ('UPDATE','DELETE')), 0, 'no client UPDATE or DELETE policy is introduced');

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000099','e1810000-0000-4000-8000-000000000003','e1830000-0000-4000-8000-000000000001','anon@example.com','Anonymous',NULL,'Denied')$$,
  '42501', NULL, 'anonymous role is actually denied RPC execution'
);
RESET ROLE;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id) VALUES
  ('e1810000-0000-4000-8000-000000000001'),
  ('e1810000-0000-4000-8000-000000000002'),
  ('e1810000-0000-4000-8000-000000000003'),
  ('e1810000-0000-4000-8000-000000000004');
INSERT INTO public.profiles (user_id, role) VALUES
  ('e1810000-0000-4000-8000-000000000001', 'developer'),
  ('e1810000-0000-4000-8000-000000000002', 'buyer'),
  ('e1810000-0000-4000-8000-000000000003', 'buyer'),
  ('e1810000-0000-4000-8000-000000000004', 'developer');
INSERT INTO public.projects (id, owner_id, name, status) VALUES
  ('e1820000-0000-4000-8000-000000000001', 'e1810000-0000-4000-8000-000000000001', 'Task18 project', 'active');
INSERT INTO public.organizations (id, name, slug, created_by)
VALUES ('e1820000-0000-4000-8000-000000000002', 'Task18 organization', 'task18-organization', 'e1810000-0000-4000-8000-000000000001');
INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
VALUES ('e1820000-0000-4000-8000-000000000002', 'e1810000-0000-4000-8000-000000000003', 'admin', 'active');
INSERT INTO public.listings (id, owner_id, title, city, price, sqm, property_type, listing_type, status, project_id)
VALUES ('e1830000-0000-4000-8000-000000000001', 'e1810000-0000-4000-8000-000000000001', 'Task18 private listing', 'Athens', 420000, 84, 'apartment', 'new_build', 'paused', 'e1820000-0000-4000-8000-000000000001');
INSERT INTO public.listings (id, owner_id, title, city, price, sqm, property_type, listing_type, status, project_id, organization_id, is_off_market) VALUES
  ('e1830000-0000-4000-8000-000000000002', 'e1810000-0000-4000-8000-000000000001', 'Task18 off-market listing', 'Athens', 421000, 84, 'apartment', 'new_build', 'sold', NULL, NULL, true),
  ('e1830000-0000-4000-8000-000000000003', 'e1810000-0000-4000-8000-000000000001', 'Task18 type-changed listing', 'Athens', 422000, 84, 'apartment', 'sale', 'active', NULL, NULL, false),
  ('e1830000-0000-4000-8000-000000000004', 'e1810000-0000-4000-8000-000000000001', 'Task18 org listing', 'Athens', 423000, 84, 'apartment', 'new_build', 'paused', NULL, 'e1820000-0000-4000-8000-000000000002', false);
SET LOCAL session_replication_role = origin;
SELECT is((SELECT is_off_market FROM public.listings WHERE id='e1830000-0000-4000-8000-000000000002'), true, 'off-market owner fixture sets the explicit privacy flag');

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000001'), false, 'NULL current actor never owns a listing');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001',' Buyer@Example.com ',' Buyer One ',' 555-1 ',' Send plans ')$$,
  'buyer can submit through the invoker RPC'
);
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  'canonical-equivalent replay returns the stored submission'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Different plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key with changed payload is rejected'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000002','e1810000-0000-4000-8000-000000000003','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One',NULL,'Send plans')$$,
  '42501', 'enquiry_actor_mismatch', 'expected actor cannot impersonate another buyer'
);
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'authenticated buyer can read the saved enquiry before the missing-subject control');
RESET ROLE;

SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'), 0, 'authenticated role with a missing subject cannot read the saved buyer enquiry');
RESET ROLE;

SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'first submit and replay persist one raw enquiry');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE listing_id='e1830000-0000-4000-8000-000000000001' AND source='project_inquiry'), 1, 'replay retains one canonical CRM lead');
SELECT is((SELECT count(*)::integer FROM public.project_leads WHERE project_id='e1820000-0000-4000-8000-000000000001' AND source='project_inquiry'), 1, 'replay retains one project lead');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e1810000-0000-4000-8000-000000000001' AND type='new_interest'), 1, 'replay emits one owner notification');
SELECT is((SELECT email FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 'buyer@example.com', 'server stores canonical email');

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user, 'authenticated', 'receipt and independent conflicts execute as the authenticated buyer');
SELECT results_eq(
  $$SELECT id, new_building_id, created_at FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  $$SELECT id, new_building_id, created_at FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'$$,
  'replay returns the exact stored receipt identity'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','changed@example.com','Buyer One','555-1','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed email'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Changed Name','555-1','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed name'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-2','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed phone'
);
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000002','buyer@example.com','Buyer One','555-1','Send plans')$$,
  'PT409', 'enquiry_submission_payload_conflict', 'same key rejects an independently changed listing'
);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 1, 'actual listing owner reads the buyer enquiry on a paused listing');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000001'), true, 'exact owner predicate accepts a paused listing');
SELECT is(private.current_user_owns_listing(NULL), false, 'exact owner predicate rejects a NULL listing id');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000099'), false, 'exact owner predicate rejects an absent listing id');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000002'), true, 'exact owner predicate ignores sold status and the explicit off-market flag');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000003'), true, 'exact owner predicate ignores listing type');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000004'), true, 'exact owner predicate accepts the actual owner of an organization listing');
SELECT throws_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000002','e1830000-0000-4000-8000-000000000001','buyer@example.com','Buyer One','555-1','Send plans')$$,
  '42501', 'enquiry_actor_mismatch', 'listing owner cannot replay as the buyer'
);
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000004','e1810000-0000-4000-8000-000000000001','e1830000-0000-4000-8000-000000000001','owner@example.com','Listing Owner',NULL,'Owner self enquiry')$$,
  'listing owner may submit an enquiry as their own actor'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE user_id='e1810000-0000-4000-8000-000000000001' AND submission_key='e1840000-0000-4000-8000-000000000004'), 1, 'owner-as-self receives one durable raw identity');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='e1810000-0000-4000-8000-000000000001' AND type='new_interest'), 1, 'existing self-notification suppression emits no owner-to-self notification');

SELECT set_config('request.jwt.claims','{"sub":"e1810000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 0, 'outsider cannot read the buyer submission');
SELECT is(private.current_user_owns_listing('e1830000-0000-4000-8000-000000000004'), false, 'organization authority without owner equality does not satisfy exact ownership');
SELECT lives_ok(
  $$SELECT * FROM public.submit_new_build_enquiry('e1840000-0000-4000-8000-000000000001','e1810000-0000-4000-8000-000000000003','e1830000-0000-4000-8000-000000000001','other@example.com','Other Buyer',NULL,'Own enquiry')$$,
  'another actor may independently use the same UUID key'
);
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE submission_key='e1840000-0000-4000-8000-000000000001'), 2, 'actor plus key, not key alone, is unique');

SELECT throws_ok(
  $$UPDATE public.new_building_leads SET notes='mutated' WHERE user_id='e1810000-0000-4000-8000-000000000002' AND submission_key='e1840000-0000-4000-8000-000000000001'$$,
  'PT409', 'enquiry_submission_immutable', 'privileged update cannot change a keyed accepted payload'
);

SELECT * FROM finish();
ROLLBACK;
