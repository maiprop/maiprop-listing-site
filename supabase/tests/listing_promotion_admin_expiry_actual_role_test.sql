\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (current_database() !~ '^maiprop_d0_[a-z0-9_]{6,48}$'
     AND current_database() <> 'maiprop_t13promo_20261003_adminexpiry01')
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
 OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'e1300001-%')
 THEN RAISE EXCEPTION 'admin expiry proof needs clean owned socket clone and origin triggers'; END IF;
END $$;
-- The listing search trigger may register extension defaults on first use.
DO $$ BEGIN PERFORM extensions.similarity('admin expiry','expiry'); END $$;
SELECT set_config('maiprop.owner_auth_trigger_active','false',false);

CREATE FUNCTION pg_temp.e13_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
 'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.listings x),
 'allocations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.listing_promotion_allocations x),
 'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.billing_subscriptions x),
 'purchases',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.addon_purchases x),
 'refunds',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]'::jsonb) FROM private.addon_refund_events x),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x),
 'catalogue_publications',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY publication_id),'[]'::jsonb) FROM private.public_catalogue_publications x),
 'catalogue_current',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY singleton),'[]'::jsonb) FROM private.public_catalogue_current x),
 'catalogue_versions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY version_id),'[]'::jsonb) FROM private.public_catalogue_versions x))
$$;
CREATE FUNCTION pg_temp.e13_bindings() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(SELECT jsonb_build_object('count',count(*),'rows',jsonb_agg(jsonb_build_object(
  'signature',p.oid::regprocedure::text,'body',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,
  'acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
   'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
   ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
   FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY p.oid::regprocedure::text))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('auth','public','private')),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,
  'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true),'body',t.tgfoid::regprocedure::text)
  ORDER BY t.tgrelid::regclass::text,t.tgname) FROM pg_trigger t WHERE NOT t.tgisinternal
  AND t.tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.profiles_public'::regclass,
  'public.listings'::regclass,'public.listing_promotion_allocations'::regclass,'public.notifications'::regclass)),
 'tables',(SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'rls',c.relrowsecurity,
  'force_rls',c.relforcerowsecurity,'acl',c.relacl,
  'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
   'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'generated',a.attgenerated) ORDER BY a.attnum)
   FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
   WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped)) ORDER BY c.oid::regclass::text)
  FROM pg_class c WHERE c.oid IN ('auth.users'::regclass,'public.profiles'::regclass,
   'public.profiles_public'::regclass,'public.listings'::regclass,'public.listing_promotion_allocations'::regclass,
   'public.notifications'::regclass,'public.billing_subscriptions'::regclass,'public.addon_purchases'::regclass,
   'private.addon_refund_events'::regclass,'private.public_catalogue_publications'::regclass,
   'private.public_catalogue_current'::regclass,'private.public_catalogue_versions'::regclass)),
 'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',polrelid::regclass::text,'name',polname,
  'command',polcmd,'permissive',polpermissive,'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END
   FROM unnest(polroles) r ORDER BY 1),'using',pg_get_expr(polqual,polrelid),
  'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polrelid::regclass::text,polname),'[]'::jsonb)
  FROM pg_policy WHERE polrelid IN ('public.profiles'::regclass,'public.profiles_public'::regclass,
   'public.listings'::regclass,'public.listing_promotion_allocations'::regclass,'public.notifications'::regclass)),
 'effective_acl',(SELECT jsonb_agg(jsonb_build_object('role',v.role,'public_schema',has_schema_privilege(v.role,'public','USAGE'),
  'auth_schema',has_schema_privilege(v.role,'auth','USAGE'),
  'private_schema',has_schema_privilege(v.role,'private','USAGE'),
  'expiry_public',has_function_privilege(v.role,'public.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)','EXECUTE'),
  'expiry_private',has_function_privilege(v.role,'private.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)','EXECUTE'),
  'setter_public',has_function_privilege(v.role,'public.admin_set_listing_promotions(uuid,boolean,timestamptz,boolean,uuid)','EXECUTE'),
  'setter_private',has_function_privilege(v.role,'private.admin_set_listing_promotions(uuid,boolean,timestamptz,boolean,uuid)','EXECUTE'),
  'campaign_read',has_function_privilege(v.role,'public.get_admin_listing_promotion_campaigns()','EXECUTE'),
  'allocation_write',has_table_privilege(v.role,'public.listing_promotion_allocations','INSERT,UPDATE,DELETE')) ORDER BY v.role)
  FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) v(role)),
 'effective_table_acl',(SELECT jsonb_agg(jsonb_build_object('table',t.ident,'role',v.role,
  'select',has_table_privilege(v.role,t.ident,'SELECT'),
  'insert',has_table_privilege(v.role,t.ident,'INSERT'),
  'update',has_table_privilege(v.role,t.ident,'UPDATE'),
  'delete',has_table_privilege(v.role,t.ident,'DELETE')) ORDER BY t.ident,v.role)
  FROM (VALUES('auth.users'),('public.profiles'),('public.profiles_public'),('public.listings'),
   ('public.listing_promotion_allocations'),('public.notifications'),('public.billing_subscriptions'),
   ('public.addon_purchases'),('private.addon_refund_events'),('private.public_catalogue_publications'),
   ('private.public_catalogue_current'),('private.public_catalogue_versions')) t(ident)
  CROSS JOIN (VALUES('postgres'),('anon'),('authenticated'),('service_role')) v(role)))
