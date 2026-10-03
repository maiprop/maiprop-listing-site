\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_d0_[a-z0-9_]{6,48}|maiprop_d6_[0-9]{8}_consult[0-9]{2})$'
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
    OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
    OR inet_server_addr() IS NOT NULL
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
    OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
    OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
    OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'd6_%')
    OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'd6_%')
 THEN RAISE EXCEPTION 'D6 requires a matching postgres-owned disposable socket database with origin triggers'; END IF;
END $$;
CREATE TEMP TABLE d6_consult_baseline AS
 SELECT pg_backend_pid() pid,current_user db_role,session_user session_role,
 current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') replication_role,
 auth.uid() actor,auth.jwt() jwt,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 (SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'))
  FROM pg_proc p WHERE p.oid IN (
   'public.enforce_professional_pro_consultation_request()'::regprocedure,
   'public.validate_consultation_request_availability()'::regprocedure,
   'private.capture_consultation_owner_lead()'::regprocedure,
   'private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz)'::regprocedure,
   'private.notify_consultation_created()'::regprocedure,
   'private.notify_consultation_status_changed()'::regprocedure,
   'private.insert_interaction_notification(uuid,uuid,text,text,text,text)'::regprocedure)) source_hashes;
SELECT 'PRE' AS phase,pid,db_role,session_role,marker,replication_role,actor,jwt,
 sub_claim,claims,role_claim,source_hashes FROM d6_consult_baseline;
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL TIME ZONE 'Europe/Athens';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();

SELECT is(current_setting('session_replication_role'),'origin','all fixture and action triggers remain enabled');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgrelid='public.consultation_requests'::regclass
 AND NOT tgisinternal AND tgenabled='O'),6,'six consultation triggers are installed in origin mode');
SELECT ok(has_table_privilege('authenticated','public.consultation_requests','INSERT,SELECT,UPDATE')
 AND has_table_privilege('anon','public.consultation_requests','INSERT'),
 'current table ACL admits a role-policy test, including anon RLS rejection');
SELECT is((SELECT count(*)::integer FROM pg_policies WHERE schemaname='public' AND tablename='consultation_requests'),3,
 'installed consultation SELECT, INSERT and UPDATE policy set is present');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('public.enforce_professional_pro_consultation_request()','d2317eb158242e32f9d5878e09059b208c9e54c6ff770ea87d001ec97ecb8b83'),
 ('public.validate_consultation_request_availability()','f6dc1ed824fa379cd928f65e24e785bf220ee195c33a8190b610dec5d89286a0'),
 ('private.capture_consultation_owner_lead()','c804d484bb94cde55d80bbe226addde816cf3c11460513a45ae1265eb657a937'),
 ('private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz)','27eb42db9f54b7c399f4546e4a669373b25d597f70dcfb4517be663af0ba59c1'),
 ('private.notify_consultation_created()','fd2300d009e3b9c477719283860e3f305e16f8bebfc833fcf5a88208bacdb6cd'),
 ('private.notify_consultation_status_changed()','9975aacc68d3df41348d7d9b17ca788b140596480bead9865eabd1f283266d95'),
 ('private.insert_interaction_notification(uuid,uuid,text,text,text,text)','19a643033844e663d9b871ee666a187ba0404d261742be803ebb632702a70784')
 ) expected(sig,sha)), 'seven installed consultation routine definitions match pinned hashes');
SELECT is((SELECT encode(digest(jsonb_agg(to_jsonb(p) ORDER BY policyname)::text,'sha256'),'hex')
 FROM pg_policies p WHERE schemaname='public' AND tablename='consultation_requests'),
 '4d9fc1c2b6f2a75fb54c0bdef85faa1774050ebe71e060a7f65f43a0051541b5','consultation policy set matches pinned installed hash');
SELECT is((SELECT encode(digest(jsonb_agg(jsonb_build_object('name',tgname,'enabled',tgenabled,
 'definition',pg_get_triggerdef(oid)) ORDER BY tgname)::text,'sha256'),'hex')
 FROM pg_trigger WHERE tgrelid='public.consultation_requests'::regclass AND NOT tgisinternal),
 'd46b40840c92eabe7a739ab298140469d84d3323023954222cafca8789ed9546','consultation origin trigger set matches pinned installed hash');
SELECT is((SELECT encode(digest(jsonb_agg(jsonb_build_object('table',c.relname,'acl',c.relacl::text)
 ORDER BY c.relname)::text,'sha256'),'hex') FROM pg_class c WHERE c.oid IN
 ('public.consultation_requests'::regclass,'public.professionals'::regclass,
 'public.professional_availability'::regclass,'public.leads'::regclass,'public.notifications'::regclass)),
 '76e711aed2b1dd8c503ae586dda015e85abb4ad6234231f8ad1cfbde61ed1fcc',
 'five relevant table ACLs match pinned installed hash');

