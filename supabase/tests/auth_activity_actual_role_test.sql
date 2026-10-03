\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (current_database() !~ '^maiprop_d0_[a-z0-9_]{6,48}$'
     AND current_database() <> 'maiprop_t13auth_20261003_activity01')
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source',
  'maiprop_d0_20261003_refresh01','maiprop_d0_20261003_refresh02')
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='maiprop_t12q_20260930_source') <> 'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema())
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema())
 OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'a1300001-%')
 THEN RAISE EXCEPTION 'auth activity proof requires clean owned local clone and normal triggers'; END IF;
END $$;

CREATE FUNCTION pg_temp.a13_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
  'auth_events',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.user_auth_activity_events x),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x))
$$;
CREATE FUNCTION pg_temp.a13_identity(p_role text,p_sub uuid,p_session text,p_headers jsonb)
RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT current_user=p_role AND session_user='postgres'
  AND current_setting('maiprop.test_disposable_database',true)=current_database()
  AND current_setting('session_replication_role')='origin'
  AND inet_server_addr() IS NULL
  AND auth.uid() IS NOT DISTINCT FROM p_sub
  AND auth.jwt()=CASE WHEN p_role='anon' THEN '{"role":"anon"}'::jsonb
   ELSE jsonb_build_object('role',p_role,'sub',p_sub,'session_id',p_session) END
  AND current_setting('request.jwt.claims')::jsonb=CASE WHEN p_role='anon'
   THEN '{"role":"anon"}'::jsonb
   ELSE jsonb_build_object('role',p_role,'sub',p_sub,'session_id',p_session) END
  AND coalesce(current_setting('request.jwt.claim.sub',true),'')=coalesce(p_sub::text,'')
  AND current_setting('request.jwt.claim.role')=p_role
  AND current_setting('request.headers')::jsonb=p_headers
$$;
CREATE FUNCTION pg_temp.a13_clear() RETURNS boolean LANGUAGE plpgsql VOLATILE AS $$
BEGIN
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 PERFORM set_config('request.jwt.claim.role','',true);
 PERFORM set_config('request.headers','',true);
 RETURN current_user='postgres' AND session_user='postgres'
  AND auth.uid() IS NULL AND auth.jwt()='{}'::jsonb
  AND current_setting('request.jwt.claim.sub')=''
  AND current_setting('request.jwt.claims')='{}'
  AND current_setting('request.jwt.claim.role')=''
  AND current_setting('request.headers')='';
END
$$;
CREATE FUNCTION pg_temp.a13_bindings() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(WITH named(sig) AS (VALUES
  ('auth.uid()'),('auth.jwt()'),
  ('public.record_user_auth_activity(text,text,jsonb)'),
  ('private.record_user_auth_activity_for_current_user(text,text,jsonb)'),
  ('public.release_expired_firesale_reservations(uuid)'),
  ('public.audit_firesale_interest_mutation()'),
  ('public.has_platform_admin(uuid)'),('private.has_platform_admin(uuid)'),
  ('public.admin_review_invitation_request(uuid,uuid,text,text,text)')
 ), trigger_functions AS (
  SELECT DISTINCT t.tgfoid oid FROM pg_trigger t WHERE NOT t.tgisinternal
   AND t.tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,
    'public.profiles_public'::regclass,'public.user_auth_activity_events'::regclass,
    'public.notifications'::regclass)
 ), selected AS (
  SELECT to_regprocedure(sig) oid FROM named UNION SELECT oid FROM trigger_functions
 ) SELECT jsonb_build_object('named_count',(SELECT count(*) FROM named),
  'missing_named',(SELECT count(*) FROM named WHERE to_regprocedure(sig) IS NULL),
  'trigger_function_count',(SELECT count(*) FROM trigger_functions),
  'count',count(*),'rows',coalesce(jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'body',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,
  'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text),'[]'::jsonb))
  FROM pg_proc p JOIN selected s ON s.oid=p.oid),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,
  'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true),
  'body',t.tgfoid::regprocedure::text) ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
  FROM pg_trigger t WHERE NOT t.tgisinternal
  AND t.tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,
   'public.profiles_public'::regclass,'public.user_auth_activity_events'::regclass,
   'public.notifications'::regclass)),
 'tables',(SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'rls',c.relrowsecurity,
  'force_rls',c.relforcerowsecurity,'acl',c.relacl,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'generated',a.attgenerated) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.oid::regclass::text)
  FROM pg_class c WHERE c.oid IN ('auth.users'::regclass,'public.profiles'::regclass,
   'public.profiles_public'::regclass,'public.user_auth_activity_events'::regclass,
   'public.notifications'::regclass)),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',polrelid::regclass::text,'name',polname,
  'command',polcmd,'permissive',polpermissive,'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
   FROM unnest(polroles) r ORDER BY 1),'using',pg_get_expr(polqual,polrelid),
  'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polrelid::regclass::text,polname),'[]'::jsonb)
  FROM pg_policy WHERE polrelid IN ('public.profiles'::regclass,'public.profiles_public'::regclass,
   'public.user_auth_activity_events'::regclass,'public.notifications'::regclass)),
 'effective_acl',(SELECT jsonb_agg(jsonb_build_object('role',v.role,
  'public_schema',has_schema_privilege(v.role,'public','USAGE'),
  'private_schema',has_schema_privilege(v.role,'private','USAGE'),
  'auth_schema',has_schema_privilege(v.role,'auth','USAGE'),
  'public_rpc',has_function_privilege(v.role,'public.record_user_auth_activity(text,text,jsonb)','EXECUTE'),
  'private_helper',has_function_privilege(v.role,'private.record_user_auth_activity_for_current_user(text,text,jsonb)','EXECUTE'),
  'event_select',has_table_privilege(v.role,'public.user_auth_activity_events','SELECT'),
  'event_insert',has_table_privilege(v.role,'public.user_auth_activity_events','INSERT'),
  'event_update',has_table_privilege(v.role,'public.user_auth_activity_events','UPDATE'),
  'event_delete',has_table_privilege(v.role,'public.user_auth_activity_events','DELETE')) ORDER BY v.role)
  FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) v(role))
 )
