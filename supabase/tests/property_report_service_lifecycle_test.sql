\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_d0_[a-z0-9_]{6,48}|maiprop_t13_report_[0-9]{8}_[a-z0-9]{4,12})$'
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source','maiprop_d0_20261003_refresh01')
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'rpt13_%')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'rpt13_%')
 THEN RAISE EXCEPTION 'property report suite requires owned disposable socket clone and origin triggers'; END IF;
END $$;
CREATE TEMP TABLE rpt13_baseline AS SELECT pg_backend_pid() pid,current_user db_role,session_user session_role,
 current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') origin,auth.uid() actor,auth.jwt() jwt,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 (SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'))
 FROM pg_proc p WHERE p.oid IN (
 'public.authorize_property_report_generation(uuid)'::regprocedure,
 'public.charge_property_report_fetch_for_user(uuid,uuid,timestamptz)'::regprocedure,
 'public.claim_property_report_generation(uuid,text,uuid,integer)'::regprocedure,
 'public.store_property_report_cache_generation(uuid,text,text,jsonb,jsonb,text,timestamptz,timestamptz)'::regprocedure,
 'public.release_property_report_generation(uuid,text,uuid)'::regprocedure)) hashes;
SELECT 'PRE' phase,* FROM rpt13_baseline;
BEGIN;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SELECT plan(83);
SELECT is(current_setting('session_replication_role'),'origin','fixture and action triggers use origin');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgrelid IN
 ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,'public.addon_purchases'::regclass,
 'public.usage_property_reports'::regclass,'public.property_report_cache'::regclass,
 'private.property_report_generation_leases'::regclass) AND NOT tgisinternal AND tgenabled <> 'O'),0,'no relevant user trigger disabled');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('public.authorize_property_report_generation(uuid)','ec340d6413e617bb9157d0295c5e3890615619494cd7aa7338cfe519d1cee703'),
 ('public.charge_property_report_fetch_for_user(uuid,uuid,timestamptz)','6c9c4d91431f6c49c9da28d5972ed3b0ca277828511075c4f713f2cedf65852f'),
 ('public.claim_property_report_generation(uuid,text,uuid,integer)','6d87b41fc58b0f535f18719356b980384e9b37cad22fde909e18ba8c4645ef94'),
 ('public.store_property_report_cache_generation(uuid,text,text,jsonb,jsonb,text,timestamptz,timestamptz)','73a8ddd54ed869790833fe1fe5a49ccccc2e7b40b44d003b2c70c3f83984e3d7'),
 ('public.release_property_report_generation(uuid,text,uuid)','3076e7edf3bba8c0768e1e7af0cd319e6f924b8b36c4f0c4033df8a9a8089259')) x(sig,sha)),
 'five installed report bodies match accepted hashes');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('private.authoritative_role(uuid)','3d9aa1bd94c46f94fedf8e876904c66e4d8ab4ecff13180421ad1d84d24b9a3d'),
 ('public.is_pro(uuid)','0c23c93f8ec994c7bf6aa2393f09c3ba87a0cad5648e40aed9c66b6012f9ddc5'),
 ('public.get_available_addon_credits(uuid,text)','430adaa2ee4075d77da76dcc0e13b1082731c6bbafac0843bd4ec7d7e9e78898'),
 ('public.consume_addon_credit_for_user(uuid,text)','d6065caab4e39399a6116772c581d83e120b132f1f61bb59079dbf230926b5b5'),
 ('public.get_addon_credit_balance(uuid,text)','f30decb68912a0170b0f2e5a42df452957b5bd324e51ecebfd78c10025c9615f'),
 ('public.addon_credit_bucket(text)','e16a307eb097a347a022c4c6f209965d8fabc39abe21cbc675758b3531d5f12e'),
 ('public.current_billing_runtime_mode()','c6fe7fbb91891586bca0ee1f2290a9e87b767d40ca8f9b4c3eb3dda1272ed940')) x(sig,sha)),
 'seven entitlement and credit dependencies match installed bodies');
