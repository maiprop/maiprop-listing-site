\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_d0_[a-z0-9_]{6,48}|maiprop_t13listing_[0-9]{8}_create[0-9]{2})$'
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source','maiprop_d0_20261003_refresh01')
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 THEN RAISE EXCEPTION 'listing suite requires owned disposable socket clone and origin triggers'; END IF;
END $$;
-- Register lazy pg_trgm settings before capturing the exact settings baseline.
DO $$ BEGIN PERFORM extensions.similarity('listing','listing'); END $$;

CREATE FUNCTION pg_temp.list13_bindings() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
  'sha256',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
  'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig)))
  FROM pg_proc p WHERE p.oid IN (
   'public.create_listing_for_user(jsonb,uuid)'::regprocedure,
   'private.create_listing_for_actor(jsonb,uuid)'::regprocedure,
   'private.assert_listing_payload_keys(jsonb)'::regprocedure,
   'private.listing_client_writable_columns()'::regprocedure,
   'private.has_org_permission(uuid,text,uuid)'::regprocedure,
   'private.has_platform_admin(uuid)'::regprocedure,
   'public.has_platform_admin(uuid)'::regprocedure,
   'public.check_listing_limit()'::regprocedure,
   'private.check_listing_quota_for_owner(uuid)'::regprocedure,
   'private.check_listing_quota_for_principal(uuid,uuid)'::regprocedure,
   'public.get_listing_limit(uuid)'::regprocedure,
   'public.authoritative_role(uuid)'::regprocedure,
   'public.normalize_location_text(text)'::regprocedure,
   'public.expand_location_search_aliases(text)'::regprocedure,
   'private.enforce_listing_project_owner()'::regprocedure,
   'private.guard_deleted_account_write()'::regprocedure,
   'private.guard_listing_promotion_projection()'::regprocedure,
   'public.release_expired_firesale_reservations(uuid)'::regprocedure,
   'public.audit_firesale_interest_mutation()'::regprocedure,
   'public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure)
   OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN
    ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,
     'public.organizations'::regclass,'public.organization_memberships'::regclass)
    AND NOT tgisinternal)),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,
  'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true),
  'function',t.tgfoid::regprocedure::text) ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
  FROM pg_trigger t WHERE t.tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,
   'public.listings'::regclass,'public.organizations'::regclass,
   'public.organization_memberships'::regclass) AND NOT t.tgisinternal),
 'acl',jsonb_build_object(
  'public_authenticated',has_schema_privilege('authenticated','public','USAGE'),
  'private_authenticated',has_schema_privilege('authenticated','private','USAGE'),
  'wrapper_authenticated',has_function_privilege('authenticated','public.create_listing_for_user(jsonb,uuid)','EXECUTE'),
  'wrapper_anon',has_function_privilege('anon','public.create_listing_for_user(jsonb,uuid)','EXECUTE'),
  'helper_authenticated',has_function_privilege('authenticated','private.create_listing_for_actor(jsonb,uuid)','EXECUTE'),
  'helper_anon',has_function_privilege('anon','private.create_listing_for_actor(jsonb,uuid)','EXECUTE')))
$$;
CREATE FUNCTION pg_temp.list13_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p),
 'public_profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p),
 'organizations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(o)),'{}'::jsonb) FROM public.organizations o),
 'memberships',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(m)),'{}'::jsonb) FROM public.organization_memberships m),
 'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(l)),'{}'::jsonb) FROM public.listings l),
 'projects',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(p)),'{}'::jsonb) FROM public.projects p),
 'images',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}'::jsonb) FROM public.listing_images i),
 'allocations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.listing_promotion_allocations a),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n),
 'catalogue_publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY publication_id),'[]'::jsonb) FROM private.public_catalogue_publications p),
 'catalogue_current',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY singleton),'[]'::jsonb) FROM private.public_catalogue_current c),
 'catalogue_versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY version_id),'[]'::jsonb) FROM private.public_catalogue_versions v))
$$;
CREATE TEMP TABLE list13_baseline AS SELECT pg_backend_pid() pid,current_user db_role,
 session_user session_role,current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') origin,auth.uid() actor,auth.jwt() jwt,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 pg_temp.list13_bindings() bindings,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences) seqs,
 (SELECT jsonb_object_agg(name,setting) FROM pg_settings) settings,
 pg_temp.list13_graph() graph;
SELECT 'LIST13_PRE',pid,db_role,session_role,marker,origin,actor,jwt,
 sub_claim,claims,role_claim,bindings,seqs,
 encode(digest(settings::text,'sha256'),'hex') settings_sha256,
 encode(digest(graph::text,'sha256'),'hex') graph_sha256 FROM list13_baseline;

BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SET LOCAL client_min_messages=warning;
SELECT plan(41);
SELECT is(current_setting('session_replication_role'),'origin','ordinary triggers stay active');
SELECT is((SELECT count(*)::integer FROM pg_trigger t WHERE t.tgrelid IN
 ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,
 'public.organizations'::regclass,'public.organization_memberships'::regclass)
 AND NOT t.tgisinternal AND t.tgenabled<>'O'),0,'relevant normal triggers enabled');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('private.create_listing_for_actor(jsonb,uuid)','3a9322852a0d2f0165bdcdce175957eb5c5fbb581c89e4d38cc6c61a03b9c412'),
 ('public.create_listing_for_user(jsonb,uuid)','201acef7fe88e8a70344dd78ca9252cf6d572783e2fce78a97f40e6264a8c3d6'),
 ('public.release_expired_firesale_reservations(uuid)','d407139144d8ad3a0ed4bfe49edca50e14a465b21c8fe3f993816dcfe37fbc08'),
 ('public.audit_firesale_interest_mutation()','7085921d35e04cc57beddda7b0b495736cda701374596264e02c7d960d847c1c'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce'),
 ('public.admin_review_invitation_request(uuid,uuid,text,text,text)','4f25f37c8f7eb1e0a0c89d6bcf54108921710973fa38fe7f97289b171483b511')) x(sig,sha)),
 'creation and five October changed routine hashes exact');
SELECT is((SELECT bindings->'acl' FROM list13_baseline),
 jsonb_build_object('public_authenticated',true,'private_authenticated',true,
 'wrapper_authenticated',true,'wrapper_anon',false,'helper_authenticated',true,'helper_anon',false),
 'effective schema and creation EXECUTE boundary exact');
SELECT is((SELECT graph FROM list13_baseline),pg_temp.list13_graph(),'fixture namespace starts from unchanged full graph');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE 'a1310001-%'),0,'auth namespace unused');
SELECT is((SELECT count(*)::integer FROM public.organizations WHERE id::text LIKE 'a1310002-%'),0,'organization namespace unused');