-- Privileged synthetic setup only; auth inserts run their normal owner trigger.
INSERT INTO auth.users(id,email) VALUES
 ('d6000001-0000-4000-8000-000000000001','d6-requester@example.test'),
 ('d6000001-0000-4000-8000-000000000002','d6-pro@example.test'),
 ('d6000001-0000-4000-8000-000000000003','d6-free@example.test'),
 ('d6000001-0000-4000-8000-000000000004','d6-outsider@example.test');
INSERT INTO public.professionals(id,user_id,category,title,subscription_tier) VALUES
 ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000002','architect','D6 Pro architect','pro'),
 ('d6000002-0000-4000-8000-000000000003','d6000001-0000-4000-8000-000000000003','architect','D6 Free architect','free');
CREATE TEMP TABLE d6_ids(label text PRIMARY KEY,id uuid NOT NULL);
CREATE FUNCTION pg_temp.d6_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)),'{}'::jsonb) FROM public.consultation_requests r),
  'leads',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(l)),'{}'::jsonb) FROM public.leads l),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n))
$$;
CREATE FUNCTION pg_temp.d6_request(p_id uuid,p_name text,p_email text,p_phone text,p_type text,
 p_meeting text,p_service text,p_date date,p_time text,p_callback text,p_message text,p_status text DEFAULT 'pending')
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',p_id,
  'professional_id','d6000002-0000-4000-8000-000000000002'::uuid,
  'requester_id','d6000001-0000-4000-8000-000000000001'::uuid,
  'requester_name',p_name,'requester_email',p_email,'requester_phone',p_phone,
  'request_type',p_type,'message',p_message,'service',p_service,'preferred_date',p_date,
  'preferred_time',p_time,'callback_time',p_callback,'status',p_status,'created_at',now(),
  'updated_at',now(),'notes',NULL,'lead_status','new','meeting_type',p_meeting)
$$;
CREATE FUNCTION pg_temp.d6_lead(p_id uuid,p_name text,p_email text,p_phone text,p_source text,
 p_message text,p_follow_up timestamptz)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',p_id,'owner_id','d6000001-0000-4000-8000-000000000002'::uuid,
  'source',p_source,'listing_id',NULL,'professional_id','d6000002-0000-4000-8000-000000000002'::uuid,
  'project_id',NULL,'name',p_name,'email',p_email,'phone',p_phone,'message',p_message,
  'status','new','notes',NULL,'follow_up_at',p_follow_up,'created_at',now(),'updated_at',now(),
  'origin_context_key','professional:d6000002-0000-4000-8000-000000000002')
$$;
CREATE FUNCTION pg_temp.d6_notice(p_id uuid,p_recipient uuid,p_title text,p_body text)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',p_id,'user_id',p_recipient,'title',p_title,'body',p_body,
  'type','message','read',false,'created_at',now(),'link','/dashboard?tab=booking')
$$;
CREATE TEMP TABLE d6_before(label text PRIMARY KEY,graph jsonb NOT NULL,requests integer NOT NULL,leads integer NOT NULL,notifications integer NOT NULL);
CREATE FUNCTION pg_temp.d6_expected(p_label text,p_requests jsonb DEFAULT '{}'::jsonb,
 p_changed_requests jsonb DEFAULT '{}'::jsonb,p_leads jsonb DEFAULT '{}'::jsonb,
 p_changed_leads jsonb DEFAULT '{}'::jsonb,p_notices jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'requests',(graph->'requests')||p_requests||p_changed_requests,
  'leads',(graph->'leads')||p_leads||p_changed_leads,
  'notifications',(graph->'notifications')||p_notices)
 FROM d6_before WHERE label=p_label
$$;
CREATE FUNCTION pg_temp.d6_snapshot(p_label text) RETURNS void LANGUAGE sql AS $$
 INSERT INTO d6_before SELECT p_label,pg_temp.d6_graph(),
 (SELECT count(*)::integer FROM public.consultation_requests),
 (SELECT count(*)::integer FROM public.leads),
 (SELECT count(*)::integer FROM public.notifications)
$$;
SELECT pg_temp.d6_snapshot('seed');

-- C1: requester inserts a real scheduled Pro booking.
INSERT INTO public.professional_availability(professional_id,day_of_week,start_time,end_time,is_active)
 VALUES ('d6000002-0000-4000-8000-000000000002',1,'10:00','12:00',true);
SELECT pg_temp.d6_snapshot('c1');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,requester_phone,request_type,meeting_type,service,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Booking','  BOOKING@EXAMPLE.TEST  ','+30 210 000 0001','consultation','video','Architecture','2026-10-05','10:30')
 RETURNING id AS c1_id \gset
SELECT is((SELECT count(*)::integer FROM public.consultation_requests WHERE id=:'c1_id'::uuid),1,
 'requester can read own created request');
