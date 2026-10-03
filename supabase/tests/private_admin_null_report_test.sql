\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR current_user IS DISTINCT FROM 'postgres' OR inet_server_addr() IS NOT NULL
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'Matching postgres-owned disposable socket database with normal triggers required'; END IF;
END $$;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(29);

SELECT ok(has_function_privilege('authenticated','public.admin_user_activity_snapshot(integer,integer)','EXECUTE')
 AND has_function_privilege('authenticated','private.admin_user_activity_snapshot(integer,integer)','EXECUTE')
 AND has_function_privilege('authenticated','public.get_admin_listing_promotion_campaigns()','EXECUTE')
 AND has_function_privilege('authenticated','private.get_admin_listing_promotion_campaigns_internal()','EXECUTE')
 AND has_schema_privilege('authenticated','private','USAGE'),
 'authenticated has the installed public and delegated private grants');
SELECT ok(NOT has_function_privilege('anon','public.admin_user_activity_snapshot(integer,integer)','EXECUTE')
 AND NOT has_function_privilege('anon','public.get_admin_listing_promotion_campaigns()','EXECUTE'),
 'anon lacks both public RPC grants');

INSERT INTO auth.users(id,email) VALUES
 ('d3130001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('d3130001-0000-4000-8000-000000000002','d13-null-actor@example.test'),
 ('d3130001-0000-4000-8000-000000000003','d13-target-seller@example.test'),
 ('d3130001-0000-4000-8000-000000000004','d13-onboarded-buyer@example.test');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d3130001-0000-4000-8000-000000000003','seller','seller');
SELECT public.complete_onboarding_role_for_user('d3130001-0000-4000-8000-000000000004','buyer','buyer');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,status)
 VALUES('d3130002-0000-4000-8000-000000000001','d3130001-0000-4000-8000-000000000003',
 'D13 other seller listing','Athens',250000,80,'apartment','active');
RESET ROLE;
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3130001-0000-4000-8000-000000000002'),
 NULL::text,'normal auth trigger leaves pre-onboarding actor role NULL');
SELECT is(private.has_platform_admin('d3130001-0000-4000-8000-000000000002'),false,
 'private predicate maps natural NULL role to false');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3130001-0000-4000-8000-000000000001'),
 'admin','normal owner seed has admin role');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3130001-0000-4000-8000-000000000004'),
 'buyer','normal onboarding creates known-role nonadmin');
SELECT is((SELECT owner_id FROM public.listings WHERE id='d3130002-0000-4000-8000-000000000001'),
 'd3130001-0000-4000-8000-000000000003'::uuid,'distinguishable listing belongs to another actor');

CREATE FUNCTION pg_temp.d13_state() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p),
  'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(l)),'{}'::jsonb) FROM public.listings l),
  'sessions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)),'{}'::jsonb) FROM auth.sessions s),
  'searches',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(e)),'{}'::jsonb) FROM public.user_search_events e),
  'auth_events',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(e)),'{}'::jsonb) FROM public.user_auth_activity_events e),
  'allocations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.listing_promotion_allocations a),
  'view_events',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(e)),'{}'::jsonb) FROM public.listing_view_events e),
  'favorites',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(f)),'{}'::jsonb) FROM public.favorites f),
  'conversations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(c)),'{}'::jsonb) FROM public.conversations c)
 )
$$;
CREATE TEMP TABLE d13_before AS SELECT pg_temp.d13_state() state;

CREATE TEMP TABLE d13_result(label text PRIMARY KEY,sqlstate text,message text,payload jsonb);
GRANT INSERT ON d13_result TO authenticated,anon;
CREATE FUNCTION pg_temp.d13_attempt(label text, command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_payload jsonb; v_state text; v_message text;
BEGIN
 BEGIN
  EXECUTE command INTO v_payload;
  INSERT INTO d13_result VALUES(label,NULL,NULL,v_payload);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO d13_result VALUES(label,v_state,v_message,NULL);
 END;
END $$;

SELECT set_config('request.jwt.claim.sub','d3130001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"d3130001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE authenticated;
SELECT is(auth.uid(),'d3130001-0000-4000-8000-000000000002'::uuid,'real authenticated role resolves its own subject');
SELECT is(private.has_platform_admin(),false,'private default uses authenticated NULL-role subject');
SELECT is(private.has_platform_admin('d3130001-0000-4000-8000-000000000001'),true,'private predicate admits admin');
SELECT is(private.has_platform_admin('d3130001-0000-4000-8000-000000000004'),false,'private predicate denies buyer');
SELECT is(private.has_platform_admin('d3130001-0000-4000-8000-000000000099'),false,'private predicate denies missing identity');
SELECT is(private.has_platform_admin(NULL::uuid),false,'private predicate denies NULL identity');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id='d3130001-0000-4000-8000-000000000002'),
 1,'NULL-role actor retains legitimate owner profile read');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id='d3130001-0000-4000-8000-000000000003'),
 0,'NULL-role actor cannot read another profile through RLS');
