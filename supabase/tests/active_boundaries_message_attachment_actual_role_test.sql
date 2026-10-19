\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^maiprop_t13_active_[a-z0-9_]+$'
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user<>'postgres' OR session_user<>'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('session_replication_role')<>'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())<>'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'a1310001-%')
 THEN RAISE EXCEPTION 'owned clean origin clone required for message batch'; END IF;
END $$;
CREATE FUNCTION pg_temp.a13a_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
 'conversations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.conversations x),
 'leads',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.leads x),
 'messages',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.messages x),
 'attachments',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.message_attachments x),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x))
$$;
CREATE FUNCTION pg_temp.a13a_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH tables AS (SELECT unnest(ARRAY['auth.users','public.profiles','public.profiles_public',
 'public.conversations','public.leads','public.messages','public.message_attachments','public.notifications'])::regclass oid),
 named AS (SELECT to_regprocedure(sig) oid FROM (VALUES
 ('auth.uid()'),('auth.jwt()'),
 ('public.complete_onboarding_role_for_user(uuid,public.user_role,text,text,text,text)'),
 ('public.send_message_with_attachments(uuid,text,uuid,jsonb)'),
 ('private.send_message_with_attachments_for_actor(uuid,text,uuid,jsonb)'),
 ('private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamptz)')) v(sig)),
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
 'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r,'public_schema',has_schema_privilege(r,'public','USAGE'),
  'private_schema',has_schema_privilege(r,'private','USAGE'),
  'public_send',has_function_privilege(r,'public.send_message_with_attachments(uuid,text,uuid,jsonb)','EXECUTE'),
  'private_send',has_function_privilege(r,'private.send_message_with_attachments_for_actor(uuid,text,uuid,jsonb)','EXECUTE'),
  'message_insert',has_table_privilege(r,'public.messages','INSERT'),
  'attachment_insert',has_table_privilege(r,'public.message_attachments','INSERT')) ORDER BY r)
  FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) roles(r)))
$$;
CREATE TEMP TABLE a13a_pre AS SELECT pg_backend_pid() pid,pg_temp.a13a_graph() graph,
 pg_temp.a13a_catalog() catalog;
SELECT 'A13A_PRE',pid,encode(digest(graph::text,'sha256'),'hex'),
 encode(digest(catalog::text,'sha256'),'hex') FROM a13a_pre;
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT plan(20);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers active');
SELECT ok((SELECT count(*)=2 AND bool_and(body IS NOT NULL AND p IS NOT NULL) FROM
 (SELECT (v->>'body') body,(v->>'sig') p FROM a13a_pre,
 jsonb_array_elements(catalog->'functions') v
 WHERE v->>'sig' IN ('send_message_with_attachments(uuid,text,uuid,jsonb)',
 'private.send_message_with_attachments_for_actor(uuid,text,uuid,jsonb)')) s),
 'public and private delivery definitions bound');
SELECT is((SELECT v->>'body' FROM a13a_pre,jsonb_array_elements(catalog->'functions') v
 WHERE v->>'sig'='private.send_message_with_attachments_for_actor(uuid,text,uuid,jsonb)'),
 '4078e5bdaf2dd77670629a7e782214130d80a4130ddaed225d60f0d024a96879',
 'installed private delivery body matches source');
SELECT ok(has_function_privilege('authenticated','public.send_message_with_attachments(uuid,text,uuid,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.send_message_with_attachments(uuid,text,uuid,jsonb)','EXECUTE')
 AND NOT has_table_privilege('authenticated','public.messages','INSERT')
 AND NOT has_table_privilege('authenticated','public.message_attachments','INSERT'),
 'participant RPC is executable but direct writes are denied');
INSERT INTO auth.users(id,email) VALUES
 ('a1310001-0000-4000-8000-000000000001','a13-attachment-buyer@example.test'),
 ('a1310001-0000-4000-8000-000000000002','a13-attachment-seller@example.test');