RESET ROLE;
INSERT INTO d6_ids VALUES ('c1',:'c1_id'::uuid);
SELECT is((SELECT count(*)::integer FROM public.consultation_requests)- (SELECT requests FROM d6_before WHERE label='c1'),1,'C1 one request persisted');
SELECT is((SELECT count(*)::integer FROM public.leads)- (SELECT leads FROM d6_before WHERE label='c1'),1,'C1 exactly one new lead');
SELECT is((SELECT count(*)::integer FROM public.notifications)- (SELECT notifications FROM d6_before WHERE label='c1'),1,'C1 exactly one new notification');
SELECT ok((SELECT professional_id='d6000002-0000-4000-8000-000000000002' AND requester_id='d6000001-0000-4000-8000-000000000001'
 AND requester_name='D6 Booking' AND requester_email='  BOOKING@EXAMPLE.TEST  ' AND requester_phone='+30 210 000 0001'
 AND request_type='consultation' AND meeting_type='video' AND service='Architecture' AND preferred_date='2026-10-05'
 AND preferred_time='10:30' AND status='pending' AND lead_status='new' AND notes IS NULL
 FROM public.consultation_requests WHERE id=(SELECT id FROM d6_ids WHERE label='c1')),'C1 request fields match caller payload');
SELECT ok((SELECT owner_id='d6000001-0000-4000-8000-000000000002' AND professional_id='d6000002-0000-4000-8000-000000000002'
 AND source='consultation' AND name='D6 Booking' AND email='booking@example.test' AND phone='+30 210 000 0001'
 AND status='new' AND origin_context_key='professional:d6000002-0000-4000-8000-000000000002'
 AND follow_up_at='2026-10-05 10:30 Europe/Athens'::timestamptz
 FROM public.leads WHERE email='booking@example.test'),'C1 canonical lead identity/context/follow-up');
SELECT ok((SELECT user_id='d6000001-0000-4000-8000-000000000002' AND title='New consultation request'
 AND body='D6 Booking requested Architecture' AND type='message' AND link='/dashboard?tab=booking' AND read=false
 FROM public.notifications n WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c1') ? n.id::text)),
 'C1 notice recipient and complete content');
SELECT ok((SELECT graph->'notifications' FROM d6_before WHERE label='c1') <@ (pg_temp.d6_graph()->'notifications'),
 'C1 preserves every prior notification row');
SELECT id AS c1_lead_id FROM public.leads WHERE email='booking@example.test' \gset
SELECT n.id AS c1_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c1') ? n.id::text) \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c1',
 jsonb_build_object(:'c1_id',pg_temp.d6_request(:'c1_id'::uuid,'D6 Booking','  BOOKING@EXAMPLE.TEST  ','+30 210 000 0001',
 'consultation','video','Architecture','2026-10-05','10:30',NULL,NULL)),
 '{}'::jsonb,
 jsonb_build_object(:'c1_lead_id',pg_temp.d6_lead(:'c1_lead_id'::uuid,'D6 Booking','booking@example.test','+30 210 000 0001',
 'consultation',NULL,'2026-10-05 10:30 Europe/Athens'::timestamptz)),
 '{}'::jsonb,
 jsonb_build_object(:'c1_notice_id',pg_temp.d6_notice(:'c1_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Booking requested Architecture'))),
 'C1 complete prestate-derived request/lead/all-notice graph');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.consultation_requests WHERE id=:'c1_id'::uuid),1,'professional reads C1');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.consultation_requests WHERE id=:'c1_id'::uuid),0,'outsider cannot read C1');
RESET ROLE;

-- C2: callbacks and messages bypass availability; first contact owns the canonical lead identity.
SELECT pg_temp.d6_snapshot('c2');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,requester_phone,request_type,preferred_date,callback_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Callback','  CALLBACK@EXAMPLE.TEST  ','+30 210 000 0002','callback','2026-10-06','afternoon')
 RETURNING id AS callback_id \gset
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,requester_phone,request_type,message)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Message','message@example.test','+30 210 000 0003','message','Please contact me')
 RETURNING id AS message_id \gset
SELECT is((SELECT count(*)::integer FROM public.consultation_requests WHERE id IN (:'callback_id'::uuid,:'message_id'::uuid)),2,
 'requester reads both C2 requests');
RESET ROLE;
INSERT INTO d6_ids VALUES ('callback',:'callback_id'::uuid),('message',:'message_id'::uuid);
SELECT is((SELECT count(*)::integer FROM public.consultation_requests)-(SELECT requests FROM d6_before WHERE label='c2'),2,'C2 adds two requests');
SELECT is((SELECT count(*)::integer FROM public.leads)-(SELECT leads FROM d6_before WHERE label='c2'),2,'C2 adds two distinct-contact leads');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c2'),2,'C2 adds exactly two Pro notices');
SELECT ok((SELECT source='callback' AND owner_id='d6000001-0000-4000-8000-000000000002'
 AND professional_id='d6000002-0000-4000-8000-000000000002' AND email='callback@example.test'
 AND follow_up_at='2026-10-06 09:00 Europe/Athens'::timestamptz
 FROM public.leads WHERE email='callback@example.test'),'callback source, identity and date-only follow-up');