SELECT ok(has_function_privilege('service_role','public.get_addon_credit_balance(uuid,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.get_addon_credit_balance(uuid,text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.get_addon_credit_balance(uuid,text)','EXECUTE')
 AND NOT has_function_privilege('public','public.get_addon_credit_balance(uuid,text)','EXECUTE')
 AND has_function_privilege('service_role','public.addon_credit_bucket(text)','EXECUTE')
 AND has_function_privilege('authenticated','public.addon_credit_bucket(text)','EXECUTE')
 AND NOT has_function_privilege('anon','public.addon_credit_bucket(text)','EXECUTE')
 AND NOT has_function_privilege('public','public.addon_credit_bucket(text)','EXECUTE'),
 'credit balance service-only and bucket service/authenticated effective EXECUTE match installed ACLs');
SELECT is((SELECT encode(digest(jsonb_agg(to_jsonb(p) ORDER BY schemaname,tablename,policyname)::text,'sha256'),'hex')
 FROM pg_policies p WHERE schemaname='public' AND tablename IN
 ('profiles','listings','addon_purchases','usage_property_reports','property_report_cache')),
 '6444f758f0a359d94e24a9930a41e2e4b948d158200c0b31697d6acad8f1fb99',
 'relevant public RLS policies match installed set');
SELECT is((SELECT encode(digest(jsonb_agg(jsonb_build_object('schema',n.nspname,'table',c.relname,
 'acl',c.relacl::text,'rls',c.relrowsecurity,'force',c.relforcerowsecurity)
 ORDER BY n.nspname,c.relname)::text,'sha256'),'hex') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE (n.nspname='public' AND c.relname IN ('profiles','listings','addon_purchases','usage_property_reports','property_report_cache'))
 OR (n.nspname='private' AND c.relname='property_report_generation_leases')),
 '06abd959b71da3e32776dabbaf13cd543d9494a51943fa273ccdbbe0587c0c15',
 'table ACL and RLS flags match installed set');