$$;
CREATE TEMP TABLE e13_pre AS SELECT pg_backend_pid() pid,current_user db_role,session_user session_role,
 current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') origin,inet_server_addr() socket,
 current_setting('maiprop.owner_auth_trigger_active',true) owner_marker,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 auth.uid() actor,auth.jwt() jwt,pg_temp.e13_graph() graph,pg_temp.e13_bindings() bindings,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences) sequences,
 (SELECT jsonb_object_agg(name,setting) FROM pg_settings) settings;
SELECT 'E13_PRE',pid,db_role,session_role,marker,origin,socket,owner_marker,sub_claim,claims,role_claim,actor,jwt,
 encode(digest(graph::text,'sha256'),'hex') graph_sha,
 encode(digest(bindings::text,'sha256'),'hex') bindings_sha,
 encode(digest(settings::text,'sha256'),'hex') settings_sha,sequences FROM e13_pre;

BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SELECT no_plan();
CREATE FUNCTION pg_temp.e13_identity(p_role text,p_id uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT current_user=p_role AND session_user='postgres' AND auth.uid()=p_id
 AND current_setting('request.jwt.claim.sub',true)=p_id::text
 AND current_setting('request.jwt.claim.role',true)=p_role
 AND current_setting('request.jwt.claims',true)::jsonb=jsonb_build_object('sub',p_id::text,'role',p_role)
 AND auth.jwt()=jsonb_build_object('sub',p_id::text,'role',p_role)
$$;
CREATE FUNCTION pg_temp.e13_neutral() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT current_user='postgres' AND session_user='postgres' AND auth.uid() IS NULL
 AND auth.jwt()='{}'::jsonb AND current_setting('request.jwt.claim.sub',true)=''
 AND current_setting('request.jwt.claims',true)='{}'
 AND current_setting('request.jwt.claim.role',true)=''
 AND current_setting('maiprop.owner_auth_trigger_active',true)='false'
$$;
SELECT is(current_setting('session_replication_role'),'origin','origin triggers remain enabled');
SELECT is(encode(digest(pg_get_functiondef('private.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)'::regprocedure),'sha256'),'hex'),
 '916d18b402bffbb92f74765f8fccbb79c1eb5c96f60b00435c2f3c671a276a36','measured private expiry body matches');
SELECT ok((SELECT count(*)=5 AND bool_and(coalesce(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha,false))
 FROM (VALUES
 ('public.release_expired_firesale_reservations(uuid)','d407139144d8ad3a0ed4bfe49edca50e14a465b21c8fe3f993816dcfe37fbc08'),
 ('public.audit_firesale_interest_mutation()','7085921d35e04cc57beddda7b0b495736cda701374596264e02c7d960d847c1c'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce'),
 ('public.admin_review_invitation_request(uuid,uuid,text,text,text)','4f25f37c8f7eb1e0a0c89d6bcf54108921710973fa38fe7f97289b171483b511')) x(sig,sha)),
 'all five October installed definitions match');
SELECT is((SELECT (bindings->'routines'->>'count')::integer FROM e13_pre),1570,
 'complete auth/public/private routine closure has exact cardinality');
SELECT is((SELECT encode(digest(bindings::text,'sha256'),'hex') FROM e13_pre),
 'df7cff6e0ade26cc11ece62d272a15a265475d5b1eeec767bdb02f1829c923ae',
 'entire executed-body superset, effective ACL, trigger, default and named-policy binding matches clone pin');
SELECT 'E13_BINDING', (bindings->'routines'->>'count')::integer,
 encode(digest(bindings::text,'sha256'),'hex'),bindings->'effective_acl' FROM e13_pre;
SELECT ok(NOT has_function_privilege('anon','public.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)','EXECUTE')
 AND has_function_privilege('service_role','public.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)','EXECUTE')
 AND has_function_privilege('service_role','private.admin_update_listing_promotion_expiry(uuid,text,timestamptz,uuid)','EXECUTE'),
 'effective expiry RPC grants match real service boundary');

CREATE TEMP TABLE e13_expected AS SELECT graph FROM e13_pre;
INSERT INTO auth.users(id,email) VALUES
 ('e1300001-0000-4000-8000-000000000001','e13-seller@example.test'),
 ('e1300001-0000-4000-8000-000000000002','kr@maiprop.co');
SELECT is(current_setting('maiprop.owner_auth_trigger_active',true),'true',
 'normal owner signup trigger marked its scoped admin role write');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT is(current_setting('maiprop.owner_auth_trigger_active',true),'false',
 'owner signup marker cleared before subsequent service business actions');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('e1300001-0000-4000-8000-000000000001','seller','seller');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='e1300001-0000-4000-8000-000000000002'),
 'admin','normal owner signup made authoritative admin');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status)
