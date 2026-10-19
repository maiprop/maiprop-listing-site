\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_t13_project_firesale_[0-9]{8}_[0-9]{2}|maiprop_d0_[a-z0-9_]{6,48})$'
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('session_replication_role')<>'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 THEN RAISE EXCEPTION 'firesale suite requires exact owned disposable socket clone'; END IF;
END $$;
CREATE FUNCTION pg_temp.fr_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
 'invitations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.invitation_requests x),
 'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.investor_subscriptions x),
 'requests',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.firesale_requests x),
 'feed',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.firesale_requests_investor_feed x),
 'interest',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.firesale_interest x),
 'audit',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.firesale_interest_audit_log x),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x))
$$;
CREATE FUNCTION pg_temp.fr_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(SELECT jsonb_object_agg(oid::regprocedure::text,jsonb_build_object('sha',encode(digest(pg_get_functiondef(oid),'sha256'),'hex'),'owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'acl',proacl,'expanded',(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantee,privilege_type) FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a))) FROM pg_proc WHERE oid IN ('public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure,'public.admin_set_firesale_investor_publication_for_user(uuid,uuid,boolean)'::regprocedure,'public.submit_firesale_interest_for_user(uuid,uuid,text,numeric,text)'::regprocedure,'public.admin_update_firesale_interest_workflow_for_user(uuid,uuid,text,integer,boolean,text,numeric)'::regprocedure,'public.admin_update_firesale_pipeline_deal_for_user(uuid,uuid,text,text,numeric,text,numeric)'::regprocedure,'private.has_investor_subscription_for_user(uuid)'::regprocedure,'public.release_expired_firesale_reservations(uuid)'::regprocedure) OR oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.invitation_requests'::regclass,'public.investor_subscriptions'::regclass,'public.firesale_requests'::regclass,'public.firesale_interest'::regclass,'public.notifications'::regclass) AND NOT tgisinternal)),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid,true)) ORDER BY tgrelid::regclass::text,tgname),'[]'::jsonb) FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.invitation_requests'::regclass,'public.investor_subscriptions'::regclass,'public.firesale_requests'::regclass,'public.firesale_interest'::regclass,'public.notifications'::regclass) AND NOT tgisinternal),
 'tables',(SELECT jsonb_object_agg(oid::regclass::text,jsonb_build_object('owner',pg_get_userbyid(relowner),'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),'not_null',attnotnull,'generated',attgenerated,'default',pg_get_expr(adbin,adrelid)) ORDER BY attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND attnum>0 AND NOT attisdropped),'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'roles',polroles,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb) FROM pg_policy WHERE polrelid=c.oid))) FROM pg_class c WHERE oid IN ('public.invitation_requests'::regclass,'public.investor_subscriptions'::regclass,'public.firesale_requests'::regclass,'public.firesale_requests_investor_feed'::regclass,'public.firesale_interest'::regclass,'public.firesale_interest_audit_log'::regclass,'public.notifications'::regclass)),
 'effective',(SELECT jsonb_object_agg(r,jsonb_build_object('pipeline',has_function_privilege(r,'public.admin_update_firesale_pipeline_deal_for_user(uuid,uuid,text,text,numeric,text,numeric)','EXECUTE'),'submit',has_function_privilege(r,'public.submit_firesale_interest_for_user(uuid,uuid,text,numeric,text)','EXECUTE'),'sub_update',has_table_privilege(r,'public.investor_subscriptions','UPDATE'))) FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) q(r)))