-- This digest binds trigger attachments and enablement, not trigger function
-- bodies. Their observed fixture side effects are asserted below.
SELECT is((SELECT encode(digest(jsonb_agg(jsonb_build_object('table',n.nspname||'.'||c.relname,
 'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid))
 ORDER BY n.nspname,c.relname,t.tgname)::text,'sha256'),'hex') FROM pg_trigger t
 JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE NOT t.tgisinternal AND ((n.nspname='public' AND c.relname IN
 ('profiles','listings','addon_purchases','usage_property_reports','property_report_cache'))
 OR (n.nspname='private' AND c.relname='property_report_generation_leases')
 OR (n.nspname='auth' AND c.relname='users'))),
 'b7fedcf251f693dc0e4c4d64bc1e0f1fb6c4d1fc9a61b75aee48e05656bb6881',
 'relevant normal-trigger attachments match installed set');
SELECT ok((SELECT bool_and(has_function_privilege('service_role',sig,'EXECUTE')
 AND NOT has_function_privilege('authenticated',sig,'EXECUTE')
 AND NOT has_function_privilege('anon',sig,'EXECUTE')
 AND NOT has_function_privilege('public',sig,'EXECUTE'))
 FROM (VALUES ('public.authorize_property_report_generation(uuid)'),
 ('public.charge_property_report_fetch_for_user(uuid,uuid,timestamptz)'),
 ('public.claim_property_report_generation(uuid,text,uuid,integer)'),
 ('public.store_property_report_cache_generation(uuid,text,text,jsonb,jsonb,text,timestamptz,timestamptz)'),
 ('public.release_property_report_generation(uuid,text,uuid)')) x(sig)),
 'all five effective EXECUTE grants are service only');
SELECT ok(NOT has_table_privilege('authenticated','private.property_report_generation_leases','SELECT')
 AND NOT has_table_privilege('anon','private.property_report_generation_leases','SELECT'),
 'browser roles cannot read private leases');
SELECT is(public.current_billing_runtime_mode(),'live','fixture matches current billing runtime');

-- Privileged seed, with every normal trigger left active. Owner authentication
-- trigger produces profiles; onboarding uses the supported service RPC.
INSERT INTO auth.users(id,email) VALUES
 ('d7130001-0000-4000-8000-000000000001','rpt13-owner@example.test'),
 ('d7130001-0000-4000-8000-000000000002','rpt13-pro@example.test'),
 ('d7130001-0000-4000-8000-000000000003','rpt13-free@example.test'),
 ('d7130001-0000-4000-8000-000000000004','rpt13-addon@example.test'),
 ('d7130001-0000-4000-8000-000000000005','rpt13-second@example.test'),
 ('d7130001-0000-4000-8000-000000000006','rpt13-limited@example.test');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user(('d7130001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 (CASE WHEN n=1 THEN 'seller' ELSE 'buyer' END)::public.user_role,CASE WHEN n=1 THEN 'seller' ELSE 'buyer' END)
 FROM generate_series(1,6) n;
RESET ROLE;
UPDATE public.profiles SET force_pro_access=true WHERE user_id IN
 ('d7130001-0000-4000-8000-000000000002','d7130001-0000-4000-8000-000000000005',
 'd7130001-0000-4000-8000-000000000006');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,status)
 VALUES ('d7130002-0000-4000-8000-000000000001','d7130001-0000-4000-8000-000000000001',
 'Report lifecycle home','Athens',250000,80,'apartment','active');
INSERT INTO public.addon_purchases(id,user_id,addon_key,module,audience,unit,quantity,checkout_mode,status,stripe_session_id,runtime_mode,livemode)
 VALUES ('d7130003-0000-4000-8000-000000000001','d7130001-0000-4000-8000-000000000004',
 'property_report_single','property_report','participant','credit',1,'payment','paid','cs_rpt13_addon',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
INSERT INTO public.usage_property_reports(id,user_id,listing_id)
 SELECT ('d7130005-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'd7130001-0000-4000-8000-000000000006',NULL FROM generate_series(1,3) n;

CREATE FUNCTION pg_temp.rpt13_graph() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,private,auth,pg_temp AS $$
 SELECT jsonb_build_object(
 'auth',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM auth.users a WHERE id::text LIKE 'd7130001-%'),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p WHERE user_id::text LIKE 'd7130001-%'),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p WHERE user_id::text LIKE 'd7130001-%'),
 'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(l)),'{}'::jsonb) FROM public.listings l WHERE id::text LIKE 'd7130002-%'),
 'purchases',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(p)),'{}'::jsonb) FROM public.addon_purchases p WHERE user_id::text LIKE 'd7130001-%'),
 'usage',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM public.usage_property_reports u WHERE user_id::text LIKE 'd7130001-%'),
 'cache',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(c)),'{}'::jsonb) FROM public.property_report_cache c WHERE listing_id::text LIKE 'd7130002-%'),
 'leases',(SELECT coalesce(jsonb_object_agg((listing_id::text||':'||report_type||':'||lang),to_jsonb(g)),'{}'::jsonb)
 FROM private.property_report_generation_leases g WHERE listing_id::text LIKE 'd7130002-%'))