SELECT ok((SELECT count(*)=2 FROM public.profiles WHERE user_id::text LIKE 'a1310001-%'),
 'normal auth trigger created two profiles');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('a1310001-0000-4000-8000-000000000001','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('a1310001-0000-4000-8000-000000000002','seller','seller');
RESET ROLE;
SELECT ok((SELECT count(*)=2 FROM public.profiles WHERE user_id::text LIKE 'a1310001-%'
 AND ((user_id::text LIKE '%0001' AND role='buyer') OR (user_id::text LIKE '%0002' AND role='seller'))),
 'supported service onboarding completed buyer and seller');
INSERT INTO public.conversations(id,participant_a,participant_b) VALUES
 ('a1310002-0000-4000-8000-000000000001',
 'a1310001-0000-4000-8000-000000000001','a1310001-0000-4000-8000-000000000002');
SELECT ok((SELECT count(*)=1 AND bool_and(closed_at IS NULL) FROM public.conversations
 WHERE id='a1310002-0000-4000-8000-000000000001'),
 'privileged normal-trigger conversation fixture is open');
CREATE TEMP TABLE a13a_before AS SELECT pg_temp.a13a_graph() graph;
CREATE TEMP TABLE a13a_return(label text,result jsonb);
CREATE TEMP TABLE a13a_outcome(label text,sqlstate text,message text);
GRANT INSERT ON a13a_return,a13a_outcome TO authenticated;
CREATE FUNCTION pg_temp.a13a_try(label text,attachments jsonb,delivery uuid) RETURNS void
 LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE m public.messages; s text; err text;
BEGIN
 BEGIN
  SELECT * INTO m FROM public.send_message_with_attachments(
   'a1310002-0000-4000-8000-000000000001','',delivery,attachments);
  INSERT INTO a13a_return VALUES(label,to_jsonb(m));
  INSERT INTO a13a_outcome VALUES(label,NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS s=RETURNED_SQLSTATE,err=MESSAGE_TEXT;
  INSERT INTO a13a_outcome VALUES(label,s,err);
 END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.a13a_try(text,jsonb,uuid) TO authenticated;
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1310001-0000-4000-8000-000000000001"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.a13a_try('success','[{"storage_path":"a13/path-1","filename":"image.jpg","mime_type":"image/jpeg"}]',
 'a1310003-0000-4000-8000-000000000001');
RESET ROLE;
SELECT is((SELECT sqlstate FROM a13a_outcome WHERE label='success'),NULL::text,
 'attachment-only authenticated delivery succeeds');
SELECT ok((SELECT result=to_jsonb(m) AND result->>'content'=''
 AND result->>'sender_id'='a1310001-0000-4000-8000-000000000001'
 AND result->>'conversation_id'='a1310002-0000-4000-8000-000000000001'
 AND result->>'client_delivery_id'='a1310003-0000-4000-8000-000000000001'
 FROM a13a_return r JOIN public.messages m ON m.id=(r.result->>'id')::uuid
 WHERE r.label='success'),'returned complete composite equals persisted message');
SELECT ok((SELECT count(*)=1 AND bool_and(storage_path='a13/path-1' AND filename='image.jpg'
 AND mime_type='image/jpeg' AND size_bytes IS NULL AND created_at=transaction_timestamp())
 FROM public.message_attachments a WHERE message_id=(SELECT (result->>'id')::uuid FROM a13a_return WHERE label='success')),
 'one complete normalized attachment metadata row');
SELECT ok((SELECT count(*)=1 AND bool_and(user_id='a1310001-0000-4000-8000-000000000002'
 AND title='New message' AND body='You have a new conversation reply'
 AND type='message' AND link='/messages' AND read=false AND created_at=transaction_timestamp())
 FROM public.notifications n WHERE NOT EXISTS
 (SELECT 1 FROM a13a_before b WHERE b.graph->'notifications' ? n.id::text)),
 'normal message trigger creates exactly one complete recipient notice');
SELECT ok((SELECT
 ((pg_temp.a13a_graph()->'messages') - (SELECT result->>'id' FROM a13a_return WHERE label='success'))=b.graph->'messages'
 AND ((pg_temp.a13a_graph()->'attachments') - (SELECT id::text FROM public.message_attachments
  WHERE message_id=(SELECT (result->>'id')::uuid FROM a13a_return WHERE label='success')))=b.graph->'attachments'
 AND ((pg_temp.a13a_graph()->'conversations') - 'a1310002-0000-4000-8000-000000000001')=
  ((b.graph->'conversations') - 'a1310002-0000-4000-8000-000000000001')
 AND pg_temp.a13a_graph()->'leads'=b.graph->'leads'
 AND ((pg_temp.a13a_graph()->'notifications') - (SELECT id::text FROM public.notifications n
  WHERE NOT (b.graph->'notifications' ? n.id::text)))=b.graph->'notifications'
 FROM a13a_before b),'full scoped graph has no unrelated changes from attachment delivery');
SELECT ok((SELECT (pg_temp.a13a_graph()->'users')=(graph->'users')
 AND (pg_temp.a13a_graph()->'profiles')=(graph->'profiles')
 AND (pg_temp.a13a_graph()->'profiles_public')=(graph->'profiles_public')
 FROM a13a_before),'delivery preserves auth and profile projection graph');
CREATE TEMP TABLE a13a_after AS SELECT pg_temp.a13a_graph() graph;
SET LOCAL ROLE authenticated;
SELECT pg_temp.a13a_try('duplicate','[{"storage_path":"a13/path-1","filename":"a"},{"storage_path":"a13/path-1","filename":"b"}]',
 'a1310003-0000-4000-8000-000000000002');
SELECT pg_temp.a13a_try('malformed','[{"filename":"no-path"}]',
 'a1310003-0000-4000-8000-000000000003');
SELECT pg_temp.a13a_try('too_many',(SELECT jsonb_agg(jsonb_build_object('storage_path','a13/'||n,'filename','f'))
 FROM generate_series(1,11) n),'a1310003-0000-4000-8000-000000000004');
SELECT pg_temp.a13a_try('metadata_conflict',
 '[{"storage_path":"a13/path-1","filename":"changed.jpg","mime_type":"image/png"}]',
 'a1310003-0000-4000-8000-000000000001');
SELECT pg_temp.a13a_try('identical',
 '[{"storage_path":"a13/path-1","filename":"image.jpg","mime_type":"image/jpeg"}]',
 'a1310003-0000-4000-8000-000000000001');
RESET ROLE;
SELECT is((SELECT string_agg(label||'='||sqlstate||':'||message,',' ORDER BY label)
 FROM a13a_outcome WHERE label IN ('duplicate','malformed','too_many','metadata_conflict')),
 'duplicate=22023:duplicate_message_attachment,malformed=22023:invalid_message_attachments,metadata_conflict=23505:message_delivery_id_conflict,too_many=22023:invalid_message_attachments',
 'all metadata validation and changed-metadata retry denials exact');
SELECT is(pg_temp.a13a_graph(),(SELECT graph FROM a13a_after),
 'all denials and identical retry preserve complete post-success graph');
SELECT is((SELECT result FROM a13a_return WHERE label='identical'),
 (SELECT result FROM a13a_return WHERE label='success'),
 'identical delivery ID retry returns exactly same composite');
SELECT is((SELECT count(*)::int FROM a13a_return),2,'only success and identical retry return');
SELECT is((SELECT count(*)::int FROM a13a_outcome),6,'all six actions recorded');
SELECT is(pg_temp.a13a_catalog(),(SELECT catalog FROM a13a_pre),'installed graph catalog unchanged');
SELECT is(current_user,'postgres','actual role reset before TAP finish');
SELECT * FROM finish();
ROLLBACK;
DO $$ DECLARE b a13a_pre%ROWTYPE; BEGIN
 SELECT * INTO b FROM a13a_pre;
 IF pg_backend_pid()<>b.pid OR current_user<>'postgres'
 OR current_setting('session_replication_role')<>'origin'
 OR pg_temp.a13a_graph() IS DISTINCT FROM b.graph
 OR pg_temp.a13a_catalog() IS DISTINCT FROM b.catalog
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'a1310001-%')
 THEN RAISE EXCEPTION 'message same-backend rollback, identity, catalog or graph drift'; END IF;
END $$;
SELECT 'A13A_POST',pg_backend_pid(),encode(digest(pg_temp.a13a_graph()::text,'sha256'),'hex'),
 encode(digest(pg_temp.a13a_catalog()::text,'sha256'),'hex');
DROP TABLE a13a_pre;
DROP FUNCTION pg_temp.a13a_graph();
DROP FUNCTION pg_temp.a13a_catalog();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema())
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema())
 THEN RAISE EXCEPTION 'message temporary residue'; END IF;
END $$;