SELECT ok((SELECT source='message' AND owner_id='d6000001-0000-4000-8000-000000000002'
 AND professional_id='d6000002-0000-4000-8000-000000000002' AND email='message@example.test'
 AND message='Please contact me' AND follow_up_at IS NULL
 FROM public.leads WHERE email='message@example.test'),'message source, identity and no follow-up');
SELECT ok((SELECT bool_and(user_id='d6000001-0000-4000-8000-000000000002' AND title='New consultation request'
 AND type='message' AND link='/dashboard?tab=booking' AND body IN ('D6 Callback requested callback','D6 Message requested message'))
 FROM public.notifications n WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c2') ? n.id::text)),
 'both C2 notices have exact recipient/content');
SELECT is((SELECT graph->'notifications' FROM d6_before WHERE label='c2') <@ (pg_temp.d6_graph()->'notifications'),true,
 'C2 preserves all prior notices');
SELECT id AS callback_lead_id FROM public.leads WHERE email='callback@example.test' \gset
SELECT id AS message_lead_id FROM public.leads WHERE email='message@example.test' \gset
SELECT n.id AS callback_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c2') ? n.id::text)
 AND body='D6 Callback requested callback' \gset
SELECT n.id AS message_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c2') ? n.id::text)
 AND body='D6 Message requested message' \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c2',
 jsonb_build_object(:'callback_id',pg_temp.d6_request(:'callback_id'::uuid,'D6 Callback','  CALLBACK@EXAMPLE.TEST  ','+30 210 000 0002',
 'callback',NULL,NULL,'2026-10-06',NULL,'afternoon',NULL),
 :'message_id',pg_temp.d6_request(:'message_id'::uuid,'D6 Message','message@example.test','+30 210 000 0003',
 'message',NULL,NULL,NULL,NULL,NULL,'Please contact me')),
 '{}'::jsonb,
 jsonb_build_object(:'callback_lead_id',pg_temp.d6_lead(:'callback_lead_id'::uuid,'D6 Callback','callback@example.test','+30 210 000 0002',
 'callback',NULL,'2026-10-06 09:00 Europe/Athens'::timestamptz),
 :'message_lead_id',pg_temp.d6_lead(:'message_lead_id'::uuid,'D6 Message','message@example.test','+30 210 000 0003',
 'message','Please contact me',NULL)),
 '{}'::jsonb,
 jsonb_build_object(:'callback_notice_id',pg_temp.d6_notice(:'callback_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Callback requested callback'),
 :'message_notice_id',pg_temp.d6_notice(:'message_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Message requested message'))),
 'C2 complete prestate-derived graph for callback and message');
SELECT pg_temp.d6_snapshot('c2reuse');
SELECT (SELECT id::text FROM public.leads WHERE email='callback@example.test') AS reused_lead_id \gset
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,requester_phone,request_type,message)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Reuse','CALLBACK@example.test','+30 210 000 0002','message','Second contact')
 RETURNING id AS reuse_request_id \gset
RESET ROLE;
INSERT INTO d6_ids VALUES ('reuse',:'reuse_request_id'::uuid);
SELECT is((SELECT count(*)::integer FROM public.consultation_requests)-(SELECT requests FROM d6_before WHERE label='c2reuse'),1,'repeat contact adds one request');
SELECT is((SELECT count(*)::integer FROM public.leads)-(SELECT leads FROM d6_before WHERE label='c2reuse'),0,'repeat contact adds no lead');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c2reuse'),1,'repeat contact adds one notice');
SELECT ok((SELECT id=:'reused_lead_id'::uuid AND source='callback' AND email='callback@example.test'
 AND follow_up_at='2026-10-06 09:00 Europe/Athens'::timestamptz
 FROM public.leads WHERE email='callback@example.test'),'repeat contact preserves lead ID, first source and follow-up');
SELECT n.id AS reuse_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c2reuse') ? n.id::text) \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c2reuse',
 jsonb_build_object(:'reuse_request_id',pg_temp.d6_request(:'reuse_request_id'::uuid,'D6 Reuse','CALLBACK@example.test','+30 210 000 0002',
 'message',NULL,NULL,NULL,NULL,NULL,'Second contact')),
 '{}'::jsonb,'{}'::jsonb,
 jsonb_build_object(:'reused_lead_id',pg_temp.d6_lead(:'reused_lead_id'::uuid,'D6 Callback','callback@example.test','+30 210 000 0002',
 'callback','Second contact','2026-10-06 09:00 Europe/Athens'::timestamptz)),
 jsonb_build_object(:'reuse_notice_id',pg_temp.d6_notice(:'reuse_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Reuse requested message'))),
 'same-contact request reuses lead in complete prestate-derived graph');