$$;
CREATE TEMP TABLE rpt13_snap(label text PRIMARY KEY, graph jsonb);
CREATE TEMP TABLE rpt13_receipt(label text PRIMARY KEY, result jsonb);
CREATE FUNCTION pg_temp.rpt13_expected(p_before jsonb,p_lease boolean,p_cache boolean,p_pro boolean,p_addon boolean,p_second boolean)
RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH ids AS (SELECT
 'd7130002-0000-4000-8000-000000000001'::uuid listing,
 'd7130004-0000-4000-8000-000000000001'::uuid holder,
 'd7130003-0000-4000-8000-000000000001'::uuid purchase,
 (SELECT (result->>'id')::uuid FROM rpt13_receipt WHERE label='cache') cache_id,
 (SELECT (result->>'usage_id')::uuid FROM rpt13_receipt WHERE label='pro-charge') pro_id,
 (SELECT (result->>'usage_id')::uuid FROM rpt13_receipt WHERE label='addon-charge') addon_id,
 (SELECT (result->>'usage_id')::uuid FROM rpt13_receipt WHERE label='second-charge') second_id)
 SELECT jsonb_build_object(
 'auth',p_before->'auth','profiles',p_before->'profiles','profiles_public',p_before->'profiles_public',
 'listings',p_before->'listings',
 'purchases',CASE WHEN p_addon THEN jsonb_set(p_before->'purchases',ARRAY[purchase::text],
 jsonb_set(jsonb_set(p_before->'purchases'->purchase::text,'{credits_consumed}','1'::jsonb),'{updated_at}',to_jsonb(now())))
 ELSE p_before->'purchases' END,
 'leases',CASE WHEN p_lease THEN p_before->'leases'||jsonb_build_object(listing::text||':valuation:en',
 jsonb_build_object('listing_id',listing,'report_type','valuation','lang','en','holder',holder,
 'lease_until',now()+interval '45 seconds','created_at',now(),'updated_at',now())) ELSE p_before->'leases' END,
 'cache',CASE WHEN p_cache THEN p_before->'cache'||jsonb_build_object(cache_id::text,
 jsonb_build_object('id',cache_id,'listing_id',listing,'report_type','valuation','lang','en','source','os',
 'html','<p>synthetic provider payload</p>','ai','{"score":1}'::jsonb,'features','{"bedrooms":2}'::jsonb,
 'file_name','rpt13.html','generated_at',now()-interval '1 second','expires_at',now()+interval '1 day',
 'created_at',now(),'updated_at',now())) ELSE p_before->'cache' END,
 'usage',p_before->'usage'
 ||CASE WHEN p_pro THEN jsonb_build_object(pro_id::text,jsonb_build_object('id',pro_id,
 'user_id','d7130001-0000-4000-8000-000000000002'::uuid,'listing_id',listing,'created_at',now())) ELSE '{}'::jsonb END
 ||CASE WHEN p_addon THEN jsonb_build_object(addon_id::text,jsonb_build_object('id',addon_id,
 'user_id','d7130001-0000-4000-8000-000000000004'::uuid,'listing_id',listing,'created_at',now())) ELSE '{}'::jsonb END
 ||CASE WHEN p_second THEN jsonb_build_object(second_id::text,jsonb_build_object('id',second_id,
 'user_id','d7130001-0000-4000-8000-000000000005'::uuid,'listing_id',listing,'created_at',now())) ELSE '{}'::jsonb END)
 FROM ids
$$;
GRANT INSERT,SELECT ON rpt13_receipt TO service_role;
GRANT SELECT ON rpt13_snap TO service_role,authenticated,anon;
GRANT EXECUTE ON FUNCTION pg_temp.rpt13_graph() TO service_role,authenticated,anon;
INSERT INTO rpt13_snap VALUES('seed',pg_temp.rpt13_graph());
SELECT is((SELECT count(*)::integer FROM public.addon_purchases WHERE id='d7130003-0000-4000-8000-000000000001' AND credits_granted=1 AND credits_consumed=0),1,
 'normal purchase trigger grants one unconsumed report credit');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id::text LIKE 'd7130001-%' AND role IN ('buyer','seller')),6,
 'normal onboarding created six authoritative participant roles');
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'business service calls have no JWT subject');
SELECT is(public.authorize_property_report_generation('d7130001-0000-4000-8000-000000000002'),
 jsonb_build_object('allowed',true,'source','included','remaining_base',3),
 'Pro included authorization returns complete admission record');
SELECT throws_ok($sql$SELECT public.authorize_property_report_generation('d7130001-0000-4000-8000-000000000003')$sql$,
 'P0001','report_not_allowed','free user without add-on rejected at authorization');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'free authorization denial changes no graph node');
