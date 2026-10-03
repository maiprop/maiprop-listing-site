\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR (current_database() !~ '^maiprop_d0_[a-z0-9_]{6,48}$'
     AND current_database() !~ '^maiprop_t13d3_[0-9]{8}_firesale[0-9]{2}$')
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
 OR inet_server_addr() IS NOT NULL
 OR current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
 OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'exact owned disposable socket database required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(59);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers');
SELECT ok((SELECT bool_and(has_function_privilege('service_role',oid,'EXECUTE')
 AND NOT has_function_privilege('authenticated',oid,'EXECUTE')
 AND NOT has_function_privilege('anon',oid,'EXECUTE')) FROM pg_proc WHERE oid::regprocedure::text IN (
 'submit_firesale_interest(uuid,text,numeric,text)',
 'admin_update_firesale_interest_workflow(uuid,text,integer,boolean,text,numeric)',
 'admin_update_firesale_pipeline_deal(uuid,text,text,numeric,text,numeric)',
 'admin_set_firesale_investor_publication(uuid,boolean)')),
 'four legacy RPCs are service only');
CREATE FUNCTION pg_temp.fs_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u WHERE id::text LIKE 'd3180001-%'),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd3180001-%'),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd3180001-%'),
 'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)),'{}'::jsonb) FROM public.investor_subscriptions s WHERE user_id::text LIKE 'd3180001-%'),
 'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(r)),'{}'::jsonb) FROM public.firesale_requests r WHERE id::text LIKE 'd3180002-%'),
 'feed',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(f)),'{}'::jsonb) FROM public.firesale_requests_investor_feed f WHERE id::text LIKE 'd3180002-%'),
 'interest',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}'::jsonb) FROM public.firesale_interest i WHERE deal_id::text LIKE 'd3180002-%'),
 'audit',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.firesale_interest_audit_log a WHERE deal_id::text LIKE 'd3180002-%'),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n))
$$;
CREATE FUNCTION pg_temp.fs_put(s jsonb,k text,row_id text,r jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_set(s,ARRAY[k,row_id],r,true)
$$;
CREATE TEMP TABLE fs_before(state jsonb);
INSERT INTO auth.users(id,email) VALUES
 ('d3180001-0000-4000-8000-000000000001','fs-seller@example.test'),
 ('d3180001-0000-4000-8000-000000000002','fs-investor-a@example.test'),
 ('d3180001-0000-4000-8000-000000000003','fs-investor-b@example.test'),
 ('d3180001-0000-4000-8000-000000000004','fs-expired@example.test'),
 ('d3180001-0000-4000-8000-000000000005','kr@maiprop.co');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3180001-0000-4000-8000-000000000005'),'admin','owner trigger makes real admin');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d3180001-0000-4000-8000-000000000001','seller','seller');