-- C3: the target professional changes status, and unchanged/unauthorized attempts add no notice.
SELECT pg_temp.d6_snapshot('c3');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.consultation_requests SET status='confirmed' WHERE id=:'c1_id'::uuid
 AND professional_id='d6000002-0000-4000-8000-000000000002' RETURNING status AS c3_status \gset
SELECT is(:'c3_status'::text,'confirmed'::text,'professional UPDATE RETURNING confirms C1');
RESET ROLE;
SELECT is((SELECT status FROM public.consultation_requests WHERE id=:'c1_id'::uuid),'confirmed','C3 status persists');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c3'),1,
 'status change adds exactly one requester notice');
SELECT ok((SELECT user_id='d6000001-0000-4000-8000-000000000001' AND title='Consultation status updated'
 AND body='Your Architecture request is now confirmed' AND type='message' AND link='/dashboard?tab=booking'
 FROM public.notifications n WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c3') ? n.id::text)),
 'C3 status notice has exact requester/content');
SELECT is((SELECT count(*)::integer FROM public.leads)-(SELECT leads FROM d6_before WHERE label='c3'),0,'C3 status leaves lead cardinality');
SELECT n.id AS c3_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c3') ? n.id::text) \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c3','{}'::jsonb,
 jsonb_build_object(:'c1_id',pg_temp.d6_request(:'c1_id'::uuid,'D6 Booking','  BOOKING@EXAMPLE.TEST  ','+30 210 000 0001',
 'consultation','video','Architecture','2026-10-05','10:30',NULL,NULL,'confirmed')),
 '{}'::jsonb,'{}'::jsonb,
 jsonb_build_object(:'c3_notice_id',pg_temp.d6_notice(:'c3_notice_id'::uuid,'d6000001-0000-4000-8000-000000000001',
 'Consultation status updated','Your Architecture request is now confirmed'))),
 'C3 status change has complete prestate-derived graph');
SELECT pg_temp.d6_snapshot('c3repeat');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE public.consultation_requests SET status='confirmed' WHERE id=:'c1_id'::uuid
 AND professional_id='d6000002-0000-4000-8000-000000000002' RETURNING id)
 SELECT is((SELECT count(*)::integer FROM changed),1,'same-status professional UPDATE returns one row');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c3repeat'),0,
 'same-status update adds zero notices');
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c3repeat'),
 'same-status action preserves all request/lead/notice bytes at transaction timestamp');
SELECT pg_temp.d6_snapshot('c3denied');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE public.consultation_requests SET status='cancelled' WHERE id=:'c1_id'::uuid RETURNING id)
 SELECT is((SELECT count(*)::integer FROM changed),0,'requester UPDATE returns zero rows under RLS');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c3denied'),
 'requester status denial preserves complete requests/leads/notices graph');
SELECT pg_temp.d6_snapshot('c3outsider');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE public.consultation_requests SET status='cancelled' WHERE id=:'c1_id'::uuid RETURNING id)
 SELECT is((SELECT count(*)::integer FROM changed),0,'outsider UPDATE returns zero rows under RLS');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c3outsider'),
 'outsider status denial independently preserves complete requests/leads/notices graph');

-- C4: manual/no-active paths, inclusive endpoints, distinct validation errors and UPDATE schedule.
SELECT pg_temp.d6_snapshot('c4manual');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Manual','manual@example.test','consultation')
 RETURNING id AS manual_id \gset
RESET ROLE;
INSERT INTO d6_ids VALUES ('manual',:'manual_id'::uuid);
SELECT is((SELECT count(*)::integer FROM public.consultation_requests)-(SELECT requests FROM d6_before WHERE label='c4manual'),1,'manual booking persists');
SELECT is((SELECT count(*)::integer FROM public.leads)-(SELECT leads FROM d6_before WHERE label='c4manual'),1,'manual booking creates one lead');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c4manual'),1,'manual booking creates one notice');
SELECT ok((SELECT preferred_date IS NULL AND preferred_time IS NULL AND status='pending'
 FROM public.consultation_requests WHERE id=:'manual_id'::uuid),'manual request has no schedule');
SELECT id AS manual_lead_id FROM public.leads WHERE email='manual@example.test' \gset
SELECT n.id AS manual_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c4manual') ? n.id::text) \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c4manual',
 jsonb_build_object(:'manual_id',pg_temp.d6_request(:'manual_id'::uuid,'D6 Manual','manual@example.test',NULL,
 'consultation',NULL,NULL,NULL,NULL,NULL,NULL)),
 '{}'::jsonb,
 jsonb_build_object(:'manual_lead_id',pg_temp.d6_lead(:'manual_lead_id'::uuid,'D6 Manual','manual@example.test',NULL,
 'consultation',NULL,NULL)),
 '{}'::jsonb,
 jsonb_build_object(:'manual_notice_id',pg_temp.d6_notice(:'manual_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Manual requested consultation'))),
 'manual booking has complete prestate-derived graph');
