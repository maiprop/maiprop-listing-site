\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_t13_active_[a-z0-9_]+|maiprop_d0_[a-z0-9_]{6,48})$'
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('session_replication_role')<>'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'a1320001-%')
 OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='kr@maiprop.co')
 THEN RAISE EXCEPTION 'owned clean origin clone without duplicate owner required'; END IF;
END $$;
CREATE FUNCTION pg_temp.a13cd_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
 'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.investor_subscriptions x),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x))
$$;
CREATE FUNCTION pg_temp.a13cd_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH tables AS (SELECT unnest(ARRAY['auth.users','public.profiles','public.profiles_public',
 'public.investor_subscriptions','public.notifications'])::regclass oid),
 named AS (SELECT to_regprocedure(sig) oid FROM (VALUES
 ('auth.uid()'),('auth.jwt()'),('auth.role()'),
 ('public.has_platform_admin(uuid)'),('public.authoritative_role(uuid)'),
 ('public.complete_onboarding_role_for_user(uuid,public.user_role,text,text,text,text)'),
 ('public.admin_broadcast_notification_for_user(uuid,text,text,text,text,text)'),
 ('public.grant_platform_admin_by_email_for_caller(uuid,text)'),
 ('private.insert_interaction_notification(uuid,uuid,text,text,text,text)')) v(sig)),
 funcs AS (SELECT oid FROM named UNION SELECT tgfoid FROM pg_trigger t JOIN tables x ON x.oid=t.tgrelid
 WHERE NOT t.tgisinternal)
 SELECT jsonb_build_object(
 'functions',(SELECT jsonb_agg(jsonb_build_object('sig',p.oid::regprocedure::text,
  'body',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(proowner),'definer',prosecdef,'config',proconfig,'raw_acl',proacl,
  'effective_acl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantee,privilege_type)
   FROM aclexplode(coalesce(proacl,acldefault('f',proowner))) a)) ORDER BY p.oid::regprocedure::text)
  FROM pg_proc p JOIN funcs f ON f.oid=p.oid),
 'tables',(SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'owner',pg_get_userbyid(relowner),
  'acl',relacl,'rls',relrowsecurity,'force_rls',relforcerowsecurity,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),
   'nullable',NOT attnotnull,'default',pg_get_expr(adbin,adrelid),'generated',attgenerated) ORDER BY attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND attnum>0 AND NOT attisdropped)) ORDER BY c.oid::regclass::text)
   FROM pg_class c JOIN tables x ON x.oid=c.oid),
 'constraints',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,
  'def',pg_get_constraintdef(oid,true)) ORDER BY conrelid::regclass::text,conname),'[]'::jsonb)
  FROM pg_constraint WHERE conrelid IN (SELECT oid FROM tables)),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',polrelid::regclass::text,'name',polname,
  'roles',polroles,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid))
  ORDER BY polrelid::regclass::text,polname),'[]'::jsonb) FROM pg_policy WHERE polrelid IN (SELECT oid FROM tables)),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,
  'name',tgname,'enabled',tgenabled,'def',pg_get_triggerdef(oid,true))
  ORDER BY tgrelid::regclass::text,tgname),'[]'::jsonb)
  FROM pg_trigger WHERE tgrelid IN (SELECT oid FROM tables) AND NOT tgisinternal),
 'indexes',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',indexname,'def',indexdef)
  ORDER BY indexname),'[]'::jsonb) FROM pg_indexes WHERE schemaname='public' AND tablename='profiles'),
 'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r,'public_schema',has_schema_privilege(r,'public','USAGE'),
  'private_schema',has_schema_privilege(r,'private','USAGE'),
  'broadcast',has_function_privilege(r,'public.admin_broadcast_notification_for_user(uuid,text,text,text,text,text)','EXECUTE'),
  'transfer',has_function_privilege(r,'public.grant_platform_admin_by_email_for_caller(uuid,text)','EXECUTE'),
  'profiles_update',has_table_privilege(r,'public.profiles','UPDATE'),
  'notifications_insert',has_table_privilege(r,'public.notifications','INSERT')) ORDER BY r)
  FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) roles(r)))
