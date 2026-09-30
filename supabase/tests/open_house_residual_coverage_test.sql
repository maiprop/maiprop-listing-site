\set ON_ERROR_STOP on
\pset pager off
BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SELECT plan(77);
SELECT ok(has_function_privilege('service_role','public.get_open_house_capacity_for_user(uuid,uuid)','EXECUTE'),'service executes active capacity RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.get_open_house_capacity_for_user(uuid,uuid)','EXECUTE'),'authenticated lacks active capacity EXECUTE');
SELECT ok(NOT has_function_privilege('anon','public.get_open_house_capacity_for_user(uuid,uuid)','EXECUTE'),'anon lacks active capacity EXECUTE');
SELECT ok(has_function_privilege('service_role','public.get_open_house_capacity(uuid)','EXECUTE'),'service retains legacy capacity RPC');
SELECT ok(NOT has_function_privilege('authenticated','public.get_open_house_capacity(uuid)','EXECUTE'),'authenticated lacks legacy capacity EXECUTE');
SELECT ok(NOT has_function_privilege('anon','public.get_open_house_capacity(uuid)','EXECUTE'),'anon lacks legacy capacity EXECUTE');

-- All fixture creation and application actions use normal origin triggers.
INSERT INTO auth.users(id,email)
SELECT ('d1310001-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'd13-' || n || '@example.test'
FROM generate_series(1,8) n;
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,open_house_date,open_house_transaction_type)
SELECT ('d1310002-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
       'd1310001-0000-4000-8000-000000000001','D1 listing ' || n,'Athens',200000,80,'apartment',
       CASE WHEN n=3 THEN 'sale' ELSE 'open_house' END::public.listing_type,
       CASE WHEN n=2 THEN 'draft' ELSE 'active' END::public.listing_status,
       now()+interval '7 days',CASE WHEN n=3 THEN NULL ELSE 'sale' END
FROM generate_series(1,7) n;
INSERT INTO public.open_house_settings(listing_id,max_total_visitors,max_visitors_per_slot,timeslots,allow_sealed_bids,require_proof_of_funds,offer_deadline)
VALUES
 ('d1310002-0000-4000-8000-000000000001',4,3,'[{"start":"10:00","end":"11:00","max_visitors":2},{"start":"11:00","end":"12:00","max_visitors":1}]',true,false,now()+interval '1 hour'),
 ('d1310002-0000-4000-8000-000000000005',NULL,NULL,'[]',true,false,NULL),
 ('d1310002-0000-4000-8000-000000000006',1,NULL,'[]',true,false,NULL);

-- Active Edge service calls have no user subject; the explicit argument is the verified actor.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_registration_rpc','',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000001',0,'A','a@example.test','+3001',NULL,NULL,true,true,true)$q$,'active service admits slot zero');
SELECT set_config('maiprop.open_house_registration_rpc','',true);
SELECT lives_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000003','d1310002-0000-4000-8000-000000000001',0,'B','b@example.test','+3002',NULL,NULL,true,true,true)$q$,'active service admits second slot zero');
SELECT set_config('maiprop.open_house_registration_rpc','',true);
SELECT lives_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000004','d1310002-0000-4000-8000-000000000001',1,'C','c@example.test','+3003',NULL,NULL,true,true,true)$q$,'active service admits slot one');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000003',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_registrations SET status='cancelled' WHERE requester_id='d1310001-0000-4000-8000-000000000003' AND listing_id='d1310002-0000-4000-8000-000000000001'$q$,'visitor cancellation uses normal update guard');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_registrations SET status='rejected' WHERE requester_id='d1310001-0000-4000-8000-000000000004' AND listing_id='d1310002-0000-4000-8000-000000000001'$q$,'owner rejection uses normal update guard');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000005','d1310002-0000-4000-8000-000000000001',1,'D','d@example.test','+3004',NULL,NULL,true,true,true)$q$,'rejected visitor frees slot one');
SELECT is(auth.uid(),NULL::uuid,'active capacity service carries no subject');
SELECT is((SELECT count(*)::int FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000099')),0,'missing listing returns no row');
SELECT is((SELECT count(*)::int FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000003')),0,'wrong type returns no row');
SELECT is((SELECT count(*)::int FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000002')),0,'inactive outsider gets no row');
SELECT is((SELECT count(*)::int FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000001','d1310002-0000-4000-8000-000000000002')),1,'inactive owner gets aggregate row');
SELECT is((SELECT to_jsonb(c) FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000001') c),
  jsonb_build_object('listing_id','d1310002-0000-4000-8000-000000000001','active_total',2,'max_total_visitors',4,
    'slot_counts',jsonb_build_array(jsonb_build_object('slot_index',0,'active_count',1,'max_visitors',2,'full',false),jsonb_build_object('slot_index',1,'active_count',1,'max_visitors',1,'full',true))),
  'active visitor sees exact aggregate with cancelled and rejected rows excluded and no contacts');
SELECT is((SELECT to_jsonb(c) FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000004') c),
  jsonb_build_object('listing_id','d1310002-0000-4000-8000-000000000004','active_total',0,'max_total_visitors',NULL,'slot_counts','[]'::jsonb),
  'no settings returns zero aggregate, not an empty result');
SELECT throws_ok($q$SELECT * FROM public.get_open_house_capacity_for_user(NULL,'d1310002-0000-4000-8000-000000000001')$q$,'28000','not_authenticated','explicit capacity actor required');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000002',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role","sub":"d1310001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE service_role;
SELECT is((SELECT to_jsonb(c) FROM public.get_open_house_capacity('d1310002-0000-4000-8000-000000000001') c),
  (SELECT to_jsonb(c) FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000001') c),
  'legacy service with real subject matches explicit capacity aggregate');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','anon',true),set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT * FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000001')$q$,'42501','permission denied for function get_open_house_capacity_for_user','anon cannot execute active RPC');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000002',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT * FROM public.get_open_house_capacity_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000001')$q$,'42501','permission denied for function get_open_house_capacity_for_user','authenticated cannot execute active RPC');
RESET ROLE;

-- Residual service/no-sub validation: all failures are checked at the first
-- supported RPC layer, with no direct registration insertion or marker spoofing.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_registration_rpc','',true);
CREATE TEMP TABLE d13_receipt AS SELECT to_jsonb(r) doc FROM public.open_house_registrations r
 WHERE listing_id='d1310002-0000-4000-8000-000000000001' AND requester_id='d1310001-0000-4000-8000-000000000002';
GRANT SELECT ON d13_receipt TO service_role;
CREATE TEMP TABLE d13_state_before AS SELECT
 (SELECT count(*) FROM public.open_house_registrations WHERE requester_id::text LIKE 'd1310001-%') regs,
 (SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1310001-%') notices;
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user(NULL,'d1310002-0000-4000-8000-000000000001',0,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'28000','not_authenticated','explicit registration actor required');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000099',NULL,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23503','open_house_listing_not_found','service rejects missing listing');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000003',NULL,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','listing_is_not_open_house','service rejects wrong type');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000002',NULL,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_not_active','service rejects draft event');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000001','d1310002-0000-4000-8000-000000000001',0,'Owner','owner@example.test','+3000',NULL,NULL,true,true,true)$q$,'42501','open_house_owner_cannot_register','owner cannot self register');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000001',NULL,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_timeslot_required','service requires configured slot');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000001',-1,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'22023','open_house_timeslot_invalid','service rejects negative slot');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000001',2,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'22023','open_house_timeslot_invalid','service rejects slot equal to length');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000001',1,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_timeslot_capacity_reached','service preserves full slot');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000004',0,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'22023','open_house_timeslot_invalid','no-settings listing rejects slot');
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000006','d1310002-0000-4000-8000-000000000005',0,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'22023','open_house_timeslot_invalid','empty slots reject index');
SELECT is(to_jsonb(public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000002','d1310002-0000-4000-8000-000000000001',0,'Changed','changed@example.test','+3999',NULL,NULL,true,true,true)),(SELECT doc FROM d13_receipt),'valid duplicate returns exact stored receipt');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.open_house_registrations WHERE requester_id::text LIKE 'd1310001-%'),(SELECT regs FROM d13_state_before),'service denials and retry leave registration count unchanged');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1310001-%'),(SELECT notices FROM d13_state_before),'service denials and retry leave notifications unchanged');

-- Retained service RPC is a distinct subject-bound contract. Each request
-- clears the explicit wrapper marker; no end-user claim is injected into it.
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000006',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1310001-0000-4000-8000-000000000006"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_contact_name_required','legacy blank name denied');
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'X','','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_contact_email_required','legacy blank email denied');
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'X','x@example.test','',NULL,NULL,true,true,true)$q$,'23514','open_house_contact_phone_required','legacy blank phone denied');
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'X','x@example.test','+3000',NULL,NULL,false,true,true)$q$,'23514','open_house_contact_permission_required','legacy contact permission required');
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'X','x@example.test','+3000',NULL,NULL,true,false,true)$q$,'23514','open_house_id_verification_consent_required','legacy ID consent required');
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'X','x@example.test','+3000',NULL,NULL,true,true,false)$q$,'23514','open_house_privacy_acknowledgement_required','legacy privacy acknowledgement required');
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000001',1,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_timeslot_capacity_reached','legacy full slot denied');
SELECT lives_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000004',NULL,'  X  ',' X@EXAMPLE.TEST ',' +3000 ',NULL,NULL,true,true,true)$q$,'legacy no-settings admission succeeds');
RESET ROLE;
SELECT ok((SELECT contact_name='X' AND contact_email='x@example.test' AND contact_phone='+3000' AND contact_permission_at IS NOT NULL AND id_verification_consent_at IS NOT NULL AND privacy_acknowledged_at IS NOT NULL FROM public.open_house_registrations WHERE listing_id='d1310002-0000-4000-8000-000000000004' AND requester_id='d1310001-0000-4000-8000-000000000006'),'legacy contact normalization and consent timestamps stored');
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000008',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1310001-0000-4000-8000-000000000008"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000005',0,'Y','y@example.test','+3008',NULL,NULL,true,true,true)$q$,'22023','open_house_timeslot_invalid','legacy empty-slot index denied');
SELECT lives_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000006',NULL,'Y','y@example.test','+3008',NULL,NULL,true,true,true)$q$,'legacy fills one-person total capacity');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000006',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1310001-0000-4000-8000-000000000006"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000006',NULL,'X','x@example.test','+3000',NULL,NULL,true,true,true)$q$,'23514','open_house_total_capacity_reached','legacy total capacity denied');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.open_house_registrations WHERE listing_id='d1310002-0000-4000-8000-000000000006'),1,'full total denial preserves one row');