UPDATE public.professional_availability SET is_active=false WHERE professional_id='d6000002-0000-4000-8000-000000000002';
SELECT pg_temp.d6_snapshot('c4inactive');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Inactive','inactive@example.test','consultation','2026-10-06','08:00')
 RETURNING id AS inactive_id \gset
RESET ROLE;
INSERT INTO d6_ids VALUES ('inactive',:'inactive_id'::uuid);
SELECT is((SELECT count(*)::integer FROM public.consultation_requests)-(SELECT requests FROM d6_before WHERE label='c4inactive'),1,'no active rows admit valid scheduled booking');
SELECT is((SELECT count(*)::integer FROM public.leads)-(SELECT leads FROM d6_before WHERE label='c4inactive'),1,'no-active booking creates one lead');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c4inactive'),1,'no-active booking creates one notice');
SELECT id AS inactive_lead_id FROM public.leads WHERE email='inactive@example.test' \gset
SELECT n.id AS inactive_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c4inactive') ? n.id::text) \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c4inactive',
 jsonb_build_object(:'inactive_id',pg_temp.d6_request(:'inactive_id'::uuid,'D6 Inactive','inactive@example.test',NULL,
 'consultation',NULL,NULL,'2026-10-06','08:00',NULL,NULL)),
 '{}'::jsonb,
 jsonb_build_object(:'inactive_lead_id',pg_temp.d6_lead(:'inactive_lead_id'::uuid,'D6 Inactive','inactive@example.test',NULL,
 'consultation',NULL,'2026-10-06 08:00 Europe/Athens'::timestamptz)),
 '{}'::jsonb,
 jsonb_build_object(:'inactive_notice_id',pg_temp.d6_notice(:'inactive_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Inactive requested consultation'))),
 'no-active booking has complete prestate-derived graph');
UPDATE public.professional_availability SET is_active=true WHERE professional_id='d6000002-0000-4000-8000-000000000002';
SELECT pg_temp.d6_snapshot('c4ends');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Start','start@example.test','consultation','2026-10-05','10:00')
 RETURNING id AS start_id \gset
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 End','end@example.test','consultation','2026-10-05','12:00')
 RETURNING id AS end_id \gset
RESET ROLE;
INSERT INTO d6_ids VALUES ('start',:'start_id'::uuid),('end',:'end_id'::uuid);
SELECT is((SELECT count(*)::integer FROM public.consultation_requests)-(SELECT requests FROM d6_before WHERE label='c4ends'),2,
 'inclusive start and end admit both bookings');
SELECT is((SELECT count(*)::integer FROM public.leads)-(SELECT leads FROM d6_before WHERE label='c4ends'),2,'endpoint bookings add two leads');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c4ends'),2,'endpoint bookings add two notices');
SELECT id AS start_lead_id FROM public.leads WHERE email='start@example.test' \gset
SELECT id AS end_lead_id FROM public.leads WHERE email='end@example.test' \gset
SELECT n.id AS start_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c4ends') ? n.id::text)
 AND body='D6 Start requested consultation' \gset
SELECT n.id AS end_notice_id FROM public.notifications n
 WHERE NOT ((SELECT graph->'notifications' FROM d6_before WHERE label='c4ends') ? n.id::text)
 AND body='D6 End requested consultation' \gset
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c4ends',
 jsonb_build_object(:'start_id',pg_temp.d6_request(:'start_id'::uuid,'D6 Start','start@example.test',NULL,
 'consultation',NULL,NULL,'2026-10-05','10:00',NULL,NULL),
 :'end_id',pg_temp.d6_request(:'end_id'::uuid,'D6 End','end@example.test',NULL,
 'consultation',NULL,NULL,'2026-10-05','12:00',NULL,NULL)),
 '{}'::jsonb,
 jsonb_build_object(:'start_lead_id',pg_temp.d6_lead(:'start_lead_id'::uuid,'D6 Start','start@example.test',NULL,
 'consultation',NULL,'2026-10-05 10:00 Europe/Athens'::timestamptz),
 :'end_lead_id',pg_temp.d6_lead(:'end_lead_id'::uuid,'D6 End','end@example.test',NULL,
 'consultation',NULL,'2026-10-05 12:00 Europe/Athens'::timestamptz)),
 '{}'::jsonb,
 jsonb_build_object(:'start_notice_id',pg_temp.d6_notice(:'start_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 Start requested consultation'),
 :'end_notice_id',pg_temp.d6_notice(:'end_notice_id'::uuid,'d6000001-0000-4000-8000-000000000002',
 'New consultation request','D6 End requested consultation'))),
 'both endpoint bookings have complete prestate-derived graph');