VALUES
 ('e1300002-0000-4000-8000-000000000001','e1300001-0000-4000-8000-000000000001',
  'E13 Spotlight','E13Unique',210001,81,'apartment','sale','active'),
 ('e1300002-0000-4000-8000-000000000002','e1300001-0000-4000-8000-000000000001',
  'E13 Neighbor','E13Unique',210002,82,'apartment','sale','active');
-- Fixture constructors encode literals and schema defaults; generated profile IDs are checked bindings.
CREATE TEMP TABLE e13_user (LIKE auth.users INCLUDING DEFAULTS);
INSERT INTO e13_user(id,email) VALUES
 ('e1300001-0000-4000-8000-000000000001','e13-seller@example.test'),
 ('e1300001-0000-4000-8000-000000000002','kr@maiprop.co');
CREATE TEMP TABLE e13_profile (LIKE public.profiles INCLUDING DEFAULTS);
INSERT INTO e13_profile(id,user_id,role,participant_type,created_at,updated_at)
SELECT p.id,v.user_id::uuid,v.role::public.user_role,v.participant,now(),now()
FROM (VALUES('e1300001-0000-4000-8000-000000000001','seller','seller'),
 ('e1300001-0000-4000-8000-000000000002','admin',NULL)) v(user_id,role,participant)
JOIN public.profiles p ON p.user_id=v.user_id::uuid;
CREATE TEMP TABLE e13_public_profile (LIKE public.profiles_public INCLUDING DEFAULTS);
INSERT INTO e13_public_profile(user_id,role,owner_participant_type)
VALUES('e1300001-0000-4000-8000-000000000001','seller','seller'),
 ('e1300001-0000-4000-8000-000000000002','admin','agent');
CREATE TEMP TABLE e13_listing (LIKE public.listings INCLUDING DEFAULTS);
INSERT INTO e13_listing(id,owner_id,title,city,price,sqm,property_type,listing_type,status)
VALUES
 ('e1300002-0000-4000-8000-000000000001','e1300001-0000-4000-8000-000000000001',
  'E13 Spotlight','E13Unique',210001,81,'apartment','sale','active'),
 ('e1300002-0000-4000-8000-000000000002','e1300001-0000-4000-8000-000000000001',
  'E13 Neighbor','E13Unique',210002,82,'apartment','sale','active');