SELECT is(public.authorize_property_report_generation('d7130001-0000-4000-8000-000000000004'),
 jsonb_build_object('allowed',true,'source','addon','available_addon_credits',1),
 'valid paid add-on authorization returns complete admission record');
SELECT throws_ok($sql$SELECT public.authorize_property_report_generation(NULL)$sql$,'22023','report_user_id_required','null actor fails validation');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'null authorization denial changes no graph node');
SELECT throws_ok($sql$SELECT public.authorize_property_report_generation('d7130001-0000-4000-8000-000000000006')$sql$,
 'P0001','report_monthly_limit_reached','Pro user with three seeded monthly usages denied before work');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'monthly authorization denial changes no graph node');
RESET ROLE;
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'all admission and null denials preserve complete seed graph');
SET LOCAL ROLE authenticated;
SELECT throws_ok($sql$SELECT public.authorize_property_report_generation('d7130001-0000-4000-8000-000000000002')$sql$,
 '42501','permission denied for function authorize_property_report_generation','browser authorization call denied at EXECUTE');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'browser authorization denial changes no graph node');
SELECT throws_ok($sql$SELECT public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000001',45)$sql$,
 '42501','permission denied for function claim_property_report_generation','browser lease call denied at EXECUTE');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'browser lease denial changes no graph node');
SELECT throws_ok($sql$SELECT public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000002','d7130002-0000-4000-8000-000000000001',now())$sql$,
 '42501','permission denied for function charge_property_report_fetch_for_user','browser charge call denied at EXECUTE');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'browser charge denial changes no graph node');
SELECT throws_ok($sql$SELECT public.store_property_report_cache_generation('d7130002-0000-4000-8000-000000000001','en','x','{}','{}','x',now(),now()+interval '1 day')$sql$,
 '42501','permission denied for function store_property_report_cache_generation','browser cache call denied at EXECUTE');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'browser cache denial changes no graph node');
SELECT throws_ok($sql$SELECT public.release_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000001')$sql$,
 '42501','permission denied for function release_property_report_generation','browser release call denied at EXECUTE');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'browser release denial changes no graph node');
RESET ROLE;
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='seed'),'all browser denials preserve full graph');