SELECT pg_temp.d6_snapshot('c4denied');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Wrong Day','wrongday@example.test','consultation','2026-10-06','10:30')$sql$,
 '23514','Preferred consultation time is outside professional availability','wrong weekday rejected by availability');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c4denied'),'wrong weekday leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c4outside');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Outside','outside@example.test','consultation','2026-10-05','12:01')$sql$,
 '23514','Preferred consultation time is outside professional availability','after endpoint rejected by availability');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c4outside'),'outside interval leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c4partial');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Partial','partial@example.test','consultation','2026-10-05')$sql$,
 '23514','Consultation requests need both preferred_date and preferred_time when either is supplied','one missing schedule field rejected');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c4partial'),'missing schedule field leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c4invalid22023');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Invalid Zone','invalidzone@example.test','consultation','2026-10-05','not-a-time')$sql$,
 '22023','time zone "not-a-time" not recognized','timezone-like invalid time returns native 22023');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c4invalid22023'),
 'native 22023 denial preserves complete graph');
SELECT pg_temp.d6_snapshot('c4invalid22007');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000001','D6 Invalid Text','invalidtext@example.test','consultation','2026-10-05','badtime')$sql$,
 '22007','preferred_time must be a valid time','invalid text time returns handled 22007');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c4invalid22007'),
 'handled 22007 denial preserves complete graph');
SELECT pg_temp.d6_snapshot('c4update');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.consultation_requests SET preferred_date='2026-10-05',preferred_time='12:00'
 WHERE id=:'manual_id'::uuid AND professional_id='d6000002-0000-4000-8000-000000000002'
 RETURNING preferred_time AS updated_time \gset
SELECT is(:'updated_time'::text,'12:00'::text,'professional schedule UPDATE returns boundary time');
RESET ROLE;
SELECT ok((SELECT preferred_date='2026-10-05' AND preferred_time='12:00' FROM public.consultation_requests WHERE id=:'manual_id'::uuid),
 'professional schedule UPDATE persists exact inclusive end');
SELECT is((SELECT count(*)::integer FROM public.notifications)-(SELECT notifications FROM d6_before WHERE label='c4update'),0,
 'schedule-only update adds no status notice');
SELECT is(pg_temp.d6_graph(),pg_temp.d6_expected('c4update','{}'::jsonb,
 jsonb_build_object(:'manual_id',pg_temp.d6_request(:'manual_id'::uuid,'D6 Manual','manual@example.test',NULL,
 'consultation',NULL,NULL,'2026-10-05','12:00',NULL,NULL)),
 '{}'::jsonb,'{}'::jsonb,'{}'::jsonb),
 'schedule-only update has complete prestate-derived graph');
SELECT pg_temp.d6_snapshot('c4update_denied');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format($sql$UPDATE public.consultation_requests SET preferred_time='12:01' WHERE id=%L::uuid$sql$,:'manual_id'),
 '23514','Preferred consultation time is outside professional availability','professional schedule UPDATE validates availability');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c4update_denied'),
 'failed schedule UPDATE preserves complete graph and timestamp');

-- C5: eligibility and identity fail at their observed first authority layer.
SELECT pg_temp.d6_snapshot('c5');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000003','d6000001-0000-4000-8000-000000000001','D6 Free','free@example.test','consultation','2026-10-05','10:30')$sql$,
 '42501','Client actions are available only for Pro professional profiles','free target reaches Pro guard');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c5'),'free target denial leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c5absent');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000099','d6000001-0000-4000-8000-000000000001','D6 Absent','absent@example.test','consultation','2026-10-05','10:30')$sql$,
 '23503','Professional profile not found','absent target reaches Pro guard');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c5absent'),'absent target denial leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c5spoof');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','d6000001-0000-4000-8000-000000000004','D6 Spoof','spoof@example.test','consultation','2026-10-05','10:30')$sql$,
 '42501','new row violates row-level security policy for table "consultation_requests"','requester ID spoof rejected by RLS');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c5spoof'),'spoof denial leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c5anon');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','D6 Anon','anon@example.test','consultation','2026-10-05','10:30')$sql$,
 '42501','new row violates row-level security policy for table "consultation_requests"','anon without subject rejected by INSERT policy');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c5anon'),'anon denial leaves complete graph unchanged');
SELECT pg_temp.d6_snapshot('c5nosub');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$INSERT INTO public.consultation_requests(professional_id,requester_name,requester_email,request_type,preferred_date,preferred_time)
 VALUES ('d6000002-0000-4000-8000-000000000002','D6 No Sub','nosub@example.test','consultation','2026-10-05','10:30')$sql$,
 '42501','new row violates row-level security policy for table "consultation_requests"','authenticated without subject rejected by INSERT policy');
RESET ROLE;
SELECT is(pg_temp.d6_graph(),(SELECT graph FROM d6_before WHERE label='c5nosub'),'no-sub denial leaves complete graph unchanged');
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.consultation_requests
 WHERE requester_id='d6000001-0000-4000-8000-000000000001'),8,'requester sees all eight accepted requests');