UPDATE e13_listing SET location_search_text=public.expand_location_search_aliases(public.normalize_location_text(
 coalesce(title,'')||' '||coalesce(address,'')||' '||coalesce(city,'')||' '||
 coalesce(region,'')||' '||coalesce(postal_code,'')));
UPDATE e13_expected SET graph=graph||jsonb_build_object(
 'users',graph->'users'||(SELECT jsonb_object_agg(id::text,to_jsonb(x)) FROM e13_user x),
 'profiles',graph->'profiles'||(SELECT jsonb_object_agg(user_id::text,to_jsonb(x)) FROM e13_profile x),
 'profiles_public',graph->'profiles_public'||(SELECT jsonb_object_agg(user_id::text,to_jsonb(x)) FROM e13_public_profile x),
 'listings',graph->'listings'||(SELECT jsonb_object_agg(id::text,to_jsonb(x)) FROM e13_listing x));
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_expected),
 'complete fixture graph equals independent literals and defaults, preserving every old row');

-- The campaign and notification constructors are declared before any setter action.
-- Random IDs/keys and statement timestamps may later be bound only after shape/range checks.
CREATE FUNCTION pg_temp.e13_allocation(p_id uuid,p_key text,p_start timestamptz,p_end timestamptz,
 p_status text,p_revoked timestamptz,p_reason text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.listing_promotion_allocations,jsonb_build_object(
  'id',p_id,'listing_id','e1300002-0000-4000-8000-000000000001'::uuid,
  'owner_id','e1300001-0000-4000-8000-000000000001'::uuid,
  'promotion_type','spotlight','source_type','admin','status',p_status,
  'request_key',p_key,'starts_at',p_start,'ends_at',p_end,
  'revoked_at',p_revoked,'revoke_reason',p_reason,
  'created_by','e1300001-0000-4000-8000-000000000002'::uuid,
  'created_at',now(),'updated_at',now(),'listing_snapshot','{}'::jsonb,'owner_snapshot','{}'::jsonb)))
$$;
CREATE FUNCTION pg_temp.e13_notice(p_id uuid,p_title text,p_body text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.notifications,jsonb_build_object(
  'id',p_id,'user_id','e1300001-0000-4000-8000-000000000001'::uuid,
  'title',p_title,'body',p_body,'type','featured_listing','read',false,
  'link','/dashboard/listings','created_at',now())))
$$;
CREATE TEMP TABLE e13_action_bounds(label text PRIMARY KEY, lower_at timestamptz NOT NULL,upper_at timestamptz);

-- Each call uses the public service RPC and the real, matching admin actor.
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
INSERT INTO e13_action_bounds(label,lower_at) VALUES('enable-old',clock_timestamp());
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000002') AS actor_ok \gset
SELECT is(public.has_platform_admin('e1300001-0000-4000-8000-000000000002'),true,
 'real service-admin context resolves authoritative profile role');
SELECT public.admin_set_listing_promotions('e1300002-0000-4000-8000-000000000001',
 true,now()+interval '15 days',NULL,'e1300001-0000-4000-8000-000000000002') IS NULL AS void_ok \gset
RESET ROLE;
UPDATE e13_action_bounds SET upper_at=clock_timestamp() WHERE label='enable-old';
SELECT ok(:'actor_ok'::boolean AND :'void_ok'::boolean,'admin setter used service role and returned void');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'setter actor restored');
CREATE TEMP TABLE e13_campaign_binding AS
SELECT 'old'::text label,a.id,a.request_key,a.starts_at,a.ends_at
FROM public.listing_promotion_allocations a
WHERE a.listing_id='e1300002-0000-4000-8000-000000000001' AND a.promotion_type='spotlight';
CREATE TEMP TABLE e13_notice_binding AS
SELECT 'enable-old'::text label,n.id FROM public.notifications n
WHERE n.user_id='e1300001-0000-4000-8000-000000000001';
SELECT ok((SELECT count(*)=1 AND bool_and(request_key ~
 '^admin:e1300001-0000-4000-8000-000000000002:[0-9a-f-]{36}$'
 AND ends_at=now()+interval '15 days' AND starts_at BETWEEN
 (SELECT lower_at FROM e13_action_bounds WHERE label='enable-old') AND
 (SELECT upper_at FROM e13_action_bounds WHERE label='enable-old')) FROM e13_campaign_binding),
 'generated old campaign identity/time is a checked binding');