-- A valid receipt is recorded before the event closes. Both contracts check
-- event date before duplicate lookup, so a closed retry is denied unchanged.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000008','d1310002-0000-4000-8000-000000000007',NULL,'Y','y@example.test','+3008',NULL,NULL,true,true,true)$q$,'future event receipt created');
RESET ROLE;
UPDATE public.listings SET open_house_date=now()-interval '1 hour' WHERE id='d1310002-0000-4000-8000-000000000007';
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration_for_user('d1310001-0000-4000-8000-000000000008','d1310002-0000-4000-8000-000000000007',NULL,'Changed','changed@example.test','+3999',NULL,NULL,true,true,true)$q$,'23514','open_house_registration_closed','service closed-event retry denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000008',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role","sub":"d1310001-0000-4000-8000-000000000008"}',true),set_config('maiprop.open_house_registration_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.create_open_house_registration('d1310002-0000-4000-8000-000000000007',NULL,'Changed','changed@example.test','+3999',NULL,NULL,true,true,true)$q$,'23514','open_house_registration_closed','legacy closed-event retry denied');
RESET ROLE;
SELECT ok((SELECT count(*)=1 AND min(contact_name)='Y' FROM public.open_house_registrations WHERE listing_id='d1310002-0000-4000-8000-000000000007'),'closed retries preserve original registration');