$$;
CREATE TEMP TABLE a13_pre AS SELECT pg_backend_pid() pid,current_user db_role,session_user session_role,
 current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') origin,inet_server_addr() socket,
 auth.uid() actor,auth.jwt() jwt,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 current_setting('request.headers',true) headers,
 pg_temp.a13_graph() graph,pg_temp.a13_bindings() bindings,
 (SELECT jsonb_object_agg(name,setting) FROM pg_settings) settings,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences) sequences;
SELECT 'A13_PRE',pid,encode(digest(graph::text,'sha256'),'hex') graph_sha,
 encode(digest(bindings::text,'sha256'),'hex') bindings_sha FROM a13_pre;

BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SELECT plan(38);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers enabled');
SELECT ok((SELECT (bindings->'routines'->>'named_count')::int=9
 AND (bindings->'routines'->>'missing_named')::int=0
 AND (bindings->'routines'->>'trigger_function_count')::int=10
 AND (bindings->'routines'->>'count')::int=19 FROM a13_pre),
 'nine named and ten actual trigger routines resolve without missing entries');
SELECT ok((SELECT count(*)=9 AND bool_and(coalesce(
  encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha,false))
 FROM (VALUES
 ('auth.uid()','14051be81fb442ef22c05702971c9e2f2dcc3141258db656b343bb4d9a4de20d'),
 ('auth.jwt()','fbb75ed5b61ce58c242bdd58c42c7db5d9832e12c2af4000561173607bd89b45'),
 ('public.record_user_auth_activity(text,text,jsonb)','fb180af22b689b21441dbec126e29e11810881bcd70f5592d41a2ea1c7cc3163'),
 ('private.record_user_auth_activity_for_current_user(text,text,jsonb)','9ad3342054c0248923f22bdd7da4e6b13636e2ccc7116ec9d82e853e81b07a4e'),
 ('public.release_expired_firesale_reservations(uuid)','d407139144d8ad3a0ed4bfe49edca50e14a465b21c8fe3f993816dcfe37fbc08'),
 ('public.audit_firesale_interest_mutation()','7085921d35e04cc57beddda7b0b495736cda701374596264e02c7d960d847c1c'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce'),
 ('public.admin_review_invitation_request(uuid,uuid,text,text,text)','4f25f37c8f7eb1e0a0c89d6bcf54108921710973fa38fe7f97289b171483b511')
 ) expected(sig,sha)), 'all nine named installed bodies match exact pins');
SELECT ok(has_function_privilege('authenticated','public.record_user_auth_activity(text,text,jsonb)','EXECUTE')
 AND has_function_privilege('authenticated','private.record_user_auth_activity_for_current_user(text,text,jsonb)','EXECUTE')
 AND NOT has_function_privilege('anon','public.record_user_auth_activity(text,text,jsonb)','EXECUTE')
 AND NOT has_table_privilege('authenticated','public.user_auth_activity_events','INSERT')
 AND NOT has_table_privilege('anon','public.user_auth_activity_events','SELECT'),
 'public RPC and private helper have actual authenticated grants, direct writes and anon denied');
SELECT ok((SELECT count(*)=10 AND bool_and(tgenabled='O') FROM pg_trigger
 WHERE NOT tgisinternal AND tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,
 'public.profiles_public'::regclass,'public.user_auth_activity_events'::regclass,
 'public.notifications'::regclass)), 'all ten scoped triggers enabled');