INSERT INTO auth.users(id,email)
SELECT ('a1310001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 't13listing-'||n||'@example.test' FROM generate_series(1,3)n;
SELECT set_config('request.jwt.claim.sub','',true),
 set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user(
 ('a1310001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'seller','seller')
FROM generate_series(1,3)n;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.role','',true);
INSERT INTO public.organizations(id,name,slug,created_by)
VALUES('a1310002-0000-4000-8000-000000000001','T13 listing managed org','t13-listing-managed-org',
 'a1310001-0000-4000-8000-000000000002');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id::text LIKE 'a1310001-%'),3,
 'normal auth and onboarding yield three seller profiles');
SELECT is((SELECT bool_and(private.authoritative_role(user_id)::text='seller')
 FROM public.profiles WHERE user_id::text LIKE 'a1310001-%'),true,
 'all actors have genuine seller authority');
SELECT ok(private.has_org_permission('a1310002-0000-4000-8000-000000000001',
 'listing:manage','a1310001-0000-4000-8000-000000000002')
 AND NOT private.has_org_permission('a1310002-0000-4000-8000-000000000001',
 'listing:manage','a1310001-0000-4000-8000-000000000003'),
 'real org manager admitted and unrelated seller excluded');
SELECT ok(public.get_listing_limit('a1310001-0000-4000-8000-000000000001')>0
 AND public.get_listing_limit('a1310001-0000-4000-8000-000000000002')>0,
 'both seller fixtures have real positive listing entitlement');

-- Independently model setup from literals and copied defaults; generated IDs
-- only bind row identities, never role, membership or listing business facts.
CREATE TEMP TABLE list13_expected_user (LIKE auth.users INCLUDING DEFAULTS);
INSERT INTO list13_expected_user(id,email)
SELECT ('a1310001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 't13listing-'||n||'@example.test' FROM generate_series(1,3)n;
CREATE TEMP TABLE list13_expected_profile (LIKE public.profiles INCLUDING DEFAULTS);
INSERT INTO list13_expected_profile(id,user_id,role,participant_type,created_at,updated_at)
SELECT p.id,('a1310001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'seller','seller',now(),now()
FROM generate_series(1,3)n JOIN public.profiles p
 ON p.user_id=('a1310001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
CREATE TEMP TABLE list13_expected_public_profile (LIKE public.profiles_public INCLUDING DEFAULTS);
INSERT INTO list13_expected_public_profile(user_id,role,owner_participant_type)
SELECT user_id,'seller','seller' FROM list13_expected_profile;
CREATE TEMP TABLE list13_expected_org (LIKE public.organizations INCLUDING DEFAULTS);
INSERT INTO list13_expected_org(id,name,slug,created_by)
VALUES('a1310002-0000-4000-8000-000000000001','T13 listing managed org','t13-listing-managed-org',
 'a1310001-0000-4000-8000-000000000002');
CREATE TEMP TABLE list13_expected_membership (LIKE public.organization_memberships INCLUDING DEFAULTS);
INSERT INTO list13_expected_membership(id,organization_id,user_id,role,status)
SELECT m.id,'a1310002-0000-4000-8000-000000000001',
 'a1310001-0000-4000-8000-000000000002','owner','active'
FROM public.organization_memberships m WHERE m.organization_id='a1310002-0000-4000-8000-000000000001';
CREATE TEMP TABLE list13_expected AS SELECT graph FROM list13_baseline;
UPDATE list13_expected SET graph=graph || jsonb_build_object(
 'users',graph->'users'||(SELECT jsonb_object_agg(id::text,to_jsonb(u)) FROM list13_expected_user u),
 'profiles',graph->'profiles'||(SELECT jsonb_object_agg(user_id::text,to_jsonb(p)) FROM list13_expected_profile p),
 'public_profiles',graph->'public_profiles'||(SELECT jsonb_object_agg(user_id::text,to_jsonb(p)) FROM list13_expected_public_profile p),
 'organizations',graph->'organizations'||(SELECT jsonb_object_agg(id::text,to_jsonb(o)) FROM list13_expected_org o),
 'memberships',graph->'memberships'||(SELECT jsonb_object_agg(id::text,to_jsonb(m)) FROM list13_expected_membership m));
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_expected),
 'entire normal setup graph matches literals, defaults, and bound generated identities');

CREATE TEMP TABLE list13_expected_listing (LIKE public.listings INCLUDING DEFAULTS);
-- Case 1: personal sale via the actual browser role and public RPC.
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"a1310001-0000-4000-8000-000000000001","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1310001-0000-4000-8000-000000000001'::uuid
 AND auth.jwt()->>'sub'='a1310001-0000-4000-8000-000000000001' AS actor_ok \gset
SELECT public.create_listing_for_user('{"title":"T13 Personal Sale","city":"Athens","price":240000,"sqm":80,"property_type":"apartment","listing_type":"sale","status":"active"}'::jsonb,NULL) AS result \gset
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'personal creation used real authenticated seller');
SELECT ok((:'result'::jsonb->>'id')::uuid IS NOT NULL
 AND NOT ((SELECT graph->'listings' FROM list13_expected) ? (:'result'::jsonb->>'id')),
 'personal result supplies a fresh listing identity');
SELECT is(:'result'::jsonb,jsonb_build_object('id',(:'result'::jsonb->>'id')::uuid,
 'owner_id','a1310001-0000-4000-8000-000000000001'::uuid,'organization_id',NULL,
 'status','active','listing_type','sale','updated_at',now()),
 'personal result has exactly six contract keys and values');
INSERT INTO list13_expected_listing(id,owner_id,title,city,price,sqm,property_type,listing_type,status,price_per_sqm)
VALUES((:'result'::jsonb->>'id')::uuid,'a1310001-0000-4000-8000-000000000001',
 'T13 Personal Sale','Athens',240000,80,'apartment','sale','active',3000);
UPDATE list13_expected_listing SET location_search_text=
 public.expand_location_search_aliases(public.normalize_location_text(
 coalesce(title,'')||' '||coalesce(address,'')||' '||coalesce(city,'')||' '||
 coalesce(region,'')||' '||coalesce(postal_code,'')));
UPDATE list13_expected SET graph=jsonb_set(graph,ARRAY['listings',(:'result'::jsonb->>'id')],
 (SELECT to_jsonb(l) FROM list13_expected_listing l WHERE l.id=(:'result'::jsonb->>'id')::uuid),true);
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_expected),
 'personal sale adds one independently modeled complete row and preserves all old rows and related graph');
SELECT is((SELECT count(*)::integer FROM public.listings WHERE id=(:'result'::jsonb->>'id')::uuid),1,
 'personal result identifies exactly one persisted listing');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'personal caller context restored');