-- Bid/POF residual denials use the installed invoker submit and bounded
-- definer accept/reopen. No offer is manufactured outside normal triggers.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),
       set_config('request.jwt.claims','{"role":"service_role"}',true),set_config('maiprop.open_house_accept_rpc','',true),
       set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1310002-0000-4000-8000-000000000007',210000,'bid','EUR')$q$,'P0001','not_authenticated','submit rejects null actor');
SELECT throws_ok($q$SELECT public.reopen_open_house_offer_selection('d1310002-0000-4000-8000-000000000007')$q$,'P0001','not_authenticated','reopen rejects null actor');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000006',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000006"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1310002-0000-4000-8000-000000000007',210000,'bid','EUR')$q$,'P0001','only_attendees_can_submit_offers','nonattendee offer rejected');
SELECT throws_ok($q$SELECT public.reopen_open_house_offer_selection('d1310002-0000-4000-8000-000000000007')$q$,'P0001','only_host_can_reopen_offer_selection','outsider cannot reopen');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.open_house_offers WHERE listing_id='d1310002-0000-4000-8000-000000000007'),0,'null actor and nonattendee create no offers');
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000008',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000008"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1310002-0000-4000-8000-000000000007',210000,'bid','EUR')$q$,'P0001','only_attendees_can_submit_offers','pending registrant cannot bid');
SELECT throws_ok($q$UPDATE public.open_house_registrations SET pof_verified_status='verified' WHERE listing_id='d1310002-0000-4000-8000-000000000007'$q$,'P0001','host_controlled_open_house_fields','requester cannot self verify POF');
RESET ROLE;
SELECT ok((SELECT pof_verified_status='unreviewed' AND status='pending' FROM public.open_house_registrations WHERE listing_id='d1310002-0000-4000-8000-000000000007'),'requester denials leave registration and POF unchanged');
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000001"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$UPDATE public.open_house_registrations SET status='attended' WHERE listing_id='d1310002-0000-4000-8000-000000000007'$q$,'P0001','only_approved_registrations_can_be_attended','host cannot skip approval');
SELECT lives_ok($q$UPDATE public.open_house_registrations SET status='approved',approved_by='d1310001-0000-4000-8000-000000000001',approved_at=now() WHERE listing_id='d1310002-0000-4000-8000-000000000007'$q$,'host approves through normal trigger');
SELECT lives_ok($q$UPDATE public.open_house_registrations SET status='attended',attended_at=now() WHERE listing_id='d1310002-0000-4000-8000-000000000007'$q$,'host records attendance through normal trigger');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000008',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000008"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($q$SELECT public.submit_open_house_offer('d1310002-0000-4000-8000-000000000007',210000,'bid','EUR')$q$,'attended bidder submits normal offer');
RESET ROLE;
CREATE TEMP TABLE d13_offer_before AS SELECT to_jsonb(o) doc,id FROM public.open_house_offers o WHERE listing_id='d1310002-0000-4000-8000-000000000007';
GRANT SELECT ON d13_offer_before TO authenticated;
CREATE TEMP TABLE d13_notice_before AS SELECT count(*) n FROM public.notifications WHERE user_id::text LIKE 'd1310001-%';
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000001"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.accept_open_house_offer('00000000-0000-0000-0000-000000000000')$q$,'P0001','open_house_offer_not_found','host missing offer rejected');
SELECT throws_ok($q$SELECT public.reopen_open_house_offer_selection('00000000-0000-0000-0000-000000000000')$q$,'P0001','open_house_listing_not_found','host missing reopen listing rejected');
SELECT throws_ok($q$SELECT public.accept_open_house_offer((SELECT id FROM d13_offer_before))$q$,'P0001','only_revealed_offers_can_be_accepted','unrevealed offer cannot be accepted');
RESET ROLE;
SELECT ok((SELECT to_jsonb(o)=b.doc FROM public.open_house_offers o CROSS JOIN d13_offer_before b WHERE o.id=b.id),'failed host decisions preserve offer row');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1310001-%'),(SELECT n FROM d13_notice_before),'failed decisions add no notification');
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000001"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($q$UPDATE public.open_house_offers SET status='revealed',revealed_at=now() WHERE listing_id='d1310002-0000-4000-8000-000000000007'$q$,'host reveals after event gate');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000006',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000006"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.accept_open_house_offer((SELECT id FROM d13_offer_before))$q$,'P0001','only_host_can_accept_offer','outsider cannot accept revealed offer');
RESET ROLE;
CREATE TEMP TABLE d13_revealed_before AS SELECT to_jsonb(o) doc,id FROM public.open_house_offers o WHERE listing_id='d1310002-0000-4000-8000-000000000007';
CREATE TEMP TABLE d13_revealed_notice_before AS SELECT count(*) n FROM public.notifications WHERE user_id::text LIKE 'd1310001-%';
SELECT set_config('request.jwt.claim.sub','d1310001-0000-4000-8000-000000000008',true),set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"d1310001-0000-4000-8000-000000000008"}',true),
       set_config('maiprop.open_house_accept_rpc','',true),set_config('maiprop.open_house_reopen_rpc','',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.submit_open_house_offer('d1310002-0000-4000-8000-000000000007',230000,'changed','EUR')$q$,'P0001','offer_no_longer_editable','revealed offer cannot be resubmitted');
RESET ROLE;
SELECT ok((SELECT to_jsonb(o)=b.doc FROM public.open_house_offers o CROSS JOIN d13_revealed_before b WHERE o.id=b.id),'noneditable retry and outsider accept preserve revealed offer');
SELECT is((SELECT status::text FROM public.listings WHERE id='d1310002-0000-4000-8000-000000000007'),'active','denied offer actions do not pause listing');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id::text LIKE 'd1310001-%'),(SELECT n FROM d13_revealed_notice_before),'denied offer actions add no notification');

SELECT * FROM finish();
ROLLBACK;
SELECT count(*) AS residual_users_after_rollback FROM auth.users WHERE id::text LIKE 'd1310001-%';
SELECT current_user AS role_after_rollback, current_setting('request.jwt.claim.sub',true) AS sub_after_rollback,
       current_setting('request.jwt.claims',true) AS claims_after_rollback;