SELECT is((SELECT count(*)::integer FROM e13_notice_binding),1,
 'normal enable creates exactly one notification identity');
UPDATE e13_expected x SET graph=jsonb_set(jsonb_set(jsonb_set(graph,
 ARRAY['allocations',b.id::text],pg_temp.e13_allocation(b.id,b.request_key,b.starts_at,
 now()+interval '15 days','active',NULL,NULL),true),
 ARRAY['listings','e1300002-0000-4000-8000-000000000001'],
 graph->'listings'->'e1300002-0000-4000-8000-000000000001'||
 jsonb_build_object('is_featured',true,'featured_until',now()+interval '15 days','updated_at',now()),true),
 ARRAY['notifications',n.id::text],pg_temp.e13_notice(n.id,'Spotlight enabled',
 'Your listing E13 Spotlight now has Spotlight visibility.'),true)
FROM e13_campaign_binding b CROSS JOIN e13_notice_binding n
WHERE b.label='old' AND n.label='enable-old';
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_expected),
 'first setter adds one full admin campaign and exact notification, preserving all neighbors');

-- Revoke through the ordinary admin route to produce a real historical row.
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
INSERT INTO e13_action_bounds(label,lower_at) VALUES('revoke-old',clock_timestamp());
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000002') AS actor_ok \gset
SELECT public.admin_set_listing_promotions('e1300002-0000-4000-8000-000000000001',
 false,NULL,NULL,'e1300001-0000-4000-8000-000000000002') IS NULL AS void_ok \gset
RESET ROLE;
UPDATE e13_action_bounds SET upper_at=clock_timestamp() WHERE label='revoke-old';
SELECT ok(:'actor_ok'::boolean AND :'void_ok'::boolean,'admin revoke used real service actor and void contract');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'revoke actor restored');
INSERT INTO e13_notice_binding(label,id)
SELECT 'revoke-old',n.id FROM public.notifications n
WHERE n.user_id='e1300001-0000-4000-8000-000000000001'
 AND NOT EXISTS(SELECT 1 FROM e13_notice_binding b WHERE b.id=n.id);
SELECT ok((SELECT count(*)=1 FROM e13_notice_binding WHERE label='revoke-old')
 AND (SELECT a.revoked_at BETWEEN b.lower_at AND b.upper_at AND a.status='revoked'
  AND a.revoke_reason='admin_revoked' FROM public.listing_promotion_allocations a
  JOIN e13_campaign_binding c ON c.id=a.id JOIN e13_action_bounds b ON b.label='revoke-old'
  WHERE c.label='old'), 'normal revoke has checked time and one new notice');
UPDATE e13_expected x SET graph=jsonb_set(jsonb_set(jsonb_set(graph,
 ARRAY['allocations',b.id::text],pg_temp.e13_allocation(b.id,b.request_key,b.starts_at,
 now()+interval '15 days','revoked',a.revoked_at,'admin_revoked'),true),
 ARRAY['listings','e1300002-0000-4000-8000-000000000001'],
 graph->'listings'->'e1300002-0000-4000-8000-000000000001'||
 jsonb_build_object('is_featured',false,'featured_until',NULL,'updated_at',now()),true),
 ARRAY['notifications',n.id::text],pg_temp.e13_notice(n.id,'Spotlight removed',
 'Your listing E13 Spotlight no longer has Spotlight visibility.'),true)
FROM e13_campaign_binding b JOIN public.listing_promotion_allocations a ON a.id=b.id
CROSS JOIN e13_notice_binding n WHERE b.label='old' AND n.label='revoke-old';
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_expected),
 'revoke preserves full historical identity and old rows, with exact projection and notice');