$$;
CREATE TEMP TABLE a13cd_pre AS SELECT pg_backend_pid() pid,pg_temp.a13cd_graph() graph,
 pg_temp.a13cd_catalog() catalog;
SELECT 'A13CD_PRE',pid,encode(digest(graph::text,'sha256'),'hex'),
 encode(digest(catalog::text,'sha256'),'hex') FROM a13cd_pre;
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT plan(27);
SELECT is(current_setting('session_replication_role'),'origin','normal trigger mode');
SELECT is((SELECT v->>'body' FROM a13cd_pre,jsonb_array_elements(catalog->'functions') v
 WHERE v->>'sig'='admin_broadcast_notification_for_user(uuid,text,text,text,text,text)'),
 'c707340c866be33809d0f18a8262e2dead857277b32bbff67c0220d9339cc068',
 'installed broadcast body matches historical unhit identity');
SELECT is((SELECT v->>'body' FROM a13cd_pre,jsonb_array_elements(catalog->'functions') v
 WHERE v->>'sig'='grant_platform_admin_by_email_for_caller(uuid,text)'),
 'b1d9d22aaad2d60e1d637868319886dc71903249f50ae16dad17b06a0115aa36',
 'installed transfer body matches historical unhit identity');
SELECT ok(has_function_privilege('service_role','public.admin_broadcast_notification_for_user(uuid,text,text,text,text,text)','EXECUTE')
 AND has_function_privilege('service_role','public.grant_platform_admin_by_email_for_caller(uuid,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_broadcast_notification_for_user(uuid,text,text,text,text,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.grant_platform_admin_by_email_for_caller(uuid,text)','EXECUTE'),
 'both Edge RPCs are service-only');
SELECT is((SELECT jsonb_array_length(catalog->'indexes') FROM a13cd_pre),
 (SELECT count(*)::int FROM pg_indexes WHERE schemaname='public' AND tablename='profiles'),
 'installed profile index set bound, without assuming removed single-admin index');
INSERT INTO auth.users(id,email) VALUES
 ('a1320001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('a1320001-0000-4000-8000-000000000002','a13-investor@example.test'),
 ('a1320001-0000-4000-8000-000000000003','a13-seller@example.test'),
 ('a1320001-0000-4000-8000-000000000004','a13-buyer@example.test'),
 ('a1320001-0000-4000-8000-000000000005','a13-target@example.test');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='a1320001-0000-4000-8000-000000000001'),
 'admin','canonical owner auth trigger grants authoritative admin');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT ok(public.has_platform_admin('a1320001-0000-4000-8000-000000000001'),
 'normal owner is recognized by installed admin predicate under service context');