INSERT INTO auth.users(id,email) VALUES
 ('a1300001-0000-4000-8000-000000000001','auth-activity-a@example.test'),
 ('a1300001-0000-4000-8000-000000000002','auth-activity-b@example.test');
SELECT is((SELECT count(*)::int FROM auth.users WHERE id::text LIKE 'a1300001-%'),2,
 'normal auth insertion creates exactly two fixture users');
SELECT ok((SELECT count(*)=2 AND bool_and(
  to_jsonb(u)-'created_at'-'updated_at' =
  jsonb_build_object('id',u.id,'email',CASE u.id
   WHEN 'a1300001-0000-4000-8000-000000000001'::uuid THEN 'auth-activity-a@example.test'
   ELSE 'auth-activity-b@example.test' END,
   'encrypted_password',NULL,'email_confirmed_at',NULL,'raw_user_meta_data','{}'::jsonb,
   'raw_app_meta_data','{}'::jsonb,'role',NULL,'aud',NULL,'phone',NULL,
   'phone_confirmed_at',NULL,'last_sign_in_at',NULL,'is_super_admin',false,
   'banned_until',NULL,'deleted_at',NULL,'confirmed_at',NULL)
  AND u.created_at=transaction_timestamp() AND u.updated_at=transaction_timestamp())
 FROM auth.users u WHERE id::text LIKE 'a1300001-%'),
 'complete two auth users match independent defaults and timestamps');
SELECT ok((SELECT count(*)=2 AND bool_and(
  to_jsonb(p)-'id'-'created_at'-'updated_at' =
  jsonb_build_object('user_id',p.user_id,'role',NULL,'first_name',NULL,'last_name',NULL,
  'display_name',NULL,'avatar_url',NULL,'phone',NULL,'bio',NULL,'city',NULL,
  'country','Greece','website_url',NULL,'verified',false,'is_platform_admin',false,
  'video_link',NULL,'role_switch_in_progress_at',NULL,'participant_type',NULL,
  'subscription_product_id',NULL,'force_pro_access',false,'investor_mode',false,
  'account_status','active','account_moderation_reason',NULL,'account_moderated_at',NULL,
  'account_moderated_by',NULL,'role_switch_audit_id',NULL,'role_switch_audit_required',false)
  AND p.id IS NOT NULL AND p.created_at=transaction_timestamp()
  AND p.updated_at=transaction_timestamp())
 FROM public.profiles p WHERE user_id::text LIKE 'a1300001-%'),
 'complete two triggered profiles match independent defaults and generated IDs');
SELECT ok((SELECT count(*)=2 AND bool_and(to_jsonb(pp)=jsonb_build_object(
  'user_id',pp.user_id,'role',NULL,'display_name',NULL,'avatar_url',NULL,
  'first_name',NULL,'last_name',NULL,'owner_participant_type',NULL))
 FROM public.profiles_public pp WHERE user_id::text LIKE 'a1300001-%'),
 'complete two public projections match independent expected rows');