SELECT is((SELECT count(*)::integer FROM public.notifications
 WHERE user_id='d6000001-0000-4000-8000-000000000001' AND title='Consultation status updated'),1,
 'requester sees exactly one status notice');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.consultation_requests
 WHERE professional_id='d6000002-0000-4000-8000-000000000002'
 AND requester_id='d6000001-0000-4000-8000-000000000001'),8,'professional sees all eight accepted requests');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE owner_id='d6000001-0000-4000-8000-000000000002'
 AND email IN ('booking@example.test','callback@example.test','message@example.test','manual@example.test',
 'inactive@example.test','start@example.test','end@example.test')),7,'professional sees seven canonical leads');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='d6000001-0000-4000-8000-000000000002'
 AND title='New consultation request'),8,'professional sees all eight created notices');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d6000001-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"d6000001-0000-4000-8000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.consultation_requests
 WHERE requester_id='d6000001-0000-4000-8000-000000000001'),0,'outsider sees none of the eight requests');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE owner_id='d6000001-0000-4000-8000-000000000002'
 AND email IN ('booking@example.test','callback@example.test','message@example.test','manual@example.test',
 'inactive@example.test','start@example.test','end@example.test')),0,'outsider sees none of the seven leads');
RESET ROLE;
SELECT is(current_setting('session_replication_role'),'origin','origin triggers remain active through final action');
SELECT is(current_user,'postgres','privileged inspection role restored');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true);

SELECT * FROM finish();
ROLLBACK;
SELECT 'POST' AS phase,pg_backend_pid() AS pid,current_user AS db_role,session_user AS session_role,
 current_setting('maiprop.test_disposable_database',true) AS marker,
 current_setting('session_replication_role') AS replication_role,
 auth.uid() AS actor,auth.jwt() AS jwt,
 current_setting('request.jwt.claim.sub',true) AS sub_claim,
 current_setting('request.jwt.claims',true) AS claims,
 current_setting('request.jwt.claim.role',true) AS role_claim;
DO $$ DECLARE b record; v_hashes jsonb; BEGIN
 SELECT * INTO STRICT b FROM d6_consult_baseline;
 SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'))
 INTO v_hashes FROM pg_proc p WHERE p.oid IN (
   'public.enforce_professional_pro_consultation_request()'::regprocedure,
   'public.validate_consultation_request_availability()'::regprocedure,
   'private.capture_consultation_owner_lead()'::regprocedure,
   'private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz)'::regprocedure,
   'private.notify_consultation_created()'::regprocedure,
   'private.notify_consultation_status_changed()'::regprocedure,
   'private.insert_interaction_notification(uuid,uuid,text,text,text,text)'::regprocedure);
 IF b.pid IS DISTINCT FROM pg_backend_pid()
 OR b.db_role IS DISTINCT FROM current_user OR b.session_role IS DISTINCT FROM session_user
 OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.replication_role IS DISTINCT FROM current_setting('session_replication_role')
 OR b.actor IS DISTINCT FROM auth.uid() OR b.jwt IS DISTINCT FROM auth.jwt()
 OR NULLIF(b.sub_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.sub',true),'')
 OR NULLIF(b.claims,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claims',true),'')
 OR NULLIF(b.role_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.role',true),'')
 OR b.source_hashes IS DISTINCT FROM v_hashes
 THEN RAISE EXCEPTION 'D6 same-backend identity, JWT, marker, origin or source was not restored'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()
   AND relname LIKE 'd6_%' AND relname <> 'd6_consult_baseline')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'd6_%')
 THEN RAISE EXCEPTION 'D6 temporary relation or function remains'; END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd6000001-%')
 OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'd6000001-%')
 OR EXISTS (SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'd6000001-%')
 OR EXISTS (SELECT 1 FROM public.professionals WHERE id::text LIKE 'd6000002-%' OR user_id::text LIKE 'd6000001-%')
 OR EXISTS (SELECT 1 FROM public.professional_availability WHERE professional_id::text LIKE 'd6000002-%')
 OR EXISTS (SELECT 1 FROM public.consultation_requests
    WHERE professional_id::text LIKE 'd6000002-%' OR requester_id::text LIKE 'd6000001-%')
 OR EXISTS (SELECT 1 FROM public.leads
    WHERE owner_id::text LIKE 'd6000001-%' OR professional_id::text LIKE 'd6000002-%')
 OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'd6000001-%')
 THEN RAISE EXCEPTION 'D6 scoped fixture residue after rollback'; END IF;
 IF (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 THEN RAISE EXCEPTION 'D6 source session or prepared transaction remains'; END IF;
END $$;
DROP TABLE d6_consult_baseline;
SELECT 'D6_CONSULT_SAME_BACKEND_CLEAN' AS result;