SET LOCAL ROLE service_role;
SELECT is(public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000001',45),true,'first service holder acquires lease');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.property_report_generation_leases WHERE listing_id='d7130002-0000-4000-8000-000000000001' AND holder='d7130004-0000-4000-8000-000000000001' AND lang='en' AND report_type='valuation'),1,'exact lease identity persisted');
SELECT is(pg_temp.rpt13_graph(),pg_temp.rpt13_expected((SELECT graph FROM rpt13_snap WHERE label='seed'),true,false,false,false,false),
 'first claim produces complete prestate-derived lease graph');
INSERT INTO rpt13_snap VALUES('lease',pg_temp.rpt13_graph());
SET LOCAL ROLE service_role;
SELECT is(public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000002',45),false,'competing holder declined');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'competing holder no-op preserves graph');
SELECT is(public.release_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000002'),false,'other holder cannot release live lease');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'other holder release no-op preserves graph');
SELECT throws_ok($sql$SELECT public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','fr','d7130004-0000-4000-8000-000000000001',45)$sql$,'22023','invalid_property_report_generation_lease','invalid language denied');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'invalid lease language preserves graph');
SELECT throws_ok($sql$SELECT public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','en',NULL,45)$sql$,'22023','invalid_property_report_generation_lease','null holder denied');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'null holder preserves graph');
SELECT throws_ok($sql$SELECT public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000001',4)$sql$,'22023','invalid_property_report_generation_lease','short lease denied');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'invalid lease duration preserves graph');
SELECT throws_ok($sql$SELECT public.store_property_report_cache_generation('d7130002-0000-4000-8000-000000000001','fr','x','{}','{}','x',now(),now()+interval '1 day')$sql$,'22023','invalid_property_report_cache_payload','invalid cache language denied');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'invalid cache language preserves graph');
SELECT throws_ok($sql$SELECT public.store_property_report_cache_generation('d7130002-0000-4000-8000-000000000001','en',NULL,'{}','{}','x',now(),now()+interval '1 day')$sql$,'22023','invalid_property_report_cache_payload','null cache HTML denied');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'null cache HTML preserves graph');
RESET ROLE;
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='lease'),'competing claim, wrong release, invalid lease/cache inputs preserve full graph');
SET LOCAL ROLE service_role;
SELECT is(public.claim_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000001',45),true,'same holder renews lease');
INSERT INTO rpt13_receipt(label,result)
 SELECT 'cache',to_jsonb(public.store_property_report_cache_generation('d7130002-0000-4000-8000-000000000001','en',
 '<p>synthetic provider payload</p>','{"score":1}'::jsonb,'{"bedrooms":2}'::jsonb,'rpt13.html',
 now()-interval '1 second',now()+interval '1 day'));
INSERT INTO rpt13_receipt(label,result)
 SELECT 'pro-charge',public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000002',
 'd7130002-0000-4000-8000-000000000001',(SELECT (result->>'generated_at')::timestamptz FROM rpt13_receipt WHERE label='cache'));
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM public.property_report_cache WHERE listing_id='d7130002-0000-4000-8000-000000000001' AND report_type='valuation' AND lang='en' AND source='os' AND html='<p>synthetic provider payload</p>' AND ai='{"score":1}' AND features='{"bedrooms":2}' AND file_name='rpt13.html'),1,'one exact synthetic cache row stored');
SELECT is((SELECT result FROM rpt13_receipt WHERE label='cache'),
 pg_temp.rpt13_expected((SELECT graph FROM rpt13_snap WHERE label='seed'),true,true,false,false,false)
 ->'cache'->(SELECT result->>'id' FROM rpt13_receipt WHERE label='cache'),
 'returned cache record matches every independently modeled field');
SELECT is((SELECT count(*)::integer FROM public.usage_property_reports WHERE user_id='d7130001-0000-4000-8000-000000000002' AND listing_id='d7130002-0000-4000-8000-000000000001'),1,'one exact Pro usage row stored');
SELECT is((SELECT result->>'usage_id' FROM rpt13_receipt WHERE label='pro-charge'),(SELECT id::text FROM public.usage_property_reports WHERE user_id='d7130001-0000-4000-8000-000000000002'),'Pro charge receipt identifies persisted usage');
SELECT is((SELECT result - 'usage_id' FROM rpt13_receipt WHERE label='pro-charge'),' {"charged":true,"alreadyPaid":false,"addon_credit_consumed":false}'::jsonb,'Pro charge fields show included allowance');
SELECT is(pg_temp.rpt13_graph(),pg_temp.rpt13_expected((SELECT graph FROM rpt13_snap WHERE label='seed'),true,true,true,false,false),
 'cache publication and Pro charge produce full expected graph');
INSERT INTO rpt13_snap VALUES('pro-charged',pg_temp.rpt13_graph());
SET LOCAL ROLE service_role;
INSERT INTO rpt13_receipt(label,result) SELECT 'pro-repeat',public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000002',
 'd7130002-0000-4000-8000-000000000001',(SELECT (result->>'generated_at')::timestamptz FROM rpt13_receipt WHERE label='cache'));
RESET ROLE;
SELECT is((SELECT result FROM rpt13_receipt WHERE label='pro-repeat'),
 jsonb_build_object('charged',false,'alreadyPaid',true,'usage_id',(SELECT (result->>'usage_id')::uuid FROM rpt13_receipt WHERE label='pro-charge'),'addon_credit_consumed',false),
 'repeat returns same usage identity and no debit');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='pro-charged'),'repeat charge preserves entire graph');
SET LOCAL ROLE service_role;
INSERT INTO rpt13_receipt(label,result) SELECT 'pro-stale-identity',public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000002',
 'd7130002-0000-4000-8000-000000000001',now()-interval '1 year');