SELECT public.complete_onboarding_role_for_user('d3180001-0000-4000-8000-000000000002','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d3180001-0000-4000-8000-000000000003','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d3180001-0000-4000-8000-000000000004','buyer','buyer');
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode) VALUES
 ('d3180001-0000-4000-8000-000000000002','private','pending_payment',now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d3180001-0000-4000-8000-000000000003','private','pending_payment',now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d3180001-0000-4000-8000-000000000004','private','pending_payment',now()-interval '1 day',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
UPDATE public.investor_subscriptions SET status='active' WHERE user_id::text LIKE 'd3180001-%';
INSERT INTO public.firesale_requests(id,user_id,address,city,sqm,condition,contact_email,asking_price) VALUES
 ('d3180002-0000-4000-8000-000000000001','d3180001-0000-4000-8000-000000000001','FS deal one','Athens',80,'good','fs-seller@example.test',350000),
 ('d3180002-0000-4000-8000-000000000002','d3180001-0000-4000-8000-000000000001','FS deal two','Athens',90,'good','fs-seller@example.test',450000);
SELECT * FROM public.admin_set_firesale_investor_publication_for_user(
 'd3180001-0000-4000-8000-000000000005','d3180002-0000-4000-8000-000000000001',true);
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is(private.has_investor_subscription_for_user('d3180001-0000-4000-8000-000000000004'),false,'expired control lacks current entitlement');
SELECT is(private.has_investor_subscription_for_user('d3180001-0000-4000-8000-000000000002'),true,'first investor has current entitlement');
INSERT INTO fs_before SELECT pg_temp.fs_state();
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user(NULL,'d3180002-0000-4000-8000-000000000001',NULL,NULL,NULL)$q$,'P0001','not_authenticated','null actor denied first');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'null actor full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000002',NULL,NULL,NULL,NULL)$q$,'P0001','invalid_deal_id','null deal denied first');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'null deal full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000002','d3180002-0000-4000-8000-000000000001',NULL,-1,NULL)$q$,'P0001','invalid_proof_amount','negative proof denied first');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'negative amount full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000002','d3180002-0000-4000-8000-000000000001',NULL,NULL,'d3180001-0000-4000-8000-000000000003/firesale/d3180002-0000-4000-8000-000000000001/proof')$q$,'P0001','invalid_proof_path','wrong owner proof denied first');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'wrong proof full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000004','d3180002-0000-4000-8000-000000000001',NULL,NULL,NULL)$q$,'P0001','investor_access_required','expired investor denied at entitlement');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'expired investor full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000002','d3180002-0000-4000-8000-000000000099',NULL,NULL,NULL)$q$,'P0001','firesale_deal_not_available','missing deal denied');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'missing deal full graph unchanged');
-- Two ordinary interests and first hold are setup for one new same-session conflict assertion.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fs_interest_a AS WITH called AS MATERIALIZED (SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000002','d3180002-0000-4000-8000-000000000001','A',NULL,NULL) r) SELECT (r).* FROM called;
CREATE TEMP TABLE fs_interest_b AS WITH called AS MATERIALIZED (SELECT public.submit_firesale_interest_for_user('d3180001-0000-4000-8000-000000000003','d3180002-0000-4000-8000-000000000001','B',NULL,NULL) r) SELECT (r).* FROM called;
CREATE TEMP TABLE fs_hold_a AS WITH called AS MATERIALIZED (SELECT public.admin_update_firesale_interest_workflow_for_user('d3180001-0000-4000-8000-000000000005',(SELECT id FROM fs_interest_a),'reserved',3,false,NULL,NULL) r) SELECT (r).* FROM called;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is((SELECT status FROM fs_hold_a),'reserved','first hold setup succeeded');
SELECT is((SELECT reservation_expires_at FROM fs_hold_a),now()+interval '3 hours','first hold expiry exact');
UPDATE fs_before SET state=pg_temp.fs_state();
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.admin_update_firesale_interest_workflow_for_user('d3180001-0000-4000-8000-000000000005',(SELECT id FROM fs_interest_b),'reserved',3,false,NULL,NULL)$q$,'P0001','active_reservation_exists_for_deal','same-session second hold rejected by guard');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true);
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'loser interest, audit, notices and entire graph unchanged');
-- The four retained overloads require a real subject even under service_role.
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.submit_firesale_interest('d3180002-0000-4000-8000-000000000002',NULL,NULL,NULL)$q$,'P0001','not_authenticated','legacy submit no-sub denial');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'legacy submit denial full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT * FROM public.admin_set_firesale_investor_publication('d3180002-0000-4000-8000-000000000002',true)$q$,'P0001','forbidden','legacy publication no-sub denial');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'legacy publication denial full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT * FROM public.admin_update_firesale_pipeline_deal('d3180002-0000-4000-8000-000000000002','reviewed',NULL,NULL,NULL,NULL)$q$,'P0001','forbidden','legacy pipeline no-sub denial');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'legacy pipeline denial full graph unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.admin_update_firesale_interest_workflow((SELECT id FROM fs_interest_b),'passed',NULL,false,NULL,NULL)$q$,'P0001','admin_only','legacy workflow no-sub denial');
RESET ROLE;
SELECT is(pg_temp.fs_state(),(SELECT state FROM fs_before),'legacy workflow denial full graph unchanged');
SELECT set_config('request.jwt.claim.sub','d3180001-0000-4000-8000-000000000005',true),set_config('request.jwt.claims','{"role":"service_role","sub":"d3180001-0000-4000-8000-000000000005"}',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fs_legacy_pub AS SELECT * FROM public.admin_set_firesale_investor_publication('d3180002-0000-4000-8000-000000000002',true);
RESET ROLE;
SELECT is((SELECT to_jsonb(p) FROM fs_legacy_pub p),jsonb_build_object('deal_id','d3180002-0000-4000-8000-000000000002','status','reviewed','published_to_investors',true),'legacy publication exact return');
SELECT is((SELECT count(*)::int FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),4,'legacy publication adds seller and three status-active investor notices');
SELECT is((SELECT jsonb_agg(to_jsonb(n)-'id' ORDER BY n.user_id) FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),
 jsonb_build_array(
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000001','title','Quick Sale request reviewed','body','Your Quick Sale request for FS deal two, Athens has been reviewed by the mAI Prop team.','type','quick_sale','read',false,'link','/dashboard','created_at',now()),
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000002','title','New Quick Sale deal available','body','A new Quick Sale opportunity at FS deal two, Athens is now available in your investor dashboard.','type','investor_alert','read',false,'link','/investor-dashboard','created_at',now()),
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000003','title','New Quick Sale deal available','body','A new Quick Sale opportunity at FS deal two, Athens is now available in your investor dashboard.','type','investor_alert','read',false,'link','/investor-dashboard','created_at',now()),
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000004','title','New Quick Sale deal available','body','A new Quick Sale opportunity at FS deal two, Athens is now available in your investor dashboard.','type','investor_alert','read',false,'link','/investor-dashboard','created_at',now())),
 'legacy publication exact recipient notice content');
SELECT is(pg_temp.fs_state()-'notifications',(SELECT pg_temp.fs_put(pg_temp.fs_put(state,'requests','d3180002-0000-4000-8000-000000000002',
 (state->'requests'->'d3180002-0000-4000-8000-000000000002')||jsonb_build_object('status','reviewed','published_to_investors',true,'updated_at',now())),
 'feed','d3180002-0000-4000-8000-000000000002',
 jsonb_build_object('id','d3180002-0000-4000-8000-000000000002','created_at',(state->'requests'->'d3180002-0000-4000-8000-000000000002')->'created_at',
 'address','FS deal two','city','Athens','property_type',(state->'requests'->'d3180002-0000-4000-8000-000000000002')->'property_type',
 'sqm',90,'bedrooms',(state->'requests'->'d3180002-0000-4000-8000-000000000002')->'bedrooms','condition','good',
 'ai_estimate',(state->'requests'->'d3180002-0000-4000-8000-000000000002')->'ai_estimate','asking_price',450000,'status','reviewed'))-'notifications' FROM fs_before),
 'legacy publication exact request and feed change');
WITH new_rows AS (SELECT n.id,n.user_id FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),
 expected_rows AS (SELECT n.id::text k,jsonb_build_object('id',n.id,'user_id',e.user_id,
 'title',e.title,'body',e.body,'type',e.kind,'read',false,'link',e.link,'created_at',now()) v
 FROM new_rows n JOIN (VALUES
 ('d3180001-0000-4000-8000-000000000001'::uuid,'Quick Sale request reviewed','Your Quick Sale request for FS deal two, Athens has been reviewed by the mAI Prop team.','quick_sale','/dashboard'),
 ('d3180001-0000-4000-8000-000000000002'::uuid,'New Quick Sale deal available','A new Quick Sale opportunity at FS deal two, Athens is now available in your investor dashboard.','investor_alert','/investor-dashboard'),
 ('d3180001-0000-4000-8000-000000000003'::uuid,'New Quick Sale deal available','A new Quick Sale opportunity at FS deal two, Athens is now available in your investor dashboard.','investor_alert','/investor-dashboard'),
 ('d3180001-0000-4000-8000-000000000004'::uuid,'New Quick Sale deal available','A new Quick Sale opportunity at FS deal two, Athens is now available in your investor dashboard.','investor_alert','/investor-dashboard'))
 e(user_id,title,body,kind,link) ON e.user_id=n.user_id),
 expected AS (SELECT (state->'notifications') || (SELECT jsonb_object_agg(k,v) FROM expected_rows) notices FROM fs_before)
SELECT is((pg_temp.fs_state())->'notifications',(SELECT notices FROM expected),'legacy publication full notice graph preserves prior IDs and exact new rows');
UPDATE fs_before SET state=pg_temp.fs_state();
SELECT set_config('request.jwt.claim.sub','d3180001-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"role":"service_role","sub":"d3180001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fs_legacy_interest AS WITH called AS MATERIALIZED (SELECT public.submit_firesale_interest('d3180002-0000-4000-8000-000000000002','legacy',100000,NULL) r) SELECT (r).* FROM called;
RESET ROLE;
SELECT is((SELECT to_jsonb(i) FROM fs_legacy_interest i),(SELECT jsonb_build_object('id',i.id,'deal_id','d3180002-0000-4000-8000-000000000002','investor_id','d3180001-0000-4000-8000-000000000003','status','prioritized','message','legacy','proof_amount',100000,'proof_of_funds_url',NULL,'created_at',now(),'updated_at',now(),'last_status_changed_at',now(),'proof_of_funds_verified_at',NULL,'proof_of_funds_verified_by',NULL,'reservation_expires_at',NULL,'reserved_at',NULL,'reserved_by',NULL,'admin_note',NULL) FROM fs_legacy_interest i),'legacy submit exact returned row');
SELECT is((SELECT to_jsonb(i) FROM public.firesale_interest i WHERE id=(SELECT id FROM fs_legacy_interest)),(SELECT to_jsonb(i) FROM fs_legacy_interest i),'legacy submit persisted return');
SELECT is((SELECT count(*)::int FROM public.firesale_interest_audit_log a WHERE deal_id='d3180002-0000-4000-8000-000000000002'),1,'legacy submit one audit row');
SELECT is((SELECT to_jsonb(a)-'id' FROM public.firesale_interest_audit_log a WHERE deal_id='d3180002-0000-4000-8000-000000000002'),
 jsonb_build_object('interest_id',(SELECT id FROM fs_legacy_interest),'deal_id','d3180002-0000-4000-8000-000000000002',
 'actor_id','d3180001-0000-4000-8000-000000000003','action','interest_created','from_status',NULL,'to_status','prioritized',
 'metadata',jsonb_build_object('proof_amount',100000,'reservation_expires_at',NULL),'created_at',now()),
 'legacy submit exact audit record');
SELECT is((SELECT count(*)::int FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),0,'legacy submit no notice');
SELECT is((SELECT (pg_temp.fs_state()-'interest'-'audit')= (state-'interest'-'audit') FROM fs_before),true,'legacy submit preserves other entire graph');
WITH expected_interest AS (
 SELECT i.id::text k,jsonb_build_object('id',i.id,'deal_id','d3180002-0000-4000-8000-000000000002',
 'investor_id','d3180001-0000-4000-8000-000000000003','status','prioritized','message','legacy',
 'proof_amount',100000,'proof_of_funds_url',NULL,'created_at',now(),'updated_at',now(),
 'last_status_changed_at',now(),'proof_of_funds_verified_at',NULL,'proof_of_funds_verified_by',NULL,
 'reservation_expires_at',NULL,'reserved_at',NULL,'reserved_by',NULL,'admin_note',NULL) row
 FROM fs_legacy_interest i),
 expected_audit AS (
 SELECT a.id::text k,jsonb_build_object('id',a.id,'interest_id',(SELECT id FROM fs_legacy_interest),
 'deal_id','d3180002-0000-4000-8000-000000000002','actor_id','d3180001-0000-4000-8000-000000000003',
 'action','interest_created','from_status',NULL,'to_status','prioritized',
 'metadata',jsonb_build_object('proof_amount',100000,'reservation_expires_at',NULL),'created_at',now()) row
 FROM public.firesale_interest_audit_log a WHERE a.deal_id='d3180002-0000-4000-8000-000000000002')
SELECT is(pg_temp.fs_state(),(SELECT pg_temp.fs_put(pg_temp.fs_put(b.state,'interest',i.k,i.row),'audit',a.k,a.row)
 FROM fs_before b,expected_interest i,expected_audit a),'legacy submit full independently modeled graph');
UPDATE fs_before SET state=pg_temp.fs_state();
SELECT set_config('request.jwt.claim.sub','d3180001-0000-4000-8000-000000000005',true),set_config('request.jwt.claims','{"role":"service_role","sub":"d3180001-0000-4000-8000-000000000005"}',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fs_legacy_hold AS WITH called AS MATERIALIZED (SELECT public.admin_update_firesale_interest_workflow((SELECT id FROM fs_legacy_interest),'reserved',2,true,'verified',NULL) r) SELECT (r).* FROM called;
RESET ROLE;
SELECT is((SELECT to_jsonb(h) FROM fs_legacy_hold h),(SELECT to_jsonb(i) || jsonb_build_object('status','reserved','reservation_expires_at',now()+interval '2 hours','reserved_at',now(),'reserved_by','d3180001-0000-4000-8000-000000000005','proof_of_funds_verified_at',now(),'proof_of_funds_verified_by','d3180001-0000-4000-8000-000000000005','admin_note','verified','updated_at',now(),'last_status_changed_at',now()) FROM fs_legacy_interest i),'legacy workflow exact returned row');
SELECT is((SELECT to_jsonb(i) FROM public.firesale_interest i WHERE id=(SELECT id FROM fs_legacy_interest)),(SELECT to_jsonb(h) FROM fs_legacy_hold h),'legacy workflow persisted return');
SELECT is((SELECT count(*)::int FROM public.firesale_interest_audit_log a WHERE deal_id='d3180002-0000-4000-8000-000000000002'),2,'legacy workflow one additional audit');
SELECT is((SELECT to_jsonb(a)-'id' FROM public.firesale_interest_audit_log a WHERE deal_id='d3180002-0000-4000-8000-000000000002' AND NOT ((SELECT state->'audit' FROM fs_before) ? a.id::text)),
 jsonb_build_object('interest_id',(SELECT id FROM fs_legacy_interest),'deal_id','d3180002-0000-4000-8000-000000000002',
 'actor_id','d3180001-0000-4000-8000-000000000005','action','reservation_assigned','from_status','prioritized','to_status','reserved',
 'metadata',jsonb_build_object('proof_amount_before',100000,'proof_amount_after',100000,
 'reservation_expires_at_before',NULL,'reservation_expires_at_after',now()+interval '2 hours'),'created_at',now()),
 'legacy workflow exact audit record');
SELECT is((SELECT count(*)::int FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),0,'legacy workflow no notice');
SELECT is((SELECT (pg_temp.fs_state()-'interest'-'audit')= (state-'interest'-'audit') FROM fs_before),true,'legacy workflow preserves other entire graph');
WITH expected_interest AS (
 SELECT i.id::text k,(b.state->'interest'->i.id::text) || jsonb_build_object(
 'status','reserved','reservation_expires_at',now()+interval '2 hours','reserved_at',now(),
 'reserved_by','d3180001-0000-4000-8000-000000000005','proof_of_funds_verified_at',now(),
 'proof_of_funds_verified_by','d3180001-0000-4000-8000-000000000005','admin_note','verified',
 'updated_at',now(),'last_status_changed_at',now()) row FROM fs_before b,fs_legacy_interest i),
 expected_audit AS (
 SELECT a.id::text k,jsonb_build_object('id',a.id,'interest_id',(SELECT id FROM fs_legacy_interest),
 'deal_id','d3180002-0000-4000-8000-000000000002','actor_id','d3180001-0000-4000-8000-000000000005',
 'action','reservation_assigned','from_status','prioritized','to_status','reserved',
 'metadata',jsonb_build_object('proof_amount_before',100000,'proof_amount_after',100000,
 'reservation_expires_at_before',NULL,'reservation_expires_at_after',now()+interval '2 hours'),
 'created_at',now()) row FROM public.firesale_interest_audit_log a
 WHERE a.deal_id='d3180002-0000-4000-8000-000000000002'
 AND NOT ((SELECT state->'audit' FROM fs_before) ? a.id::text))
SELECT is(pg_temp.fs_state(),(SELECT pg_temp.fs_put(pg_temp.fs_put(b.state,'interest',i.k,i.row),'audit',a.k,a.row)
 FROM fs_before b,expected_interest i,expected_audit a),'legacy workflow full independently modeled graph');
UPDATE fs_before SET state=pg_temp.fs_state();
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fs_legacy_pipeline AS SELECT * FROM public.admin_update_firesale_pipeline_deal('d3180002-0000-4000-8000-000000000002','closed','counter response',425000,'countered',425000);
RESET ROLE;
SELECT is((SELECT to_jsonb(p) FROM fs_legacy_pipeline p),jsonb_build_object('deal_id','d3180002-0000-4000-8000-000000000002','status','closed','notified',3),'legacy pipeline exact return and notice count');
SELECT is((SELECT count(*)::int FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),3,'legacy pipeline inserts three notices');
SELECT is((SELECT jsonb_agg(jsonb_build_object('user_id',n.user_id,'title',n.title,'body',n.body,'type',n.type,'read',n.read,'link',n.link,'created_at',n.created_at) ORDER BY n.title) FROM public.notifications n WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),
 jsonb_build_array(
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000003','title','Quick Sale closed','body','The Quick Sale opportunity at FS deal two, Athens is now closed.','type','investor_alert','read',false,'link','/investor-dashboard','created_at',now()),
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000001','title','Quick Sale request closed','body','Your Quick Sale request for FS deal two, Athens has been marked closed.','type','quick_sale','read',false,'link','/dashboard','created_at',now()),
 jsonb_build_object('user_id','d3180001-0000-4000-8000-000000000003','title','Seller countered Quick Sale offer','body','The seller countered the current offer for FS deal two, Athens.','type','investor_alert','read',false,'link','/investor-dashboard','created_at',now())),
 'legacy pipeline exact recipients and notice content');
SELECT is((SELECT (pg_temp.fs_state()-'requests'-'feed'-'notifications')=(state-'requests'-'feed'-'notifications') FROM fs_before),true,'legacy pipeline preserves auth, profile, subscription, interest, audit');
SELECT is((SELECT to_jsonb(r) FROM public.firesale_requests r WHERE id='d3180002-0000-4000-8000-000000000002'),
 (SELECT (state->'requests'->'d3180002-0000-4000-8000-000000000002') ||
 jsonb_build_object('status','closed','admin_notes','counter response','offer_price',425000,'seller_response','countered',
 'seller_response_price',425000,'seller_responded_at',now(),'updated_at',now()) FROM fs_before),
 'legacy pipeline exact request row');
SELECT is((SELECT to_jsonb(f) FROM public.firesale_requests_investor_feed f WHERE id='d3180002-0000-4000-8000-000000000002'),
 (SELECT (state->'feed'->'d3180002-0000-4000-8000-000000000002') || jsonb_build_object('status','closed') FROM fs_before),
 'legacy pipeline exact feed row');
WITH expected_notices AS (
 SELECT n.id::text k,jsonb_build_object('id',n.id,'user_id',e.user_id,'title',e.title,'body',e.body,
 'type',e.kind,'read',false,'link',e.link,'created_at',now()) row
 FROM public.notifications n JOIN (VALUES
 ('Quick Sale closed','d3180001-0000-4000-8000-000000000003'::uuid,'The Quick Sale opportunity at FS deal two, Athens is now closed.','investor_alert','/investor-dashboard'),
 ('Quick Sale request closed','d3180001-0000-4000-8000-000000000001'::uuid,'Your Quick Sale request for FS deal two, Athens has been marked closed.','quick_sale','/dashboard'),
 ('Seller countered Quick Sale offer','d3180001-0000-4000-8000-000000000003'::uuid,'The seller countered the current offer for FS deal two, Athens.','investor_alert','/investor-dashboard'))
 e(title,user_id,body,kind,link) ON e.title=n.title
 WHERE NOT ((SELECT state->'notifications' FROM fs_before) ? n.id::text)),
 expected AS (SELECT jsonb_set(
 pg_temp.fs_put(pg_temp.fs_put(b.state,'requests','d3180002-0000-4000-8000-000000000002',
 (b.state->'requests'->'d3180002-0000-4000-8000-000000000002')||jsonb_build_object(
 'status','closed','admin_notes','counter response','offer_price',425000,'seller_response','countered',
 'seller_response_price',425000,'seller_responded_at',now(),'updated_at',now())),
 'feed','d3180002-0000-4000-8000-000000000002',
 (b.state->'feed'->'d3180002-0000-4000-8000-000000000002')||jsonb_build_object('status','closed')),
 '{notifications}',(b.state->'notifications')||(SELECT jsonb_object_agg(k,row) FROM expected_notices)) state
 FROM fs_before b)
SELECT is(pg_temp.fs_state(),(SELECT state FROM expected),'legacy pipeline full independently modeled graph');
SELECT is((SELECT status FROM public.firesale_requests WHERE id='d3180002-0000-4000-8000-000000000002'),'closed','legacy pipeline closes persisted request');
SELECT is((SELECT seller_response FROM public.firesale_requests WHERE id='d3180002-0000-4000-8000-000000000002'),'countered','legacy pipeline stores counter response');
SELECT is((SELECT status FROM public.firesale_requests_investor_feed WHERE id='d3180002-0000-4000-8000-000000000002'),'closed','normal trigger updates feed status');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain enabled');
SELECT * FROM finish();
ROLLBACK;