SELECT pg_temp.d13_attempt('null_snapshot',
 $$SELECT public.admin_user_activity_snapshot(30,100)$$);
SELECT pg_temp.d13_attempt('null_campaign',
 $$SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.get_admin_listing_promotion_campaigns() c$$);
RESET ROLE;
SELECT sqlstate,message,
 coalesce(payload->'users' @> '[{"email":"d13-target-seller@example.test"}]'::jsonb,false) AS target_email,
 coalesce(payload @> '[{"listing_id":"d3130002-0000-4000-8000-000000000001","owner_id":"d3130001-0000-4000-8000-000000000003"}]'::jsonb,false) AS cross_owner_listing
 FROM d13_result ORDER BY label;
SELECT is((SELECT sqlstate||':'||message FROM d13_result WHERE label='null_snapshot'),
 '42501:admin_user_activity_snapshot is restricted to platform admins',
 'NULL-role authenticated actor must be denied snapshot');
SELECT is((SELECT sqlstate||':'||message FROM d13_result WHERE label='null_campaign'),
 '42501:platform_admin_required','NULL-role authenticated actor must be denied campaign');

SELECT set_config('request.jwt.claim.sub','d3130001-0000-4000-8000-000000000004',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"d3130001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d13_attempt('buyer_snapshot',$$SELECT public.admin_user_activity_snapshot(30,100)$$);
SELECT pg_temp.d13_attempt('buyer_campaign',
 $$SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.get_admin_listing_promotion_campaigns() c$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d13_result WHERE label='buyer_snapshot'),'42501','buyer snapshot denied');
SELECT is((SELECT sqlstate FROM d13_result WHERE label='buyer_campaign'),'42501','buyer campaign denied');

SELECT set_config('request.jwt.claim.sub','d3130001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"d3130001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d13_attempt('admin_snapshot',$$SELECT public.admin_user_activity_snapshot(30,100)$$);
SELECT pg_temp.d13_attempt('admin_campaign',
 $$SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.get_admin_listing_promotion_campaigns() c$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d13_result WHERE label='admin_snapshot'),NULL::text,'legitimate admin snapshot succeeds');
SELECT is((SELECT sqlstate FROM d13_result WHERE label='admin_campaign'),NULL::text,'legitimate admin campaign succeeds');
SELECT ok((SELECT payload->'users' @> '[{"email":"d13-target-seller@example.test"}]'::jsonb
 FROM d13_result WHERE label='admin_snapshot'),
 'legitimate admin snapshot returns exact other-user email');
SELECT ok((SELECT payload @> '[{"listing_id":"d3130002-0000-4000-8000-000000000001","owner_id":"d3130001-0000-4000-8000-000000000003"}]'::jsonb
 FROM d13_result WHERE label='admin_campaign'),
 'legitimate admin campaign returns exact other-owner listing');

SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d13_attempt('no_subject_snapshot',$$SELECT public.admin_user_activity_snapshot(30,100)$$);
SELECT pg_temp.d13_attempt('no_subject_campaign',
 $$SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.get_admin_listing_promotion_campaigns() c$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d13_result WHERE label='no_subject_snapshot'),'42501','authenticated without subject denies snapshot');
SELECT is((SELECT sqlstate FROM d13_result WHERE label='no_subject_campaign'),'42501','authenticated without subject denies campaign');

SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"anon"}',true);
SET LOCAL ROLE anon;
SELECT pg_temp.d13_attempt('anon_snapshot',$$SELECT public.admin_user_activity_snapshot(30,100)$$);
SELECT pg_temp.d13_attempt('anon_campaign',
 $$SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]'::jsonb) FROM public.get_admin_listing_promotion_campaigns() c$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d13_result WHERE label='anon_snapshot'),'42501','anon snapshot denied by ACL');
SELECT is((SELECT sqlstate FROM d13_result WHERE label='anon_campaign'),'42501','anon campaign denied by ACL');
SELECT is(pg_temp.d13_state(),(SELECT state FROM d13_before),
 'all report attempts preserve complete inspected user, profile, listing, event and campaign state');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain active');
SELECT * FROM finish();
ROLLBACK;