RESET ROLE;
SELECT is((SELECT result FROM rpt13_receipt WHERE label='pro-stale-identity'),(SELECT result FROM rpt13_receipt WHERE label='pro-repeat'),
 'older supplied generation is idempotent under installed usage-created-at comparison');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='pro-charged'),'older supplied generation has no SQL cache lookup or state mutation');
SET LOCAL ROLE service_role;
INSERT INTO rpt13_receipt(label,result) SELECT 'addon-charge',public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000004',
 'd7130002-0000-4000-8000-000000000001',(SELECT (result->>'generated_at')::timestamptz FROM rpt13_receipt WHERE label='cache'));
RESET ROLE;
SELECT is((SELECT result - 'usage_id' FROM rpt13_receipt WHERE label='addon-charge'),' {"charged":true,"alreadyPaid":false,"addon_credit_consumed":true}'::jsonb,'add-on actor independently charged and debited');
SELECT is((SELECT count(*)::integer FROM public.usage_property_reports WHERE user_id='d7130001-0000-4000-8000-000000000004' AND listing_id='d7130002-0000-4000-8000-000000000001'),1,'one independent add-on usage row');
SELECT is((SELECT credits_consumed FROM public.addon_purchases WHERE id='d7130003-0000-4000-8000-000000000001'),1,'one exact add-on credit consumed');
SELECT is(pg_temp.rpt13_graph(),pg_temp.rpt13_expected((SELECT graph FROM rpt13_snap WHERE label='seed'),true,true,true,true,false),
 'add-on charge changes only one full usage row and one purchase debit in expected graph');
INSERT INTO rpt13_snap VALUES('addon-exhausted',pg_temp.rpt13_graph());
SET LOCAL ROLE service_role;
SELECT throws_ok($sql$SELECT public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000004','d7130002-0000-4000-8000-000000000001',now()+interval '1 second')$sql$,
 'P0001','report_not_allowed','exhausted add-on blocks a new generation charge');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='addon-exhausted'),'exhausted add-on denial preserves graph');
SELECT throws_ok($sql$SELECT public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000003','d7130002-0000-4000-8000-000000000001',now())$sql$,
 'P0001','report_not_allowed','free actor has no charge entitlement');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='addon-exhausted'),'free charge denial preserves graph');
SELECT throws_ok($sql$SELECT public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000006','d7130002-0000-4000-8000-000000000001',now())$sql$,
 'P0001','report_monthly_limit_reached','monthly included limit blocks new usage without debit');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='addon-exhausted'),'monthly charge denial preserves graph');
SELECT throws_ok($sql$SELECT public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000002','d7130002-0000-4000-8000-000000000001',NULL)$sql$,
 '22023','report_cache_identity_incomplete','incomplete cache identity denied');
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='addon-exhausted'),'incomplete identity denial preserves graph');
RESET ROLE;
SELECT is(pg_temp.rpt13_graph(),(SELECT graph FROM rpt13_snap WHERE label='addon-exhausted'),'exhaustion and incomplete identity preserve full graph');
SET LOCAL ROLE service_role;
INSERT INTO rpt13_receipt(label,result) SELECT 'second-charge',public.charge_property_report_fetch_for_user('d7130001-0000-4000-8000-000000000005',
 'd7130002-0000-4000-8000-000000000001',(SELECT (result->>'generated_at')::timestamptz FROM rpt13_receipt WHERE label='cache'));
RESET ROLE;
SELECT is((SELECT result - 'usage_id' FROM rpt13_receipt WHERE label='second-charge'),' {"charged":true,"alreadyPaid":false,"addon_credit_consumed":false}'::jsonb,'second eligible user independently uses own allowance');
SELECT is((SELECT count(*)::integer FROM public.usage_property_reports WHERE listing_id='d7130002-0000-4000-8000-000000000001'),3,'three eligible actors have exactly three usage rows');
SELECT is(pg_temp.rpt13_graph(),pg_temp.rpt13_expected((SELECT graph FROM rpt13_snap WHERE label='seed'),true,true,true,true,true),
 'second eligible actor adds exactly one full usage row to prestate-derived graph');