$$;
CREATE TEMP TABLE fr_baseline AS SELECT pg_backend_pid() pid,pg_temp.fr_catalog() catalog,pg_temp.fr_graph() graph;
SELECT 'FR_PRE',pid,encode(digest(catalog::text,'sha256'),'hex'),encode(digest(graph::text,'sha256'),'hex') FROM fr_baseline;
BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SELECT plan(29);
SELECT is(current_setting('session_replication_role'),'origin','ordinary triggers');
SELECT is((SELECT catalog->'routines'->'admin_update_firesale_pipeline_deal_for_user(uuid,uuid,text,text,numeric,text,numeric)'->>'sha' FROM fr_baseline),'d755da61395c22f7fe5cebc156cd11b37c64d6223a4f98924d23f1a8eb65f9f9','active pipeline installed identity');
SELECT ok((SELECT bool_and(tgenabled='O') FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.investor_subscriptions'::regclass,'public.firesale_requests'::regclass,'public.firesale_interest'::regclass) AND NOT tgisinternal),'normal trigger attachments');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE 'a13f1001-%'),0,'recipient fixture namespace unused');
INSERT INTO auth.users(id,email) VALUES
 ('a13f1001-0000-4000-8000-000000000001','fr-seller@example.test'),
 ('a13f1001-0000-4000-8000-000000000002','fr-interested@example.test'),
 ('a13f1001-0000-4000-8000-000000000003','fr-prioritized@example.test'),
 ('a13f1001-0000-4000-8000-000000000004','fr-reserved@example.test'),
 ('a13f1001-0000-4000-8000-000000000005','fr-passed@example.test'),
 ('a13f1001-0000-4000-8000-000000000006','fr-nonparticipant@example.test'),
 ('a13f1001-0000-4000-8000-000000000007','kr@maiprop.co');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='a13f1001-0000-4000-8000-000000000007'),'admin','canonical owner normal admin trigger');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('a13f1001-0000-4000-8000-000000000001','seller','seller');