-- Re-enable creates a separate active campaign while the old campaign remains historical.
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
INSERT INTO e13_action_bounds(label,lower_at) VALUES('enable-current',clock_timestamp());
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000002') AS actor_ok \gset
SELECT public.admin_set_listing_promotions('e1300002-0000-4000-8000-000000000001',
 true,now()+interval '20 days',NULL,'e1300001-0000-4000-8000-000000000002') IS NULL AS void_ok \gset
RESET ROLE;
UPDATE e13_action_bounds SET upper_at=clock_timestamp() WHERE label='enable-current';
SELECT ok(:'actor_ok'::boolean AND :'void_ok'::boolean,'second admin enable used real service actor and void contract');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'second enable actor restored');
INSERT INTO e13_campaign_binding(label,id,request_key,starts_at,ends_at)
SELECT 'current',a.id,a.request_key,a.starts_at,a.ends_at
FROM public.listing_promotion_allocations a
WHERE a.listing_id='e1300002-0000-4000-8000-000000000001'
 AND NOT EXISTS(SELECT 1 FROM e13_campaign_binding b WHERE b.id=a.id);
INSERT INTO e13_notice_binding(label,id)
SELECT 'enable-current',n.id FROM public.notifications n
WHERE n.user_id='e1300001-0000-4000-8000-000000000001'
 AND NOT EXISTS(SELECT 1 FROM e13_notice_binding b WHERE b.id=n.id);
SELECT ok((SELECT count(*)=1 AND bool_and(request_key ~
 '^admin:e1300001-0000-4000-8000-000000000002:[0-9a-f-]{36}$'
 AND ends_at=now()+interval '20 days' AND starts_at BETWEEN
 (SELECT lower_at FROM e13_action_bounds WHERE label='enable-current') AND
 (SELECT upper_at FROM e13_action_bounds WHERE label='enable-current'))
 FROM e13_campaign_binding WHERE label='current')
 AND (SELECT count(*)=1 FROM e13_notice_binding WHERE label='enable-current'),
 'new active campaign and notice have checked generated identities and time');
UPDATE e13_expected x SET graph=jsonb_set(jsonb_set(jsonb_set(graph,
 ARRAY['allocations',b.id::text],pg_temp.e13_allocation(b.id,b.request_key,b.starts_at,
 now()+interval '20 days','active',NULL,NULL),true),
 ARRAY['listings','e1300002-0000-4000-8000-000000000001'],
 graph->'listings'->'e1300002-0000-4000-8000-000000000001'||
 jsonb_build_object('is_featured',true,'featured_until',now()+interval '20 days','updated_at',now()),true),
 ARRAY['notifications',n.id::text],pg_temp.e13_notice(n.id,'Spotlight enabled',
 'Your listing E13 Spotlight now has Spotlight visibility.'),true)
FROM e13_campaign_binding b CROSS JOIN e13_notice_binding n
WHERE b.label='current' AND n.label='enable-current';
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_expected),
 'new active campaign and exact notice leave historical and every old row intact');

-- The expiry-only service RPC changes only the active campaign end.
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
INSERT INTO e13_action_bounds(label,lower_at) VALUES('expiry',clock_timestamp());
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000002') AS actor_ok \gset
SELECT public.admin_update_listing_promotion_expiry('e1300002-0000-4000-8000-000000000001',
 'spotlight',now()+interval '25 days','e1300001-0000-4000-8000-000000000002') IS NULL AS void_ok \gset
RESET ROLE;
UPDATE e13_action_bounds SET upper_at=clock_timestamp() WHERE label='expiry';
SELECT ok(:'actor_ok'::boolean AND :'void_ok'::boolean,'expiry-only public RPC used matching actual admin service actor and void contract');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'expiry actor restored');
INSERT INTO e13_notice_binding(label,id)
SELECT 'expiry',n.id FROM public.notifications n
WHERE n.user_id='e1300001-0000-4000-8000-000000000001'
 AND NOT EXISTS(SELECT 1 FROM e13_notice_binding b WHERE b.id=n.id);
