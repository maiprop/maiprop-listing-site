\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
    OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
    OR current_user IS DISTINCT FROM 'postgres' OR inet_server_addr() IS NOT NULL
    OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 THEN RAISE EXCEPTION 'Matching postgres-owned disposable socket database with normal triggers required'; END IF;
END $$;
SET LOCAL search_path=public,extensions;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(20);
INSERT INTO auth.users(id,email) VALUES
 ('d3220001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('d3220001-0000-4000-8000-000000000002','d3-helper-buyer@example.test'),
 ('d3220001-0000-4000-8000-000000000003','d3-helper-unset@example.test');
SELECT set_config('maiprop.owner_auth_trigger_active','false',true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('d3220001-0000-4000-8000-000000000002','buyer','buyer');
RESET ROLE;
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000001'),
 'admin','normal owner auth seed yields authoritative admin');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000002'),
 'buyer','normal onboarding yields nonadmin');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000003'),
 NULL::text,'normal pre-onboarding identity has NULL role');
SELECT is(public.has_platform_admin('d3220001-0000-4000-8000-000000000001'),true,'admin true');
SELECT is(public.has_platform_admin('d3220001-0000-4000-8000-000000000002'),false,'buyer false');
SELECT is(public.has_platform_admin('d3220001-0000-4000-8000-000000000003'),false,'NULL-role false');
SELECT is(public.has_platform_admin('d3220001-0000-4000-8000-000000000099'),false,'missing identity false');
SELECT is(public.has_platform_admin(NULL::uuid),false,'NULL input false');
SELECT is(public.authoritative_role(NULL::uuid),NULL::public.user_role,
 'canonical role reader retains NULL for NULL identity');
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE service_role;
SELECT is(public.has_platform_admin(),true,'default uses legitimate admin subject');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE service_role;
SELECT is(public.has_platform_admin(),false,'default with legitimate NULL-role subject returns false');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(public.has_platform_admin(),false,'default with no subject returns false');
RESET ROLE;
CREATE TEMP TABLE d3_profile_before AS SELECT to_jsonb(p) AS row FROM public.profiles p
 WHERE user_id='d3220001-0000-4000-8000-000000000003';
CREATE TEMP TABLE d3_outcome(label text,sqlstate text,message text);
GRANT INSERT ON d3_outcome TO authenticated,service_role;
CREATE FUNCTION pg_temp.d3_attempt(label text,command text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
 BEGIN EXECUTE command; INSERT INTO d3_outcome VALUES(label,NULL,NULL);
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO d3_outcome VALUES(label,v_state,v_message);
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"d3220001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000003'),
 1,'NULL-role authenticated owner can read own profile by RLS');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id='d3220001-0000-4000-8000-000000000002'),
 0,'NULL-role authenticated owner cannot read another profile');
SELECT pg_temp.d3_attempt('authenticated_sensitive_update',
 $$UPDATE public.profiles SET force_pro_access=true,verified=true WHERE user_id='d3220001-0000-4000-8000-000000000003'$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='authenticated_sensitive_update'),
 '42501','authenticated sensitive-profile UPDATE currently denies at table ACL');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d3220001-0000-4000-8000-000000000003'),
 (SELECT row FROM d3_profile_before),'ACL denial preserves entire profile row');
SELECT set_config('request.jwt.claim.sub','d3220001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"role":"service_role","sub":"d3220001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.d3_attempt('service_subject_sensitive_update',
 $$UPDATE public.profiles SET force_pro_access=true,verified=true WHERE user_id='d3220001-0000-4000-8000-000000000003'$$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM d3_outcome WHERE label='service_subject_sensitive_update'),
 NULL::text,'service with real NULL-role subject reaches normal profile trigger');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d3220001-0000-4000-8000-000000000003'),
 (SELECT row FROM d3_profile_before),'profile guard restores sensitive fields and full row');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','',true);
SELECT ok((SELECT prosecdef AND provolatile='s' AND pg_get_userbyid(proowner)='postgres'
  AND proacl::text='{postgres=X/postgres,service_role=X/postgres}'
  AND pg_get_function_arguments(oid)='_user_id uuid DEFAULT auth.uid()'
  AND proconfig=ARRAY['search_path=public']::text[]
  FROM pg_proc WHERE oid='public.has_platform_admin(uuid)'::regprocedure)
 AND has_function_privilege('service_role','public.has_platform_admin(uuid)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.has_platform_admin(uuid)','EXECUTE')
 AND NOT has_function_privilege('anon','public.has_platform_admin(uuid)','EXECUTE'),
 'helper signature/owner/stability/definer and effective EXECUTE boundary preserved');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain enabled');
SELECT * FROM finish();
ROLLBACK;