SET LOCAL ROLE service_role;
SELECT is(public.release_property_report_generation('d7130002-0000-4000-8000-000000000001','en','d7130004-0000-4000-8000-000000000001'),true,'holder releases lease');
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM private.property_report_generation_leases WHERE listing_id='d7130002-0000-4000-8000-000000000001'),0,'lease removed');
SELECT is((SELECT count(*)::integer FROM public.property_report_cache WHERE listing_id='d7130002-0000-4000-8000-000000000001'),1,'one cache generation remains');
SELECT is(pg_temp.rpt13_graph(),pg_temp.rpt13_expected((SELECT graph FROM rpt13_snap WHERE label='seed'),false,true,true,true,true),
 'release removes only lease from complete expected final graph');
SELECT * FROM finish();
ROLLBACK;
\echo REPORT_ROLLBACK_COMPLETE
SELECT 'POST' phase,pg_backend_pid(),current_user,session_user,current_setting('maiprop.test_disposable_database',true),
 current_setting('session_replication_role'),auth.uid(),auth.jwt(),
 current_setting('request.jwt.claim.sub',true),current_setting('request.jwt.claims',true),current_setting('request.jwt.claim.role',true);
DO $$ DECLARE b record; h jsonb; BEGIN
 SELECT * INTO STRICT b FROM rpt13_baseline;
 SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')) INTO h
 FROM pg_proc p WHERE p.oid IN ('public.authorize_property_report_generation(uuid)'::regprocedure,
 'public.charge_property_report_fetch_for_user(uuid,uuid,timestamptz)'::regprocedure,
 'public.claim_property_report_generation(uuid,text,uuid,integer)'::regprocedure,
 'public.store_property_report_cache_generation(uuid,text,text,jsonb,jsonb,text,timestamptz,timestamptz)'::regprocedure,
 'public.release_property_report_generation(uuid,text,uuid)'::regprocedure);
 IF b.pid IS DISTINCT FROM pg_backend_pid() OR b.db_role IS DISTINCT FROM current_user
 OR b.session_role IS DISTINCT FROM session_user OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.origin IS DISTINCT FROM current_setting('session_replication_role') OR b.actor IS DISTINCT FROM auth.uid()
 OR b.jwt IS DISTINCT FROM auth.jwt() OR nullif(b.sub_claim,'') IS DISTINCT FROM nullif(current_setting('request.jwt.claim.sub',true),'')
 OR nullif(b.claims,'') IS DISTINCT FROM nullif(current_setting('request.jwt.claims',true),'')
 OR nullif(b.role_claim,'') IS DISTINCT FROM nullif(current_setting('request.jwt.claim.role',true),'') OR b.hashes IS DISTINCT FROM h
 THEN RAISE EXCEPTION 'property report same-backend baseline changed'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'rpt13_%' AND relname<>'rpt13_baseline')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'rpt13_%')
 OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd7130001-%')
 OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'd7130001-%')
 OR EXISTS (SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'd7130001-%')
 OR EXISTS (SELECT 1 FROM public.listings WHERE id::text LIKE 'd7130002-%')
 OR EXISTS (SELECT 1 FROM public.addon_purchases WHERE user_id::text LIKE 'd7130001-%')
 OR EXISTS (SELECT 1 FROM public.usage_property_reports WHERE user_id::text LIKE 'd7130001-%')
 OR EXISTS (SELECT 1 FROM public.property_report_cache WHERE listing_id::text LIKE 'd7130002-%')
 OR EXISTS (SELECT 1 FROM private.property_report_generation_leases WHERE listing_id::text LIKE 'd7130002-%')
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 THEN RAISE EXCEPTION 'property report suite residue'; END IF;
END $$;
DROP TABLE rpt13_baseline;
SELECT 'REPORT_LIFECYCLE_SAME_BACKEND_CLEAN' result;