SELECT public.complete_onboarding_role_for_user(('a13f1001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'buyer','buyer') FROM generate_series(2,6)n;
RESET ROLE;
INSERT INTO public.invitation_requests(id,email,full_name,user_id) SELECT ('a13f1002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'fr-'||n||'@example.test','FR Investor '||n,('a13f1001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(2,5)n;
SET LOCAL ROLE service_role;
SELECT public.admin_review_invitation_request('a13f1001-0000-4000-8000-000000000007',('a13f1002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approved','private',NULL) FROM generate_series(2,5)n;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.investor_subscriptions WHERE user_id::text LIKE 'a13f1001-%' AND status='pending_payment'),4,'normal approval gives four pending subscriptions');
SELECT is((SELECT count(*)::integer FROM public.investor_subscriptions WHERE user_id='a13f1001-0000-4000-8000-000000000006'),0,'nonparticipant has no entitlement');
-- Local synthetic checkout-session persistence: exact create-investor-payment PATCH fields/predicates.
CREATE TEMP TABLE fr_pending AS SELECT n,s.id,s.user_id FROM generate_series(2,5) n JOIN public.investor_subscriptions s ON s.user_id=('a13f1001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid WHERE s.tier='private' AND s.status='pending_payment' AND s.stripe_session_id IS NULL;
CREATE TEMP TABLE fr_linked (LIKE public.investor_subscriptions);
CREATE TEMP TABLE fr_link_effects(n integer,user_id uuid,affected integer);
CREATE TEMP TABLE fr_before_link AS SELECT pg_temp.fr_graph() graph;
GRANT SELECT ON fr_pending TO service_role;
GRANT INSERT,SELECT ON fr_linked,fr_link_effects TO service_role;
SET LOCAL ROLE service_role;
DO $fr$ DECLARE p record; rows_changed integer; BEGIN
 FOR p IN SELECT n,id,user_id FROM fr_pending ORDER BY n LOOP
  UPDATE public.investor_subscriptions s
  SET stripe_customer_id='cus_fr_'||p.n, stripe_session_id='cs_fr_'||p.n,
      runtime_mode=public.current_billing_runtime_mode(),
      livemode=public.current_billing_runtime_mode()='live',updated_at=now()
  WHERE s.id=p.id AND s.status='pending_payment' AND s.stripe_session_id IS NULL;
  GET DIAGNOSTICS rows_changed=ROW_COUNT;
  INSERT INTO fr_link_effects VALUES (p.n,p.user_id,rows_changed);
  INSERT INTO fr_linked SELECT s.* FROM public.investor_subscriptions s WHERE s.id=p.id;
 END LOOP;
END $fr$;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM fr_linked),4,'source-shaped checkout persistence updates four exact pending rows');
SELECT is((SELECT jsonb_agg(jsonb_build_array(n,user_id,affected) ORDER BY n) FROM fr_link_effects),'[[2,"a13f1001-0000-4000-8000-000000000002",1],[3,"a13f1001-0000-4000-8000-000000000003",1],[4,"a13f1001-0000-4000-8000-000000000004",1],[5,"a13f1001-0000-4000-8000-000000000005",1]]'::jsonb,'each exact pending subscription ID updated once');
SELECT ok((SELECT bool_and(status='pending_payment' AND stripe_session_id IS NOT NULL AND runtime_mode=public.current_billing_runtime_mode()) FROM fr_linked),'all persisted sessions retain pending state and matching runtime');
SELECT is(pg_temp.fr_graph()->'subscriptions',(SELECT jsonb_object_agg(k,CASE WHEN value->>'user_id' LIKE 'a13f1001-%' THEN value||jsonb_build_object('stripe_customer_id','cus_fr_'||right(value->>'user_id',1),'stripe_session_id','cs_fr_'||right(value->>'user_id',1),'runtime_mode',public.current_billing_runtime_mode(),'livemode',public.current_billing_runtime_mode()='live','updated_at',now()) ELSE value END) FROM jsonb_each((SELECT graph->'subscriptions' FROM fr_before_link)) q(k,value)),'complete subscription graph matches exact checkout persistence fields');
CREATE TEMP TABLE fr_before_activation AS SELECT pg_temp.fr_graph() graph;
-- Local synthetic paid-session callback: exact stripe-webhook activation fields/predicates; no provider assertion.
CREATE TEMP TABLE fr_activated (LIKE public.investor_subscriptions);
CREATE TEMP TABLE fr_activation_effects(n integer,user_id uuid,affected integer);
GRANT INSERT,SELECT ON fr_activated,fr_activation_effects TO service_role;
SET LOCAL ROLE service_role;
DO $fr$ DECLARE p record; rows_changed integer; BEGIN
 FOR p IN SELECT n,user_id FROM fr_pending ORDER BY n LOOP
  UPDATE public.investor_subscriptions s
  SET status='active',started_at=now(),expires_at=now()+interval '365 days',
      updated_at=now(),activated_at=now(),stripe_customer_id='cus_fr_'||p.n,
      stripe_session_id='cs_fr_'||p.n,
      runtime_mode=public.current_billing_runtime_mode(),
      livemode=public.current_billing_runtime_mode()='live'
  WHERE s.user_id=p.user_id AND s.tier='private'
    AND s.stripe_session_id='cs_fr_'||p.n AND s.status='pending_payment';
  GET DIAGNOSTICS rows_changed=ROW_COUNT;
  INSERT INTO fr_activation_effects VALUES (p.n,p.user_id,rows_changed);
  INSERT INTO fr_activated SELECT s.* FROM public.investor_subscriptions s
   WHERE s.user_id=p.user_id AND s.tier='private' AND s.stripe_session_id='cs_fr_'||p.n;
 END LOOP;
END $fr$;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM fr_activated),4,'source-shaped service activation updates each matched pending row once');
SELECT is((SELECT jsonb_agg(jsonb_build_array(n,user_id,affected) ORDER BY n) FROM fr_activation_effects),'[[2,"a13f1001-0000-4000-8000-000000000002",1],[3,"a13f1001-0000-4000-8000-000000000003",1],[4,"a13f1001-0000-4000-8000-000000000004",1],[5,"a13f1001-0000-4000-8000-000000000005",1]]'::jsonb,'each exact user/tier/session pending activation affects one row');
SELECT is(pg_temp.fr_graph()->'subscriptions',(SELECT jsonb_object_agg(k,CASE WHEN value->>'user_id' LIKE 'a13f1001-%' THEN value||jsonb_build_object('status','active','started_at',now(),'expires_at',now()+interval '365 days','updated_at',now(),'activated_at',now(),'stripe_customer_id','cus_fr_'||right(value->>'user_id',1),'stripe_session_id','cs_fr_'||right(value->>'user_id',1),'runtime_mode',public.current_billing_runtime_mode(),'livemode',public.current_billing_runtime_mode()='live') ELSE value END) FROM jsonb_each((SELECT graph->'subscriptions' FROM fr_before_activation)) q(k,value)),'complete subscription graph matches exact source activation fields');
SELECT ok((SELECT bool_and(private.has_investor_subscription_for_user(user_id)) FROM fr_activated),'four investor entitlements recognized before interest');
SELECT ok((SELECT bool_and(role::text='investor' OR participant_type::text='investor') FROM public.profiles WHERE user_id IN (SELECT user_id FROM fr_activated)),'normal subscription trigger yields investor participant access');
SELECT is((SELECT count(*)::integer FROM public.investor_subscriptions WHERE user_id='a13f1001-0000-4000-8000-000000000006'),0,'nonparticipant remains unsubscribed');
SET LOCAL ROLE service_role;
INSERT INTO public.firesale_requests(id,user_id,address,city,sqm,condition,contact_email,asking_price) VALUES ('a13f1003-0000-4000-8000-000000000001','a13f1001-0000-4000-8000-000000000001','FR property','Athens',80,'good','fr-seller@example.test',350000);
SELECT * FROM public.admin_set_firesale_investor_publication_for_user('a13f1001-0000-4000-8000-000000000007','a13f1003-0000-4000-8000-000000000001',true);
RESET ROLE;
SELECT is((SELECT status||':'||published_to_investors::text FROM public.firesale_requests WHERE id='a13f1003-0000-4000-8000-000000000001'),'reviewed:true','ordinary publication makes deal available');
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fr_interests AS SELECT n,(public.submit_firesale_interest_for_user(('a13f1001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'a13f1003-0000-4000-8000-000000000001','FR interest '||n,CASE WHEN n=3 THEN 250000::numeric ELSE NULL END,NULL)).id id FROM generate_series(2,5)n;
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM fr_interests),4,'four normal interest submissions');
SET LOCAL ROLE service_role;
SELECT public.admin_update_firesale_interest_workflow_for_user('a13f1001-0000-4000-8000-000000000007',(SELECT id FROM fr_interests WHERE n=4),'reserved',2,false,NULL,NULL);
SELECT public.admin_update_firesale_interest_workflow_for_user('a13f1001-0000-4000-8000-000000000007',(SELECT id FROM fr_interests WHERE n=5),'passed',NULL,false,NULL,NULL);
RESET ROLE;
SELECT is((SELECT jsonb_agg(jsonb_build_array(f.n,i.status) ORDER BY f.n) FROM fr_interests f JOIN public.firesale_interest i ON i.id=f.id),'[[2,"interested"],[3,"prioritized"],[4,"reserved"],[5,"passed"]]'::jsonb,'statuses reached through normal submit/admin workflow');
CREATE TEMP TABLE fr_before_pipeline AS SELECT pg_temp.fr_graph() graph;
-- This expected multiset is fixed from fixture status intent before the RPC, not from inserted notices.
CREATE TEMP TABLE fr_expected_notices(user_id uuid,title text,body text,type text,read boolean,link text);
INSERT INTO fr_expected_notices VALUES
 ('a13f1001-0000-4000-8000-000000000001','Quick Sale request closed','Your Quick Sale request for FR property, Athens has been marked closed.','quick_sale',false,'/dashboard'),
 ('a13f1001-0000-4000-8000-000000000002','Quick Sale closed','The Quick Sale opportunity at FR property, Athens is now closed.','investor_alert',false,'/investor-dashboard'),
 ('a13f1001-0000-4000-8000-000000000003','Quick Sale closed','The Quick Sale opportunity at FR property, Athens is now closed.','investor_alert',false,'/investor-dashboard'),
 ('a13f1001-0000-4000-8000-000000000004','Quick Sale closed','The Quick Sale opportunity at FR property, Athens is now closed.','investor_alert',false,'/investor-dashboard'),
 ('a13f1001-0000-4000-8000-000000000004','Seller rejected Quick Sale offer','The seller rejected the current offer for FR property, Athens.','investor_alert',false,'/investor-dashboard');
SELECT is((SELECT count(*)::integer FROM fr_expected_notices),5,'independent expected recipient multiset has five notices');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fr_pipeline AS SELECT * FROM public.admin_update_firesale_pipeline_deal_for_user('a13f1001-0000-4000-8000-000000000007','a13f1003-0000-4000-8000-000000000001','closed',NULL,NULL,'rejected',NULL);
RESET ROLE;
SELECT is((SELECT to_jsonb(r) FROM fr_pipeline r),jsonb_build_object('deal_id','a13f1003-0000-4000-8000-000000000001','status','closed','notified',5),'active closed plus rejected returns exact result');
SELECT is((SELECT count(*)::integer FROM public.notifications n WHERE NOT ((SELECT graph->'notifications' FROM fr_before_pipeline) ? n.id::text)),5,'exact five new notices');
SELECT is((SELECT jsonb_agg(jsonb_build_array(user_id,title,body,type,read,link) ORDER BY user_id,title) FROM public.notifications n WHERE NOT ((SELECT graph->'notifications' FROM fr_before_pipeline) ? n.id::text)),(SELECT jsonb_agg(jsonb_build_array(user_id,title,body,type,read,link) ORDER BY user_id,title) FROM fr_expected_notices),'complete new notice multiset matches independent expected rows');
SELECT is((SELECT count(*)::integer FROM public.notifications n WHERE NOT ((SELECT graph->'notifications' FROM fr_before_pipeline) ? n.id::text) AND n.user_id IN ('a13f1001-0000-4000-8000-000000000005','a13f1001-0000-4000-8000-000000000006')),0,'passed and nonparticipant excluded');
WITH expected AS (SELECT jsonb_set(jsonb_set(jsonb_set(graph,ARRAY['requests','a13f1003-0000-4000-8000-000000000001'],(graph->'requests'->'a13f1003-0000-4000-8000-000000000001')||jsonb_build_object('status','closed','seller_response','rejected','seller_responded_at',now(),'updated_at',now())),ARRAY['feed','a13f1003-0000-4000-8000-000000000001'],(graph->'feed'->'a13f1003-0000-4000-8000-000000000001')||jsonb_build_object('status','closed')),'{notifications}',(graph->'notifications')||(SELECT jsonb_object_agg(n.id::text,jsonb_build_object('id',n.id,'user_id',e.user_id,'title',e.title,'body',e.body,'type',e.type,'read',e.read,'link',e.link,'created_at',now())) FROM public.notifications n JOIN fr_expected_notices e ON e.user_id=n.user_id AND e.title=n.title WHERE NOT (graph->'notifications' ? n.id::text))) graph FROM fr_before_pipeline) SELECT is(pg_temp.fr_graph(),(SELECT graph FROM expected),'exact full graph after active pipeline');
CREATE TEMP TABLE fr_after_pipeline AS SELECT pg_temp.fr_graph() graph;
SET LOCAL ROLE service_role;
CREATE TEMP TABLE fr_repeat AS SELECT * FROM public.admin_update_firesale_pipeline_deal_for_user('a13f1001-0000-4000-8000-000000000007','a13f1003-0000-4000-8000-000000000001','closed',NULL,NULL,'rejected',NULL);
RESET ROLE;
SELECT is((SELECT to_jsonb(r) FROM fr_repeat r),jsonb_build_object('deal_id','a13f1003-0000-4000-8000-000000000001','status','closed','notified',0),'identical repeat returns no notices');
SELECT is(pg_temp.fr_graph(),(SELECT graph FROM fr_after_pipeline),'repeat preserves complete graph and notice IDs');
SELECT is(pg_temp.fr_catalog(),(SELECT catalog FROM fr_baseline),'same-backend catalog unchanged');
SELECT * FROM finish();
ROLLBACK;
SELECT 'FR_POST',pg_backend_pid(),encode(digest(pg_temp.fr_catalog()::text,'sha256'),'hex'),encode(digest(pg_temp.fr_graph()::text,'sha256'),'hex');
SELECT (SELECT pid FROM fr_baseline)=pg_backend_pid() AS same_backend,(SELECT catalog FROM fr_baseline)=pg_temp.fr_catalog() AS catalog_restored,(SELECT graph FROM fr_baseline)=pg_temp.fr_graph() AS graph_restored;