SELECT is((SELECT count(*)::integer FROM e13_notice_binding WHERE label='expiry'),1,
 'expiry projection yields exactly one new notice identity');
UPDATE e13_expected x SET graph=jsonb_set(jsonb_set(jsonb_set(graph,
 ARRAY['allocations',b.id::text],pg_temp.e13_allocation(b.id,b.request_key,b.starts_at,
 now()+interval '25 days','active',NULL,NULL),true),
 ARRAY['listings','e1300002-0000-4000-8000-000000000001'],
 graph->'listings'->'e1300002-0000-4000-8000-000000000001'||
 jsonb_build_object('is_featured',true,'featured_until',now()+interval '25 days','updated_at',now()),true),
 ARRAY['notifications',n.id::text],pg_temp.e13_notice(n.id,'Spotlight expiry updated',
 'The Spotlight expiry was updated for E13 Spotlight.'),true)
FROM e13_campaign_binding b CROSS JOIN e13_notice_binding n
WHERE b.label='current' AND n.label='expiry';
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_expected),
 'expiry mutates only full active row end/touch, projection and notice; historical, neighbor and all baseline rows remain exact');

-- The actual admin browser role reads the active campaign; the historical row stays in the ledger.
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('authenticated','e1300001-0000-4000-8000-000000000002') AS reader_ok \gset
SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) AS campaigns
FROM public.get_admin_listing_promotion_campaigns() r
WHERE listing_id='e1300002-0000-4000-8000-000000000001' \gset
RESET ROLE;
SELECT ok(:'reader_ok'::boolean,'campaign read used actual authenticated admin subject');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT is(:'campaigns'::jsonb,(SELECT jsonb_build_array(jsonb_build_object(
 'listing_id','e1300002-0000-4000-8000-000000000001'::uuid,
 'title','E13 Spotlight','city','E13Unique','property_type','apartment','listing_type','sale',
 'price',210001,'cover_image_url',NULL,'is_featured',true,'priority_placement',0,
 'featured_until',now()+interval '25 days','priority_until',NULL,'status','active',
 'owner_id','e1300001-0000-4000-8000-000000000001'::uuid,'seller_name',NULL,
 'campaign_type','spotlight','source_type','admin','campaign_status','active',
 'starts_at',b.starts_at,'ends_at',now()+interval '25 days',
 'detail_views',0,'saves',0,'enquiries',0)) FROM e13_campaign_binding b WHERE b.label='current'),
 'admin read returns complete current campaign row and omits historical allocation');
SELECT ok(pg_temp.e13_neutral(),'read caller context restored');

CREATE TEMP TABLE e13_before_denial AS SELECT pg_temp.e13_graph() graph;
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000001","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000001'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000001' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000001') AS denial_actor_ok \gset
SELECT throws_ok($$SELECT public.admin_update_listing_promotion_expiry(
 'e1300002-0000-4000-8000-000000000001','spotlight',now()+interval '26 days',
 'e1300001-0000-4000-8000-000000000001')$$,
 '42501','platform_admin_required','real non-admin actor cannot change expiry');
RESET ROLE;
SELECT ok(:'denial_actor_ok'::boolean,'non-admin denial used matching actual service identity');
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_before_denial),
 'non-admin denial preserves its entire prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'non-admin denial context restored');

TRUNCATE e13_before_denial;
INSERT INTO e13_before_denial SELECT pg_temp.e13_graph();
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000002') AS denial_actor_ok \gset
SELECT throws_ok($$SELECT public.admin_update_listing_promotion_expiry(
 'e1300002-0000-4000-8000-000000000001','spotlight',now()-interval '1 day',
 'e1300001-0000-4000-8000-000000000002')$$,
 '22023','promotion_expiry_must_be_future','past expiry rejected');
RESET ROLE;
SELECT ok(:'denial_actor_ok'::boolean,'past expiry denial used matching real admin service identity');
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_before_denial),
 'past expiry denial preserves its complete prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'past expiry denial context restored');