SELECT ok((SELECT (pg_temp.a13_graph()->'users')-ARRAY['a1300001-0000-4000-8000-000000000001',
 'a1300001-0000-4000-8000-000000000002']=(graph->'users')
 AND (pg_temp.a13_graph()->'profiles')-ARRAY['a1300001-0000-4000-8000-000000000001',
 'a1300001-0000-4000-8000-000000000002']=(graph->'profiles')
 AND (pg_temp.a13_graph()->'profiles_public')-ARRAY['a1300001-0000-4000-8000-000000000001',
 'a1300001-0000-4000-8000-000000000002']=(graph->'profiles_public')
 AND pg_temp.a13_graph()->'auth_events'=graph->'auth_events'
 AND pg_temp.a13_graph()->'notifications'=graph->'notifications' FROM a13_pre),
 'fixture adds only independently modeled users, profiles and projections; all old rows preserved');
CREATE TEMP TABLE a13_expected AS SELECT pg_temp.a13_graph() graph;
SELECT is((SELECT jsonb_object_keys(graph->'auth_events') FROM a13_expected LIMIT 1),NULL::text,
 'fixture starts with no new auth event');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300001-0000-4000-8000-000000000001","session_id":"session-a"}',true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.a13_identity('authenticated','a1300001-0000-4000-8000-000000000001','session-a',
 '{"user-agent":"A13/browser"}'::jsonb),
 'first event uses exact actual authenticated A role, claims and headers');
SELECT public.record_user_auth_activity('sign_in',' /account ',
 '{"source":"on_auth_state_change","expires_at":42}'::jsonb) AS a13_first_id \gset
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'first event restores role, full claims and headers');
SELECT ok(:'a13_first_id'::uuid IS NOT NULL
 AND (SELECT count(*)=1 FROM public.user_auth_activity_events WHERE id=:'a13_first_id'::uuid)
 AND (SELECT to_jsonb(e)=jsonb_build_object(
  'id',:'a13_first_id'::uuid,'user_id','a1300001-0000-4000-8000-000000000001'::uuid,
  'event_type','sign_in','session_id','session-a','route','/account',
  'user_agent','A13/browser','metadata','{"source":"on_auth_state_change","expires_at":42}'::jsonb,
  'created_at',transaction_timestamp()) FROM public.user_auth_activity_events e WHERE id=:'a13_first_id'::uuid),
 'first return UUID binds complete independently modeled persisted event');
UPDATE a13_expected SET graph=jsonb_set(graph,'{auth_events}',
 (graph->'auth_events')||jsonb_build_object(:'a13_first_id',
  jsonb_build_object('id',:'a13_first_id'::uuid,'user_id','a1300001-0000-4000-8000-000000000001'::uuid,
  'event_type','sign_in','session_id','session-a','route','/account','user_agent','A13/browser',
  'metadata','{"source":"on_auth_state_change","expires_at":42}'::jsonb,
  'created_at',transaction_timestamp())));
SELECT ok(pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'first success full graph equals independent one-row transition');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300001-0000-4000-8000-000000000001","session_id":"session-a"}',true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.a13_identity('authenticated','a1300001-0000-4000-8000-000000000001','session-a',
 '{"user-agent":"A13/browser"}'::jsonb),
 'repeat event uses exact authenticated A identity and headers');
SELECT public.record_user_auth_activity('sign_in','/different',
 '{"source":"duplicate"}'::jsonb) AS a13_repeat_id \gset
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'dedup event restores role, full claims and headers');
SELECT is(:'a13_repeat_id'::uuid,:'a13_first_id'::uuid,
 'immediate same-actor/session/event repetition returns first UUID');
SELECT ok(pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'deduplication preserves first complete row, route, metadata and all neighbors');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300001-0000-4000-8000-000000000001","session_id":"session-a"}',true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.a13_identity('authenticated','a1300001-0000-4000-8000-000000000001','session-a',
 '{"user-agent":"A13/browser"}'::jsonb),
 'second event type retains exact authenticated A identity');
SELECT public.record_user_auth_activity('token_refreshed','/tokens','{}'::jsonb) AS a13_token_id \gset
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'distinct event restores role, full claims and headers');
SELECT ok(:'a13_token_id'::uuid IS NOT NULL AND :'a13_token_id'::uuid<>:'a13_first_id'::uuid
 AND (SELECT to_jsonb(e)=jsonb_build_object(
  'id',:'a13_token_id'::uuid,'user_id','a1300001-0000-4000-8000-000000000001'::uuid,
  'event_type','token_refreshed','session_id','session-a','route','/tokens',
  'user_agent','A13/browser','metadata','{}'::jsonb,'created_at',transaction_timestamp())
 FROM public.user_auth_activity_events e WHERE id=:'a13_token_id'::uuid),
 'allowed distinct event returns new UUID and complete expected row');