-- Case 2: real active organization manager, separate owner and scope.
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"a1310001-0000-4000-8000-000000000002","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1310001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='a1310001-0000-4000-8000-000000000002' AS actor_ok \gset
SELECT public.create_listing_for_user('{"title":"T13 Managed Sale","city":"Athens","price":315000,"sqm":105,"property_type":"apartment","listing_type":"sale","status":"draft"}'::jsonb,
 'a1310002-0000-4000-8000-000000000001') AS result \gset
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'managed creation used real authenticated organization manager');
SELECT ok((:'result'::jsonb->>'id')::uuid IS NOT NULL
 AND NOT ((SELECT graph->'listings' FROM list13_expected) ? (:'result'::jsonb->>'id')),
 'managed result supplies a second fresh listing identity');
SELECT is(:'result'::jsonb,jsonb_build_object('id',(:'result'::jsonb->>'id')::uuid,
 'owner_id','a1310001-0000-4000-8000-000000000002'::uuid,
 'organization_id','a1310002-0000-4000-8000-000000000001'::uuid,
 'status','draft','listing_type','sale','updated_at',now()),
 'managed result has exactly six contract keys and values');
INSERT INTO list13_expected_listing(id,owner_id,organization_id,title,city,price,sqm,property_type,listing_type,status,price_per_sqm)
VALUES((:'result'::jsonb->>'id')::uuid,'a1310001-0000-4000-8000-000000000002',
 'a1310002-0000-4000-8000-000000000001','T13 Managed Sale','Athens',315000,105,
 'apartment','sale','draft',3000);
UPDATE list13_expected_listing SET location_search_text=
 public.expand_location_search_aliases(public.normalize_location_text(
 coalesce(title,'')||' '||coalesce(address,'')||' '||coalesce(city,'')||' '||
 coalesce(region,'')||' '||coalesce(postal_code,'')));
UPDATE list13_expected SET graph=jsonb_set(graph,ARRAY['listings',(:'result'::jsonb->>'id')],
 (SELECT to_jsonb(l) FROM list13_expected_listing l WHERE l.id=(:'result'::jsonb->>'id')::uuid),true);
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_expected),
 'managed sale adds one independently modeled complete row and preserves full graph');
SELECT is((SELECT count(*)::integer FROM public.listings WHERE id=(:'result'::jsonb->>'id')::uuid),1,
 'managed result identifies exactly one persisted listing');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'managed caller context restored');

-- The same authorized manager cannot publish active tenant inventory on the
-- organization's free plan. This is the real quota trigger, not a fake grant.
CREATE TEMP TABLE list13_denial_before AS SELECT pg_temp.list13_graph() graph;
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"a1310001-0000-4000-8000-000000000002","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1310001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='a1310001-0000-4000-8000-000000000002' AS actor_ok \gset
SELECT throws_ok($q$SELECT public.create_listing_for_user('{"title":"Denied Active Org Sale","city":"Athens","price":315000,"sqm":105,"property_type":"apartment","listing_type":"sale","status":"active"}'::jsonb,'a1310002-0000-4000-8000-000000000001')$q$,
 '42501','organization_listing_plan_required','free organization cannot publish active listing');
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'free-plan publish denial used actual authenticated manager');
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_denial_before),
 'free-plan publish denial preserves own complete prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'free-plan publish caller restored');

-- Each denial has its own full before graph and identity restoration.
TRUNCATE list13_denial_before; INSERT INTO list13_denial_before SELECT pg_temp.list13_graph();
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"sub":"a1310001-0000-4000-8000-000000000003","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1310001-0000-4000-8000-000000000003'::uuid
 AND auth.jwt()->>'sub'='a1310001-0000-4000-8000-000000000003' AS actor_ok \gset
SELECT throws_ok($q$SELECT public.create_listing_for_user('{"title":"Denied Org Sale","city":"Athens","price":200000,"sqm":80,"property_type":"apartment","listing_type":"sale","status":"active"}'::jsonb,'a1310002-0000-4000-8000-000000000001')$q$,
 '42501','organization_listing_not_managed','unmanaged organization creation denied');
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'unmanaged organization denial used actual authenticated outsider');
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_denial_before),
 'unmanaged organization denial preserves own complete prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'unmanaged organization caller restored');

TRUNCATE list13_denial_before; INSERT INTO list13_denial_before SELECT pg_temp.list13_graph();
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"a1310001-0000-4000-8000-000000000001","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1310001-0000-4000-8000-000000000001'::uuid
 AND auth.jwt()->>'sub'='a1310001-0000-4000-8000-000000000001' AS actor_ok \gset
SELECT throws_ok($q$SELECT public.create_listing_for_user('{"title":"Denied Tag Sale","city":"Athens","price":200000,"sqm":80,"property_type":"apartment","listing_type":"sale","status":"active","tags":["source:maiprop-os"]}'::jsonb,NULL)$q$,
 '42501','listing_reserved_tags_not_writable: source:maiprop-os','browser cannot forge auction provenance');
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'reserved tag denial used actual authenticated owner');
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_denial_before),
 'reserved tag denial preserves own complete prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'reserved tag caller restored');