SELECT public.complete_onboarding_role_for_user('a1320001-0000-4000-8000-000000000002','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('a1320001-0000-4000-8000-000000000003','seller','seller');
SELECT public.complete_onboarding_role_for_user('a1320001-0000-4000-8000-000000000004','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('a1320001-0000-4000-8000-000000000005','agent','agent');
RESET ROLE;
SELECT ok((SELECT count(*)=4 FROM public.profiles WHERE user_id::text LIKE 'a1320001-%'
 AND role IN ('buyer','seller','agent')),
 'four ordinary profiles onboard through supported service RPC');
-- No normal paid investor fixture is created in this batch. The seller segment
-- still distinguishes its recipient from ordinary buyer, agent, and admin rows.
SELECT ok((SELECT participant_type='seller' AND role='seller'
 FROM public.profiles WHERE user_id='a1320001-0000-4000-8000-000000000003'),
 'normal seller has both role and participant type for audience selection');
SELECT is((SELECT count(*)::int FROM public.investor_subscriptions WHERE user_id::text LIKE 'a1320001-%'),
 0,'fixture does not fabricate paid subscription');
CREATE TEMP TABLE a13cd_before AS SELECT pg_temp.a13cd_graph() graph;
CREATE TEMP TABLE a13cd_outcome(label text,sqlstate text,message text,result jsonb);
GRANT INSERT ON a13cd_outcome TO service_role;
CREATE FUNCTION pg_temp.a13cd_broadcast(label text,actor uuid,segment text) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE n integer;s text;m text;
BEGIN
 BEGIN
  SELECT public.admin_broadcast_notification_for_user(actor,segment,'  News  ','  Body  ','  ','  /offers  ') INTO n;
  INSERT INTO a13cd_outcome VALUES(label,NULL,NULL,to_jsonb(n));
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT;
  INSERT INTO a13cd_outcome VALUES(label,s,m,NULL);
 END;
END $$;
CREATE FUNCTION pg_temp.a13cd_transfer(label text,actor uuid,email text) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE s text;m text;
BEGIN
 BEGIN
  PERFORM public.grant_platform_admin_by_email_for_caller(actor,email);
  INSERT INTO a13cd_outcome VALUES(label,NULL,NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,m=MESSAGE_TEXT;
  INSERT INTO a13cd_outcome VALUES(label,s,m,NULL);
 END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.a13cd_broadcast(text,uuid,text),pg_temp.a13cd_transfer(text,uuid,text) TO service_role;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.a13cd_broadcast('sellers','a1320001-0000-4000-8000-000000000001','sellers');
RESET ROLE;
SELECT is((SELECT result FROM a13cd_outcome WHERE label='sellers'),'1'::jsonb,
 'seller segment returns one recipient from normal onboarding');
SELECT ok((SELECT count(*)=1 AND bool_and(user_id='a1320001-0000-4000-8000-000000000003'
 AND title='News' AND body='Body' AND type='admin_broadcast' AND link='/offers'
 AND read=false AND created_at=transaction_timestamp())
 FROM public.notifications WHERE id::text NOT IN
 (SELECT key FROM a13cd_before,jsonb_object_keys(graph->'notifications') key)),
 'one complete normalized notice to matching seller only');
SELECT ok((SELECT pg_temp.a13cd_graph()->'notifications'=
 jsonb_set(b.graph->'notifications',ARRAY[n.id::text],to_jsonb(n),true)
 FROM a13cd_before b, public.notifications n
 WHERE NOT (b.graph->'notifications' ? n.id::text)),
 'broadcast changes complete notification graph by exactly the one modeled row');
SELECT ok((SELECT (pg_temp.a13cd_graph()-'notifications')=(graph-'notifications')
 FROM a13cd_before),'broadcast preserves full users, profile, projection and subscription graph');
CREATE TEMP TABLE a13cd_after_broadcast AS SELECT pg_temp.a13cd_graph() graph;
SET LOCAL ROLE service_role;
SELECT pg_temp.a13cd_broadcast('nonadmin','a1320001-0000-4000-8000-000000000004','sellers');
SELECT pg_temp.a13cd_broadcast('bad_segment','a1320001-0000-4000-8000-000000000001','bogus');
RESET ROLE;
SELECT is((SELECT string_agg(label||'='||sqlstate||':'||message,',' ORDER BY label)
 FROM a13cd_outcome WHERE label IN ('nonadmin','bad_segment')),
 'bad_segment=P0001:invalid_segment,nonadmin=P0001:forbidden',
 'nonadmin and invalid-segment denials match installed SQLSTATE and message');
SELECT is(pg_temp.a13cd_graph(),(SELECT graph FROM a13cd_after_broadcast),
 'broadcast denials preserve complete graph');
CREATE TEMP TABLE a13cd_before_transfer AS SELECT pg_temp.a13cd_graph() graph;
SET LOCAL ROLE service_role;
SELECT pg_temp.a13cd_transfer('unknown','a1320001-0000-4000-8000-000000000001','absent-a13@example.test');
SELECT pg_temp.a13cd_transfer('nonadmin_transfer','a1320001-0000-4000-8000-000000000004','a13-target@example.test');
RESET ROLE;
SELECT is((SELECT string_agg(label||'='||sqlstate||':'||message,',' ORDER BY label)
 FROM a13cd_outcome WHERE label IN ('unknown','nonadmin_transfer')),
 'nonadmin_transfer=42501:forbidden,unknown=P0001:target_user_not_found',
 'transfer unknown target and nonadmin caller exact denials');
SELECT is(pg_temp.a13cd_graph(),(SELECT graph FROM a13cd_before_transfer),
 'transfer denials preserve complete graph');
SET LOCAL ROLE service_role;
SELECT pg_temp.a13cd_transfer('success','a1320001-0000-4000-8000-000000000001','a13-target@example.test');
RESET ROLE;
SELECT is((SELECT sqlstate FROM a13cd_outcome WHERE label='success'),NULL::text,
 'normal target transfer succeeds');
SELECT ok((SELECT result IS NULL FROM a13cd_outcome WHERE label='success')
 AND (SELECT pg_get_function_result('public.grant_platform_admin_by_email_for_caller(uuid,text)'::regprocedure)='void'),
 'transfer has exact void return');
SELECT ok((SELECT role='agent' FROM public.profiles WHERE user_id='a1320001-0000-4000-8000-000000000001')
 AND (SELECT role='admin' FROM public.profiles WHERE user_id='a1320001-0000-4000-8000-000000000005'),
 'former owner demoted and target promoted');
SELECT ok((SELECT role='agent' FROM public.profiles_public WHERE user_id='a1320001-0000-4000-8000-000000000001')
 AND (SELECT role='admin' FROM public.profiles_public WHERE user_id='a1320001-0000-4000-8000-000000000005'),
 'public profile projections follow role transfer');
SELECT ok((SELECT pg_temp.a13cd_graph()->'profiles' =
 jsonb_set(jsonb_set(b.graph->'profiles',ARRAY['a1320001-0000-4000-8000-000000000001'],
  (b.graph->'profiles'->'a1320001-0000-4000-8000-000000000001')||
   jsonb_build_object('role','agent','updated_at',transaction_timestamp())),
  ARRAY['a1320001-0000-4000-8000-000000000005'],
  (b.graph->'profiles'->'a1320001-0000-4000-8000-000000000005')||
   jsonb_build_object('role','admin','updated_at',transaction_timestamp()))
 AND pg_temp.a13cd_graph()->'profiles_public'=
 jsonb_set(jsonb_set(b.graph->'profiles_public',ARRAY['a1320001-0000-4000-8000-000000000001'],
  (b.graph->'profiles_public'->'a1320001-0000-4000-8000-000000000001')||jsonb_build_object('role','agent')),
  ARRAY['a1320001-0000-4000-8000-000000000005'],
  (b.graph->'profiles_public'->'a1320001-0000-4000-8000-000000000005')||jsonb_build_object('role','admin'))
 FROM a13cd_before_transfer b),
 'complete private and public profile rows differ only by expected role and timestamp');
SELECT ok(NOT public.has_platform_admin('a1320001-0000-4000-8000-000000000001')
 AND public.has_platform_admin('a1320001-0000-4000-8000-000000000005'),
 'former and new authority resolve through installed predicate');
SELECT ok((SELECT (pg_temp.a13cd_graph()-'profiles'-'profiles_public')=
 (graph-'profiles'-'profiles_public') FROM a13cd_before_transfer),
 'transfer leaves auth, subscription and notice graph unchanged');
SELECT is(pg_temp.a13cd_catalog(),(SELECT catalog FROM a13cd_pre),
 'all named/trigger bodies, table metadata, policies, ACL and indexes unchanged');
SELECT is(current_user,'postgres','actual role reset before TAP finish');
SELECT * FROM finish();
ROLLBACK;
DO $$ DECLARE b a13cd_pre%ROWTYPE; BEGIN
 SELECT * INTO b FROM a13cd_pre;
 IF pg_backend_pid()<>b.pid OR current_user<>'postgres'
 OR current_setting('session_replication_role')<>'origin'
 OR pg_temp.a13cd_graph() IS DISTINCT FROM b.graph
 OR pg_temp.a13cd_catalog() IS DISTINCT FROM b.catalog
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'a1320001-%')
 THEN RAISE EXCEPTION 'admin same-backend rollback, identity, catalog or graph drift'; END IF;
END $$;
SELECT 'A13CD_POST',pg_backend_pid(),encode(digest(pg_temp.a13cd_graph()::text,'sha256'),'hex'),
 encode(digest(pg_temp.a13cd_catalog()::text,'sha256'),'hex');
DROP TABLE a13cd_pre;
DROP FUNCTION pg_temp.a13cd_graph();
DROP FUNCTION pg_temp.a13cd_catalog();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema())
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema())
 THEN RAISE EXCEPTION 'admin temporary residue'; END IF;
END $$;