UPDATE a13_expected SET graph=jsonb_set(graph,'{auth_events}',
 (graph->'auth_events')||jsonb_build_object(:'a13_token_id',
  jsonb_build_object('id',:'a13_token_id'::uuid,'user_id','a1300001-0000-4000-8000-000000000001'::uuid,
  'event_type','token_refreshed','session_id','session-a','route','/tokens',
  'user_agent','A13/browser','metadata','{}'::jsonb,'created_at',transaction_timestamp())));
SELECT ok(pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'second event changes exactly one row, preserving all old rows');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300001-0000-4000-8000-000000000002","session_id":"session-a"}',true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.a13_identity('authenticated','a1300001-0000-4000-8000-000000000002','session-a',
 '{"user-agent":"A13/browser"}'::jsonb),
 'other actor uses actual authenticated B subject, same session label');
SELECT public.record_user_auth_activity('sign_in','/b','{}'::jsonb) AS a13_b_id \gset
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'actor B event restores role, full claims and headers');
SELECT ok(:'a13_b_id'::uuid IS NOT NULL AND :'a13_b_id'::uuid<>:'a13_first_id'::uuid
 AND (SELECT to_jsonb(e)=jsonb_build_object(
  'id',:'a13_b_id'::uuid,'user_id','a1300001-0000-4000-8000-000000000002'::uuid,
  'event_type','sign_in','session_id','session-a','route','/b',
  'user_agent','A13/browser','metadata','{}'::jsonb,'created_at',transaction_timestamp())
 FROM public.user_auth_activity_events e WHERE id=:'a13_b_id'::uuid),
 'same event/session for B remains actor isolated with full returned row');
UPDATE a13_expected SET graph=jsonb_set(graph,'{auth_events}',
 (graph->'auth_events')||jsonb_build_object(:'a13_b_id',
  jsonb_build_object('id',:'a13_b_id'::uuid,'user_id','a1300001-0000-4000-8000-000000000002'::uuid,
  'event_type','sign_in','session_id','session-a','route','/b',
  'user_agent','A13/browser','metadata','{}'::jsonb,'created_at',transaction_timestamp())));
SELECT ok(pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'actor B success adds only its modeled event');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300001-0000-4000-8000-000000000001","session_id":"session-a"}',true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.a13_identity('authenticated','a1300001-0000-4000-8000-000000000001','session-a',
 '{"user-agent":"A13/browser"}'::jsonb),
 'invalid event uses exact authenticated A identity');
SELECT public.record_user_auth_activity(' invalid ','/ignored','{}'::jsonb) IS NULL AS a13_invalid \gset
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'invalid event restores role, full claims and headers');
SELECT ok(:'a13_invalid'::boolean AND pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'invalid event returns NULL with complete graph unchanged');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1300001-0000-4000-8000-000000000001","session_id":"session-a"}',true),
 set_config('request.jwt.claim.role','authenticated',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE authenticated;
SELECT ok(pg_temp.a13_identity('authenticated','a1300001-0000-4000-8000-000000000001','session-a',
 '{"user-agent":"A13/browser"}'::jsonb),
 'oversized metadata uses exact authenticated A identity');
SELECT throws_ok($$SELECT public.record_user_auth_activity('user_updated','/large',
 jsonb_build_object('blob',repeat('x',9000)))$$,
 '22023','auth activity metadata payload too large','oversized valid event rejected at metadata boundary');
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'oversized event restores role, full claims and headers');
SELECT ok(pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'oversized metadata rejection preserves full graph');

SELECT set_config('request.jwt.claim.sub','',true),
 set_config('request.jwt.claims','{"role":"anon"}',true),
 set_config('request.jwt.claim.role','anon',true),
 set_config('request.headers','{"user-agent":"A13/browser"}',true);
SET LOCAL ROLE anon;
SELECT ok(pg_temp.a13_identity('anon',NULL,NULL,'{"user-agent":"A13/browser"}'::jsonb),
 'anon admission uses real anon role and subjectless claims');
SELECT throws_ok($$SELECT public.record_user_auth_activity('sign_in','/anon','{}'::jsonb)$$,
 '42501',NULL,'anon is denied public RPC EXECUTE');