TRUNCATE list13_denial_before; INSERT INTO list13_denial_before SELECT pg_temp.list13_graph();
SELECT set_config('request.jwt.claim.sub','a1310001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"a1310001-0000-4000-8000-000000000001","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1310001-0000-4000-8000-000000000001'::uuid
 AND auth.jwt()->>'sub'='a1310001-0000-4000-8000-000000000001' AS actor_ok \gset
SELECT throws_ok($q$SELECT public.create_listing_for_user('{"title":"Denied Project Sale","city":"Athens","price":200000,"sqm":80,"property_type":"apartment","listing_type":"new_build","status":"active"}'::jsonb,NULL)$q$,
 '42501','new_build_requires_project_boundary','project ad must use project workflow');
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'project-boundary denial used actual authenticated owner');
SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_denial_before),
 'project-boundary denial preserves own complete prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'project-boundary caller restored');

SELECT is(pg_temp.list13_graph(),(SELECT graph FROM list13_expected),
 'all cases end at independently predicted complete graph');
SELECT * FROM finish();
ROLLBACK;

-- PRE/POST is the same backend; only the outer transaction is rolled back.
DO $$ DECLARE b record; now_seqs jsonb; now_settings jsonb; BEGIN
 SELECT * INTO STRICT b FROM list13_baseline;
 IF b.pid IS DISTINCT FROM pg_backend_pid() OR b.db_role IS DISTINCT FROM current_user
 OR b.session_role IS DISTINCT FROM session_user
 OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.origin IS DISTINCT FROM current_setting('session_replication_role')
 OR b.actor IS DISTINCT FROM auth.uid() OR b.jwt IS DISTINCT FROM auth.jwt()
 OR NULLIF(b.sub_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.sub',true),'')
 OR NULLIF(b.claims,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claims',true),'')
 OR NULLIF(b.role_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.role',true),'')
 THEN RAISE EXCEPTION 'listing same-backend role/JWT/marker restoration failed'; END IF;
 IF b.bindings IS DISTINCT FROM pg_temp.list13_bindings()
 THEN RAISE EXCEPTION 'listing installed binding or ACL changed'; END IF;
 IF b.graph IS DISTINCT FROM pg_temp.list13_graph()
 THEN RAISE EXCEPTION 'listing rollback full graph differs'; END IF;
 SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) INTO now_seqs FROM pg_sequences;
 IF b.seqs IS DISTINCT FROM now_seqs THEN RAISE EXCEPTION 'listing unexpected named sequence consumption'; END IF;
 SELECT jsonb_object_agg(name,setting) INTO now_settings FROM pg_settings;
 IF b.settings IS DISTINCT FROM now_settings THEN RAISE EXCEPTION 'listing session settings changed'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()
  AND relname LIKE 'list13_%' AND relname<>'list13_baseline')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema()
  AND proname LIKE 'list13_%' AND proname NOT IN ('list13_bindings','list13_graph'))
 THEN RAISE EXCEPTION 'listing suite temp residue remains'; END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'a1310001-%')
 OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'a1310001-%')
 OR EXISTS (SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'a1310001-%')
 OR EXISTS (SELECT 1 FROM public.organizations WHERE id::text LIKE 'a1310002-%')
 OR EXISTS (SELECT 1 FROM public.organization_memberships WHERE organization_id::text LIKE 'a1310002-%')
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 THEN RAISE EXCEPTION 'listing fixture/source residue remains'; END IF;
END $$;
SELECT 'LIST13_POST',pg_backend_pid(),current_user,session_user,
 current_setting('maiprop.test_disposable_database',true),current_setting('session_replication_role'),
 auth.uid(),auth.jwt(),current_setting('request.jwt.claim.sub',true),
 current_setting('request.jwt.claims',true),current_setting('request.jwt.claim.role',true),
 pg_temp.list13_bindings(),
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences),
 encode(digest((SELECT jsonb_object_agg(name,setting) FROM pg_settings)::text,'sha256'),'hex'),
 encode(digest(pg_temp.list13_graph()::text,'sha256'),'hex');
DROP TABLE list13_baseline;
DROP FUNCTION pg_temp.list13_bindings();
DROP FUNCTION pg_temp.list13_graph();
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'list13_%')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'list13_%')
 THEN RAISE EXCEPTION 'listing cleanup left temp objects'; END IF; END $$;
SELECT 'LIST13_SAME_BACKEND_CLEAN';