TRUNCATE e13_before_denial;
INSERT INTO e13_before_denial SELECT pg_temp.e13_graph();
SELECT set_config('request.jwt.claim.sub','e1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"e1300001-0000-4000-8000-000000000002","role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT current_user='service_role' AND session_user='postgres'
 AND auth.uid()='e1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='e1300001-0000-4000-8000-000000000002' AND pg_temp.e13_identity('service_role','e1300001-0000-4000-8000-000000000002') AS denial_actor_ok \gset
SELECT throws_ok($$SELECT public.admin_update_listing_promotion_expiry(
 'e1300002-0000-4000-8000-000000000002','spotlight',now()+interval '26 days',
 'e1300001-0000-4000-8000-000000000002')$$,
 'P0002','active_promotion_not_found','neighbor listing without an active campaign rejected');
RESET ROLE;
SELECT ok(:'denial_actor_ok'::boolean,'missing-active denial used matching real admin service identity');
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_before_denial),
 'missing-active denial preserves historical, current, neighbor and all old rows');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(pg_temp.e13_neutral(),'missing-active denial context restored');
SELECT ok(pg_temp.e13_graph()=(SELECT graph FROM e13_expected),
 'all successful and denied actions retain the independent complete business graph');

SELECT * FROM finish();
ROLLBACK;
DO $$ DECLARE b record; actual_settings jsonb; actual_seqs jsonb; BEGIN
 SELECT * INTO STRICT b FROM e13_pre;
 IF b.pid IS DISTINCT FROM pg_backend_pid() OR b.db_role IS DISTINCT FROM current_user
 OR b.session_role IS DISTINCT FROM session_user
 OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.origin IS DISTINCT FROM current_setting('session_replication_role')
 OR b.socket IS DISTINCT FROM inet_server_addr()
 OR b.owner_marker IS DISTINCT FROM current_setting('maiprop.owner_auth_trigger_active',true)
 OR b.actor IS DISTINCT FROM auth.uid() OR b.jwt IS DISTINCT FROM auth.jwt()
 OR NULLIF(b.sub_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.sub',true),'')
 OR NULLIF(b.claims,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claims',true),'')
 OR NULLIF(b.role_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.role',true),'')
 THEN RAISE EXCEPTION 'admin expiry same-backend role, socket, marker or JWT restoration failed'; END IF;
 IF b.bindings IS DISTINCT FROM pg_temp.e13_bindings() THEN
  RAISE EXCEPTION 'admin expiry installed body/ACL/default/trigger/policy binding drift'; END IF;
 IF b.graph IS DISTINCT FROM pg_temp.e13_graph() THEN
  RAISE EXCEPTION 'admin expiry full rollback graph differs'; END IF;
 SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) INTO actual_seqs FROM pg_sequences;
 IF b.sequences IS DISTINCT FROM actual_seqs THEN
  RAISE EXCEPTION 'admin expiry named nontransactional sequence changed'; END IF;
 SELECT jsonb_object_agg(name,setting) INTO actual_settings FROM pg_settings;
 IF b.settings IS DISTINCT FROM actual_settings THEN
  RAISE EXCEPTION 'admin expiry full settings changed'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()
  AND relname LIKE 'e13_%' AND relname<>'e13_pre')
 OR EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema()
  AND proname LIKE 'e13_%' AND proname NOT IN ('e13_graph','e13_bindings'))
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'e1300001-%')
 OR EXISTS(SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'e1300001-%')
 OR EXISTS(SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'e1300001-%')
 OR EXISTS(SELECT 1 FROM public.listings WHERE id::text LIKE 'e1300002-%')
 OR EXISTS(SELECT 1 FROM public.listing_promotion_allocations WHERE listing_id::text LIKE 'e1300002-%')
 OR EXISTS(SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'e1300001-%')
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 THEN RAISE EXCEPTION 'admin expiry fixture/temp/source/prepared residue'; END IF;
END $$;
SELECT 'E13_POST',pg_backend_pid(),current_user,session_user,
 current_setting('maiprop.test_disposable_database',true),current_setting('session_replication_role'),
 encode(digest(pg_temp.e13_graph()::text,'sha256'),'hex'),
 encode(digest(pg_temp.e13_bindings()::text,'sha256'),'hex'),
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences);