RESET ROLE;
SELECT ok(pg_temp.a13_clear(),'anon attempt restores role, full claims and headers');
SELECT ok(pg_temp.a13_graph()=(SELECT graph FROM a13_expected),
 'anon denial preserves complete modeled graph');
SELECT * FROM finish();
ROLLBACK;

DO $$ DECLARE b record; actual_settings jsonb; actual_seqs jsonb; BEGIN
 SELECT * INTO STRICT b FROM a13_pre;
 IF b.pid IS DISTINCT FROM pg_backend_pid() OR b.db_role IS DISTINCT FROM current_user
 OR b.session_role IS DISTINCT FROM session_user
 OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.origin IS DISTINCT FROM current_setting('session_replication_role')
 OR b.socket IS DISTINCT FROM inet_server_addr()
 OR b.actor IS DISTINCT FROM auth.uid() OR b.jwt IS DISTINCT FROM auth.jwt()
 OR NULLIF(b.sub_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.sub',true),'')
 OR NULLIF(b.claims,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claims',true),'')
 OR NULLIF(b.role_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.role',true),'')
 OR NULLIF(b.headers,'') IS DISTINCT FROM NULLIF(current_setting('request.headers',true),'')
 THEN RAISE EXCEPTION 'auth activity same-backend identity/settings restoration failed'; END IF;
 IF b.bindings IS DISTINCT FROM pg_temp.a13_bindings() THEN
  RAISE EXCEPTION 'auth activity installed body/ACL/default/trigger/policy binding drift'; END IF;
 IF b.graph IS DISTINCT FROM pg_temp.a13_graph() THEN
  RAISE EXCEPTION 'auth activity complete rollback graph differs'; END IF;
 SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) INTO actual_seqs FROM pg_sequences;
 IF b.sequences IS DISTINCT FROM actual_seqs THEN RAISE EXCEPTION 'auth activity sequence drift'; END IF;
 SELECT jsonb_object_agg(name,setting) INTO actual_settings FROM pg_settings;
 IF b.settings IS DISTINCT FROM actual_settings THEN RAISE EXCEPTION 'auth activity pg_settings drift'; END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'a1300001-%')
 OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'a1300001-%')
 OR EXISTS (SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'a1300001-%')
 OR EXISTS (SELECT 1 FROM public.user_auth_activity_events WHERE user_id::text LIKE 'a1300001-%')
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 THEN RAISE EXCEPTION 'auth activity fixture or source residue'; END IF;
END $$;
SELECT 'A13_POST',pg_backend_pid(),current_user,session_user,
 encode(digest(pg_temp.a13_graph()::text,'sha256'),'hex') graph_sha,
 encode(digest(pg_temp.a13_bindings()::text,'sha256'),'hex') bindings_sha,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences) sequences;
DROP TABLE a13_pre;
DROP FUNCTION pg_temp.a13_graph();
DROP FUNCTION pg_temp.a13_identity(text,uuid,text,jsonb);
DROP FUNCTION pg_temp.a13_clear();
DROP FUNCTION pg_temp.a13_bindings();
DO $$ BEGIN
 IF current_user <> 'postgres' OR current_setting('session_replication_role') <> 'origin'
 OR coalesce(current_setting('request.jwt.claim.sub',true),'') <> ''
 OR coalesce(current_setting('request.jwt.claim.role',true),'') <> ''
 OR coalesce(current_setting('request.jwt.claims',true),'') NOT IN ('','{}')
 OR coalesce(current_setting('request.headers',true),'') <> ''
 THEN RAISE EXCEPTION 'auth activity leaked role or claims'; END IF;
 IF to_regprocedure('public.dblink_get_connections()') IS NOT NULL THEN
  IF coalesce(array_length(public.dblink_get_connections(),1),0) <> 0
  THEN RAISE EXCEPTION 'auth activity leaked dblink connection'; END IF;
 END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema())
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema())
 THEN RAISE EXCEPTION 'auth activity leaked temporary object'; END IF;
END $$;
SELECT 'A13_SAME_BACKEND_TEMP_CLEAN',pg_backend_pid(),
 (SELECT count(*) FROM pg_class WHERE relnamespace=pg_my_temp_schema()) temp_relations,
 (SELECT count(*) FROM pg_proc WHERE pronamespace=pg_my_temp_schema()) temp_functions;
