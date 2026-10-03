\set ON_ERROR_STOP on
DO $$ BEGIN
 IF (current_database() !~ '^maiprop_d0_[a-z0-9_]{6,48}$'
     AND current_database() IS DISTINCT FROM 'maiprop_t13review_20261003_response01')
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source')
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
 OR inet_server_addr() IS NOT NULL
 OR current_setting('session_replication_role') IS DISTINCT FROM 'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) IS DISTINCT FROM 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='maiprop_t12q_20260930_source') IS DISTINCT FROM 'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'd6130001-%')
 THEN RAISE EXCEPTION 'professional response suite requires a clean owned local clone'; END IF;
END $$;
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
DO $$ BEGIN
 IF current_setting('maiprop.owner_auth_trigger_active',true) = 'true' THEN
  RAISE EXCEPTION 'professional response suite requires an inactive incoming owner marker';
 END IF;
END $$;
CREATE TEMP TABLE d613_incoming_owner_marker ON COMMIT DROP AS
 SELECT current_setting('maiprop.owner_auth_trigger_active',true) AS raw_value;
SELECT no_plan();
SELECT is(current_setting('session_replication_role'),'origin','normal triggers remain enabled');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgrelid='public.professional_review_responses'::regclass
 AND tgname='guard_professional_review_response' AND tgenabled='O'),1,'response guard is enabled');
SELECT is(encode(digest(pg_get_functiondef('public.guard_professional_review_response()'::regprocedure),'sha256'),'hex'),
 'e8b45115711c6a3c905fd41ac96acba0e078af9d6ddb36e714b20784c557e77f','installed response guard matches baseline');
SELECT ok(has_table_privilege('authenticated','public.professional_review_responses','SELECT,INSERT,UPDATE')
 AND has_table_privilege('anon','public.professional_review_responses','SELECT'),
 'table privileges admit actual-role response and public-read checks');
SELECT ok(NOT has_function_privilege('authenticated','public.guard_professional_review_response()','EXECUTE')
 AND NOT has_function_privilege('anon','public.guard_professional_review_response()','EXECUTE'),
 'guard is invoked by table trigger only');
SELECT ok((SELECT count(*)=31 AND bool_and(coalesce(
 encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha,false))
 FROM (VALUES
 ('public.handle_new_user()','5023da9e20b5d195fe795dffd3f7053fcecb03261e97afb2495104a48d481839'),
 ('public.auto_grant_owner_privileges()','439d76207d77b1145ae977fa88d6b9e0682ff775d942ba4dd979193c36e275bc'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce'),
 ('public.enforce_professional_pro_consultation_request()','d2317eb158242e32f9d5878e09059b208c9e54c6ff770ea87d001ec97ecb8b83'),
 ('private.insert_interaction_notification(uuid,uuid,text,text,text,text)','19a643033844e663d9b871ee666a187ba0404d261742be803ebb632702a70784'),
 ('private.notify_consultation_created()','fd2300d009e3b9c477719283860e3f305e16f8bebfc833fcf5a88208bacdb6cd'),
 ('private.notify_consultation_status_changed()','9975aacc68d3df41348d7d9b17ca788b140596480bead9865eabd1f283266d95'),
 ('public.validate_consultation_request_availability()','f6dc1ed824fa379cd928f65e24e785bf220ee195c33a8190b610dec5d89286a0'),
 ('private.capture_consultation_owner_lead()','c804d484bb94cde55d80bbe226addde816cf3c11460513a45ae1265eb657a937'),
 ('public.can_review_professional(uuid,uuid)','1fcfcfa6d5a26c2a8e7674f954b11cfc85e080efbbd3019e343994ca5cb0d1d4'),
 ('public.guard_professional_review_write()','76263374f8b611a0a3676314a20d5a8528a38554ebcefff101b213b19a411ba0'),
 ('private.notify_professional_review_created()','18fb40410dd12d73d4f460c214351e9e701f949987b14f15b7c2853f793a0f27'),
 ('public.sync_professional_rating()','2b4a93ce7fe1e3899afd3b4bea201c8b0835dccecf105d9e0874ac4ba4d539b3'),
 ('public.guard_professional_review_response()','e8b45115711c6a3c905fd41ac96acba0e078af9d6ddb36e714b20784c557e77f'),
 ('public.release_expired_firesale_reservations(uuid)','d407139144d8ad3a0ed4bfe49edca50e14a465b21c8fe3f993816dcfe37fbc08'),
 ('public.audit_firesale_interest_mutation()','7085921d35e04cc57beddda7b0b495736cda701374596264e02c7d960d847c1c'),
 ('public.admin_review_invitation_request(uuid,uuid,text,text,text)','4f25f37c8f7eb1e0a0c89d6bcf54108921710973fa38fe7f97289b171483b511'),
 ('private.guard_role_switch_binding()','ecace02ef7743efec566e4e4a74098f397e54f363b96b6b64d65602f468c7514'),
 ('public.sync_profiles_public()','7ac53091877120d13ad04a53cd4c04d0dce9e72b3b62987a91962596391b99f0'),
 ('private.guard_professional_managed_fields()','f73e238bea9cab6b289442c5d0bd3584a8b68740629971998d8f10b19c9914a4'),
 ('public.professionals_guard_subscription_tier()','4b6d50c1da5d8087bae62815ee2a3d8a0aee0ed800fa94dd1901388004c42999'),
 ('public.update_updated_at_column()','cb2f99b32fa3e97543091845308cc03d3e82b719c7a5a6045def05dedad0ae92'),
 ('private.set_lead_origin_context_key()','34022dcb205983275cd5a5cf05a8d342c33b1e3d0fc5e2e265e782bc801a1ab5'),
 ('private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamp with time zone)','27eb42db9f54b7c399f4546e4a669373b25d597f70dcfb4517be663af0ba59c1'),
 ('public.authoritative_role(uuid)','82951cbee2725a57a3b76809ade3f1abe24687a7a2d871ce7a953fc8a047b0b9'),
 ('private.authoritative_role(uuid)','3d9aa1bd94c46f94fedf8e876904c66e4d8ab4ecff13180421ad1d84d24b9a3d'),
 ('private.notify_professional_verification_change()','ab59eddc45f5794024fdb8c2259bff3dca5e4f899e5253fd698b1c096b5853c7'),
 ('auth.uid()','14051be81fb442ef22c05702971c9e2f2dcc3141258db656b343bb4d9a4de20d'),
 ('auth.jwt()','fbb75ed5b61ce58c242bdd58c42c7db5d9832e12c2af4000561173607bd89b45'),
 ('auth.role()','bbfb0a0c97ded72592d5769680fad76c3a3d24b15fa00b7c2d85f410867a70c9')
 ) expected(sig,sha)), 'exactly thirty-one installed dependency definitions match fail-closed pins');
SELECT is((WITH changed AS (
 SELECT p.oid::regprocedure::text signature,
 encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_sha256,p.proconfig,
 (SELECT jsonb_agg(jsonb_build_object(
  'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
  'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
  ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
  FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) effective_acl
 FROM pg_proc p WHERE p.oid IN (
 'public.release_expired_firesale_reservations(uuid)'::regprocedure,
 'public.audit_firesale_interest_mutation()'::regprocedure,
 'public.has_platform_admin(uuid)'::regprocedure,
 'private.has_platform_admin(uuid)'::regprocedure,
 'public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure))
 SELECT encode(digest(jsonb_agg(to_jsonb(changed) ORDER BY signature)::text,'sha256'),'hex') FROM changed),
 '377c08c9d0faf4ffaa01e2f788b4b6e2352e61e4c898b49b1a90d5eba541a7d8',
 'all five changed routines have exact installed body, configuration and role-name ACL bindings');
SELECT is((WITH deps AS (
 SELECT p.oid::regprocedure::text signature,
 encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex') definition_sha256,p.proconfig,
 (SELECT jsonb_agg(jsonb_build_object(
  'grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,
  'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable)
  ORDER BY CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,a.privilege_type)
  FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a) effective_acl
 FROM pg_proc p WHERE p.oid IN (
 'private.guard_role_switch_binding()'::regprocedure,'public.sync_profiles_public()'::regprocedure,
 'private.guard_professional_managed_fields()'::regprocedure,
 'public.professionals_guard_subscription_tier()'::regprocedure,
 'public.update_updated_at_column()'::regprocedure,'private.set_lead_origin_context_key()'::regprocedure,
 'private.upsert_owner_lead(uuid,text,uuid,uuid,uuid,text,text,text,text,text,text,timestamp with time zone)'::regprocedure,
 'public.authoritative_role(uuid)'::regprocedure,'private.authoritative_role(uuid)'::regprocedure,
 'private.notify_professional_verification_change()'::regprocedure,
 'auth.uid()'::regprocedure,'auth.jwt()'::regprocedure,'auth.role()'::regprocedure))
 SELECT encode(digest(jsonb_agg(to_jsonb(deps) ORDER BY signature)::text,'sha256'),'hex') FROM deps),
 '437c58250409b9c01fae9b80f122d9052030986fd7642d5f0c4a30d6a44f7883',
 'executed trigger and transitive auth/lead dependencies have body, configuration and effective ACL pin');
SELECT is((WITH policy_rows AS (
 SELECT n.nspname,c.relname,p.polname,p.polcmd,p.polpermissive,
  ARRAY(SELECT CASE WHEN x.role_oid=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.role_oid) END
  FROM unnest(p.polroles) x(role_oid) ORDER BY 1) roles,
  pg_get_expr(p.polqual,p.polrelid) qual,pg_get_expr(p.polwithcheck,p.polrelid) with_check
 FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE c.oid IN ('public.professional_review_responses'::regclass,'public.professional_reviews'::regclass,
 'public.consultation_requests'::regclass,'public.professionals'::regclass,
 'public.profiles_public'::regclass))
 SELECT encode(digest(jsonb_agg(to_jsonb(policy_rows) ORDER BY nspname,relname,polname)::text,'sha256'),'hex') FROM policy_rows),
 'fe7c49b680c7523b4ff2d0e5ddb5c76e333fc07ae684689462b9b8bfddf5d0fb',
 'installed policy roles and expressions match normalized role-name pin');
SELECT is((WITH tables AS (
 SELECT c.oid::regclass::text ident,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text acl,
  jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
  'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'generated',a.attgenerated) ORDER BY a.attnum) columns
 FROM pg_class c JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
 LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
 WHERE c.oid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.professionals'::regclass,
 'public.consultation_requests'::regclass,'public.professional_reviews'::regclass,
 'public.professional_review_responses'::regclass,'public.notifications'::regclass,'public.leads'::regclass,
 'public.profiles_public'::regclass)
 GROUP BY c.oid)
 SELECT encode(digest(jsonb_agg(to_jsonb(tables) ORDER BY ident)::text,'sha256'),'hex') FROM tables),
 '8415a614eb11369c7900ad72104435ea4dbdb15cd239a6df953c3c5e33f0de8c',
 'installed ACL, RLS, defaults and generated columns match pin');
SELECT is((WITH triggers AS (
 SELECT c.oid::regclass::text ident,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) definition
 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
 WHERE c.oid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.professionals'::regclass,
 'public.consultation_requests'::regclass,'public.professional_reviews'::regclass,
 'public.professional_review_responses'::regclass,'public.notifications'::regclass,'public.leads'::regclass)
 AND NOT t.tgisinternal)
 SELECT encode(digest(jsonb_agg(to_jsonb(triggers) ORDER BY ident,tgname)::text,'sha256'),'hex') FROM triggers),
 '252814ea2ec40254e88ab2ee0ad30e1b936b70db01e1ebfc6b6e7ca9a27bd971',
 'installed complete origin trigger definitions match pin');

CREATE TEMP TABLE d613_baseline(label text PRIMARY KEY, graph jsonb NOT NULL);
CREATE FUNCTION pg_temp.d613_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
  'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x WHERE id::text LIKE 'd6130001-%'),
  'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x WHERE user_id::text LIKE 'd6130001-%'),
  'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x WHERE user_id::text LIKE 'd6130001-%'),
  'professionals',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.professionals x WHERE id::text LIKE 'd6130002-%'),
  'consultations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.consultation_requests x WHERE requester_id::text LIKE 'd6130001-%'),
  'leads',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.leads x WHERE owner_id::text LIKE 'd6130001-%'),
  'reviews',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.professional_reviews x WHERE reviewer_id::text LIKE 'd6130001-%'),
  'responses',(SELECT coalesce(jsonb_object_agg(review_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.professional_review_responses x WHERE responder_id::text LIKE 'd6130001-%' OR professional_id::text LIKE 'd6130002-%'),
  'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x WHERE user_id::text LIKE 'd6130001-%'))
$$;
CREATE FUNCTION pg_temp.d613_user(p_id uuid,p_email text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::auth.users,jsonb_build_object(
 'id',p_id,'email',p_email,'created_at',now(),'updated_at',now(),
 'raw_user_meta_data','{}'::jsonb,'raw_app_meta_data','{}'::jsonb,'is_super_admin',false)))
$$;
CREATE FUNCTION pg_temp.d613_profile(p_id uuid,p_user uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.profiles,jsonb_build_object(
 'id',p_id,'user_id',p_user,'created_at',now(),'updated_at',now(),'country','Greece',
 'verified',false,'is_platform_admin',false,'force_pro_access',false,
 'investor_mode',false,'account_status','active','role_switch_audit_required',false)))
$$;
CREATE FUNCTION pg_temp.d613_public_profile(p_user uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.profiles_public,jsonb_build_object('user_id',p_user)))
$$;
CREATE FUNCTION pg_temp.d613_professional(p_id uuid,p_user uuid,p_rating numeric,p_reviews integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.professionals,jsonb_build_object(
 'id',p_id,'user_id',p_user,'category','architect','title','D613 Architect','subscription_tier','pro',
 'verified',false,'rating',p_rating,'reviews_count',p_reviews,'projects_count',0,
 'created_at',now(),'updated_at',now())))
$$;
CREATE FUNCTION pg_temp.d613_request(p_id uuid,p_status text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.consultation_requests,jsonb_build_object(
 'id',p_id,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'requester_id','d6130001-0000-4000-8000-000000000001'::uuid,
 'requester_name','D613 Reviewer','requester_email','d613-reviewer@example.test',
 'request_type','consultation','service','Architecture','status',p_status,
 'created_at',now(),'updated_at',now(),'lead_status','new')))
$$;
CREATE FUNCTION pg_temp.d613_lead(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.leads,jsonb_build_object(
 'id',p_id,'owner_id','d6130001-0000-4000-8000-000000000002'::uuid,
 'source','consultation','professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'name','D613 Reviewer','email','d613-reviewer@example.test','status','new',
 'origin_context_key','professional:d6130002-0000-4000-8000-000000000001',
 'created_at',now(),'updated_at',now())))
$$;
CREATE FUNCTION pg_temp.d613_notice(p_id uuid,p_user uuid,p_title text,p_body text,p_type text,p_link text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.notifications,jsonb_build_object(
 'id',p_id,'user_id',p_user,'title',p_title,'body',p_body,'type',p_type,
 'read',false,'created_at',now(),'link',p_link)))
$$;
CREATE FUNCTION pg_temp.d613_review(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.professional_reviews,jsonb_build_object(
 'id',p_id,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'reviewer_id','d6130001-0000-4000-8000-000000000001'::uuid,'rating',5,
 'title','Helpful architect','body','Completed consultation and helpful advice',
 'service_type','Consulted','recommended',true,'created_at',now(),'updated_at',now())))
$$;
CREATE FUNCTION pg_temp.d613_response(p_review uuid,p_body text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT to_jsonb(jsonb_populate_record(NULL::public.professional_review_responses,jsonb_build_object(
 'review_id',p_review,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'responder_id','d6130001-0000-4000-8000-000000000002'::uuid,'body',p_body,
 'created_at',now(),'updated_at',now())))
$$;
CREATE FUNCTION pg_temp.d613_clear_identity() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','',true);
  PERFORM set_config('request.jwt.claims','{}',true);
  PERFORM set_config('request.jwt.claim.role','',true);
  IF current_user IS DISTINCT FROM 'postgres' OR session_user IS DISTINCT FROM 'postgres'
     OR auth.uid() IS NOT NULL
     OR current_setting('request.jwt.claim.sub',true) IS DISTINCT FROM ''
     OR current_setting('request.jwt.claims',true) IS DISTINCT FROM '{}'
     OR current_setting('request.jwt.claim.role',true) IS DISTINCT FROM '' THEN
    RAISE EXCEPTION 'response case identity was not restored';
  END IF;
END;
$$;
CREATE FUNCTION pg_temp.d613_assert_actor(p_actor uuid,p_role text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  expected_claims text := CASE WHEN p_actor IS NULL THEN '{}' ELSE
   jsonb_build_object('sub',p_actor::text,'role',p_role)::text END;
BEGIN
  IF current_user IS DISTINCT FROM p_role OR session_user IS DISTINCT FROM 'postgres'
     OR auth.uid() IS DISTINCT FROM p_actor
     OR current_setting('request.jwt.claim.sub',true) IS DISTINCT FROM coalesce(p_actor::text,'')
     OR current_setting('request.jwt.claims',true)::jsonb IS DISTINCT FROM expected_claims::jsonb
     OR current_setting('request.jwt.claim.role',true) IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION 'response action role/actor/JWT claims mismatch';
  END IF;
END;
$$;
INSERT INTO d613_baseline SELECT 'empty',pg_temp.d613_graph();
SELECT is((SELECT graph FROM d613_baseline WHERE label='empty'),
 jsonb_build_object('users','{}'::jsonb,'profiles','{}'::jsonb,'profiles_public','{}'::jsonb,'professionals','{}'::jsonb,
 'consultations','{}'::jsonb,'leads','{}'::jsonb,'reviews','{}'::jsonb,'responses','{}'::jsonb,'notifications','{}'::jsonb),
 'all fixture graph relations begin empty');

-- Auth user origin triggers create unprivileged profiles without changing the incoming marker.
SELECT pg_temp.d613_clear_identity();
INSERT INTO auth.users(id,email) VALUES
 ('d6130001-0000-4000-8000-000000000001','d613-reviewer@example.test'),
 ('d6130001-0000-4000-8000-000000000002','d613-owner@example.test'),
 ('d6130001-0000-4000-8000-000000000003','d613-outsider@example.test');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE 'd6130001-%'),3,'three unique users inserted');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id::text LIKE 'd6130001-%'),3,'origin trigger created exactly one profile per user');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id::text LIKE 'd6130001-%' AND role IS NULL),3,
 'ordinary test users have no privileged role');
SELECT id AS reviewer_profile_id FROM public.profiles WHERE user_id='d6130001-0000-4000-8000-000000000001' \gset
SELECT id AS owner_profile_id FROM public.profiles WHERE user_id='d6130001-0000-4000-8000-000000000002' \gset
SELECT id AS outsider_profile_id FROM public.profiles WHERE user_id='d6130001-0000-4000-8000-000000000003' \gset
SELECT ok(:'reviewer_profile_id'::uuid <> :'owner_profile_id'::uuid
 AND :'owner_profile_id'::uuid <> :'outsider_profile_id'::uuid
 AND :'reviewer_profile_id'::uuid <> :'outsider_profile_id'::uuid,
 'generated profile IDs are distinct bindings');
SELECT ok(current_setting('maiprop.owner_auth_trigger_active',true)
 IS NOT DISTINCT FROM (SELECT raw_value FROM d613_incoming_owner_marker),
 'ordinary signup leaves the inactive incoming owner marker exactly unchanged');
INSERT INTO public.professionals(id,user_id,category,title,subscription_tier)
VALUES ('d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000002','architect','D613 Architect','pro');
SELECT is((SELECT count(*)::integer FROM public.professionals WHERE id::text LIKE 'd6130002-%'),1,'one Pro professional exists');
SELECT is((SELECT rating::numeric FROM public.professionals WHERE id='d6130002-0000-4000-8000-000000000001'),0::numeric,
 'professional begins with zero rating');
SELECT is((SELECT reviews_count FROM public.professionals WHERE id='d6130002-0000-4000-8000-000000000001'),0,
 'professional begins with zero reviews');
INSERT INTO d613_baseline VALUES ('users_professional',jsonb_build_object(
 'users',jsonb_build_object(
  'd6130001-0000-4000-8000-000000000001',pg_temp.d613_user('d6130001-0000-4000-8000-000000000001','d613-reviewer@example.test'),
  'd6130001-0000-4000-8000-000000000002',pg_temp.d613_user('d6130001-0000-4000-8000-000000000002','d613-owner@example.test'),
  'd6130001-0000-4000-8000-000000000003',pg_temp.d613_user('d6130001-0000-4000-8000-000000000003','d613-outsider@example.test')),
 'profiles',jsonb_build_object(
  'd6130001-0000-4000-8000-000000000001',pg_temp.d613_profile(:'reviewer_profile_id'::uuid,'d6130001-0000-4000-8000-000000000001'),
  'd6130001-0000-4000-8000-000000000002',pg_temp.d613_profile(:'owner_profile_id'::uuid,'d6130001-0000-4000-8000-000000000002'),
  'd6130001-0000-4000-8000-000000000003',pg_temp.d613_profile(:'outsider_profile_id'::uuid,'d6130001-0000-4000-8000-000000000003')),
 'profiles_public',jsonb_build_object(
  'd6130001-0000-4000-8000-000000000001',pg_temp.d613_public_profile('d6130001-0000-4000-8000-000000000001'),
  'd6130001-0000-4000-8000-000000000002',pg_temp.d613_public_profile('d6130001-0000-4000-8000-000000000002'),
  'd6130001-0000-4000-8000-000000000003',pg_temp.d613_public_profile('d6130001-0000-4000-8000-000000000003')),
 'professionals',jsonb_build_object('d6130002-0000-4000-8000-000000000001',
  pg_temp.d613_professional('d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000002',0,0)),
 'consultations','{}'::jsonb,'leads','{}'::jsonb,'reviews','{}'::jsonb,
 'responses','{}'::jsonb,'notifications','{}'::jsonb));
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='users_professional'),
 'complete signup, public projection and privileged Pro fixture graph matches independent model');

-- Reviewer creates a real manual consultation; the professional completes it.
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000001'::uuid, 'authenticated');
SELECT is(auth.uid(),'d6130001-0000-4000-8000-000000000001'::uuid,'consultation requester identity');
INSERT INTO public.consultation_requests(professional_id,requester_id,requester_name,requester_email,request_type,service)
VALUES ('d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000001',
 'D613 Reviewer','d613-reviewer@example.test','consultation','Architecture')
RETURNING id AS consultation_id,created_at AS consultation_created,updated_at AS consultation_updated,
 to_jsonb(consultation_requests.*) AS consultation_row \gset
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(:'consultation_row'::jsonb,pg_temp.d613_request(:'consultation_id'::uuid,'pending'),
 'complete consultation RETURNING matches independent defaults and transaction timestamps');
SELECT is((SELECT status FROM public.consultation_requests WHERE id=:'consultation_id'::uuid),'pending',
 'normal requester consultation is pending');
SELECT is((SELECT to_jsonb(c) FROM public.consultation_requests c WHERE id=:'consultation_id'::uuid),
 jsonb_build_object('id',:'consultation_id'::uuid,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'requester_id','d6130001-0000-4000-8000-000000000001'::uuid,'requester_name','D613 Reviewer',
 'requester_email','d613-reviewer@example.test','requester_phone',NULL,'request_type','consultation',
 'message',NULL,'service','Architecture','preferred_date',NULL,'preferred_time',NULL,'callback_time',NULL,
 'status','pending','created_at',:'consultation_created'::timestamptz,
 'updated_at',:'consultation_updated'::timestamptz,'notes',NULL,'lead_status','new','meeting_type',NULL),
 'complete pending consultation row matches independent model');
SELECT is((pg_temp.d613_graph()-'consultations'-'leads'-'notifications'),
 ((SELECT graph FROM d613_baseline WHERE label='users_professional')-'consultations'-'leads'-'notifications'),
 'request creation preserves every old user, profile, professional, review and response row');
SELECT is((SELECT count(*)::integer FROM public.leads WHERE owner_id='d6130001-0000-4000-8000-000000000002'
 AND professional_id='d6130002-0000-4000-8000-000000000001' AND source='consultation'),1,
 'request creates exactly one owner lead for this professional');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='d6130001-0000-4000-8000-000000000002'
 AND title='New consultation request'),1,'request notified owner once');
SELECT id AS request_lead_id FROM public.leads WHERE owner_id='d6130001-0000-4000-8000-000000000002'
 AND professional_id='d6130002-0000-4000-8000-000000000001' AND source='consultation' \gset
SELECT id AS request_notice_id FROM public.notifications WHERE user_id='d6130001-0000-4000-8000-000000000002'
 AND title='New consultation request' \gset
INSERT INTO d613_baseline
SELECT 'pending',jsonb_set(jsonb_set(jsonb_set(graph,'{consultations}',
 jsonb_build_object(:'consultation_id',pg_temp.d613_request(:'consultation_id'::uuid,'pending'))),
 '{leads}',jsonb_build_object(:'request_lead_id',pg_temp.d613_lead(:'request_lead_id'::uuid))),
 '{notifications}',jsonb_build_object(:'request_notice_id',pg_temp.d613_notice(
 :'request_notice_id'::uuid,'d6130001-0000-4000-8000-000000000002',
 'New consultation request','D613 Reviewer requested Architecture','message','/dashboard?tab=booking')))
FROM d613_baseline WHERE label='users_professional';
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='pending'),
 'complete pending graph includes exact request, lead, notice and every old row');
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000002'::uuid, 'authenticated');
SELECT is(auth.uid(),'d6130001-0000-4000-8000-000000000002'::uuid,'consultation professional identity');
UPDATE public.consultation_requests SET status='completed' WHERE id=:'consultation_id'::uuid
RETURNING status AS consultation_status,updated_at AS completed_updated,
 to_jsonb(consultation_requests.*) AS completed_row \gset
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(:'consultation_status'::text,'completed','professional completed consultation through table');
SELECT is(:'completed_row'::jsonb,pg_temp.d613_request(:'consultation_id'::uuid,'completed'),
 'complete completed-consultation RETURNING matches modeled status and timestamp');
SELECT is((SELECT status FROM public.consultation_requests WHERE id=:'consultation_id'::uuid),'completed',
 'completed consultation persisted');
SELECT is((SELECT to_jsonb(c) FROM public.consultation_requests c WHERE id=:'consultation_id'::uuid),
 jsonb_set(jsonb_set((SELECT graph->'consultations'->:'consultation_id' FROM d613_baseline WHERE label='pending'),
 '{status}',to_jsonb('completed'::text)),'{updated_at}',to_jsonb(:'completed_updated'::timestamptz)),
 'completion RETURNING and full row match modeled status transition');
SELECT is((pg_temp.d613_graph()-'consultations'-'notifications'),
 ((SELECT graph FROM d613_baseline WHERE label='pending')-'consultations'-'notifications'),
 'completion preserves every old user, profile, professional, lead, review and response row');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='d6130001-0000-4000-8000-000000000001'
 AND title='Consultation status updated'),1,'completion notified reviewer once');
SELECT id AS completion_notice_id FROM public.notifications WHERE user_id='d6130001-0000-4000-8000-000000000001'
 AND title='Consultation status updated' \gset
INSERT INTO d613_baseline SELECT 'completed',jsonb_set(jsonb_set(graph,
 ARRAY['consultations',:'consultation_id'],pg_temp.d613_request(:'consultation_id'::uuid,'completed')),
 '{notifications}',graph->'notifications'||jsonb_build_object(:'completion_notice_id',pg_temp.d613_notice(
 :'completion_notice_id'::uuid,'d6130001-0000-4000-8000-000000000001',
 'Consultation status updated','Your Architecture request is now completed','message','/dashboard?tab=booking')))
FROM d613_baseline WHERE label='pending';
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='completed'),
 'complete completion graph preserves prior notice and lead and models new notice');

-- Reviewer submits the review required for an owner response.
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000001'::uuid, 'authenticated');
INSERT INTO public.professional_reviews(professional_id,reviewer_id,rating,title,body,service_type)
VALUES ('d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000001',5,
 'Helpful architect','Completed consultation and helpful advice','Consulted')
RETURNING id AS review_id,created_at AS review_created,updated_at AS review_updated,
 to_jsonb(professional_reviews.*) AS review_row \gset
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is((SELECT rating FROM public.professional_reviews WHERE id=:'review_id'::uuid),5::smallint,'review rating persisted');
SELECT is(:'review_row'::jsonb,pg_temp.d613_review(:'review_id'::uuid),
 'complete review RETURNING matches independent submitted/default model');
SELECT is((SELECT to_jsonb(r) FROM public.professional_reviews r WHERE id=:'review_id'::uuid),
 jsonb_build_object('id',:'review_id'::uuid,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'reviewer_id','d6130001-0000-4000-8000-000000000001'::uuid,'rating',5,'title','Helpful architect',
 'body','Completed consultation and helpful advice','service_type','Consulted','property_city',NULL,
 'transaction_year',NULL,'recommended',true,'created_at',:'review_created'::timestamptz,
 'updated_at',:'review_updated'::timestamptz),
 'complete review row matches independent submitted model');
SELECT is((SELECT rating::numeric FROM public.professionals WHERE id='d6130002-0000-4000-8000-000000000001'),5::numeric,
 'review rating synchronizes professional');
SELECT is((SELECT reviews_count FROM public.professionals WHERE id='d6130002-0000-4000-8000-000000000001'),1,
 'review count synchronizes professional');
SELECT is((SELECT count(*)::integer FROM public.notifications WHERE user_id='d6130001-0000-4000-8000-000000000002'
 AND title='New professional review'),1,'review notifies professional once');
SELECT is((pg_temp.d613_graph()-'reviews'-'professionals'-'notifications'),
 ((SELECT graph FROM d613_baseline WHERE label='completed')-'reviews'-'professionals'-'notifications'),
 'review creation preserves every old user, profile, consultation, lead and response row');
SELECT is((SELECT count(*)::integer FROM public.professional_review_responses WHERE review_id=:'review_id'::uuid),0,
 'review begins without response');
SELECT id AS review_notice_id FROM public.notifications WHERE user_id='d6130001-0000-4000-8000-000000000002'
 AND title='New professional review' \gset
INSERT INTO d613_baseline SELECT 'review',jsonb_set(jsonb_set(jsonb_set(graph,
 '{professionals}',jsonb_build_object('d6130002-0000-4000-8000-000000000001',
 pg_temp.d613_professional('d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000002',5,1))),
 '{reviews}',jsonb_build_object(:'review_id',pg_temp.d613_review(:'review_id'::uuid))),
 '{notifications}',graph->'notifications'||jsonb_build_object(:'review_notice_id',pg_temp.d613_notice(
 :'review_notice_id'::uuid,'d6130001-0000-4000-8000-000000000002',
 'New professional review','A client left a new review on your professional profile.',
 'professional_review','/dashboard/profile')))
FROM d613_baseline WHERE label='completed';
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='review'),
 'complete review graph models rating, count, new notice and all prior rows');

-- A mismatch is denied before any response exists; the full graph is unchanged.
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000002'::uuid, 'authenticated');
SELECT throws_ok(format('INSERT INTO public.professional_review_responses(review_id,professional_id,responder_id,body) VALUES (%L,%L,%L,%L)',
 :'review_id','d6130002-0000-4000-8000-000000000099','d6130001-0000-4000-8000-000000000002','Wrong professional'),
 'P0001','review_response_professional_mismatch','mismatched professional is rejected by response guard');
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='review'),
 'mismatch leaves complete fixture graph unchanged');

SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000003'::uuid, 'authenticated');
SELECT is(auth.uid(),'d6130001-0000-4000-8000-000000000003'::uuid,'outsider insert identity is independent');
SELECT throws_ok(format('INSERT INTO public.professional_review_responses(review_id,professional_id,responder_id,body) VALUES (%L,%L,%L,%L)',
 :'review_id','d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000003','Outsider response'),
 'P0001','only_reviewed_professional_can_respond','outsider cannot insert an owner response');
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='review'),
 'outsider insert denial leaves complete graph unchanged');
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
SELECT pg_temp.d613_assert_actor(NULL::uuid, 'anon');
SELECT is(auth.uid(),NULL::uuid,'anonymous insert has no actor');
SELECT throws_ok(format('INSERT INTO public.professional_review_responses(review_id,professional_id,responder_id,body) VALUES (%L,%L,%L,%L)',
 :'review_id','d6130002-0000-4000-8000-000000000001','d6130001-0000-4000-8000-000000000003','Anonymous response'),
 'P0001','not_authenticated','anonymous caller cannot insert a response');
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='review'),
 'anonymous insert denial leaves complete graph unchanged');

-- Owner creates response; supplied responder identity is overwritten by actor.
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000002'::uuid, 'authenticated');
INSERT INTO public.professional_review_responses(review_id,professional_id,responder_id,body)
VALUES (:'review_id'::uuid,'d6130002-0000-4000-8000-000000000001',
 'd6130001-0000-4000-8000-000000000003','Thank you for your review.')
RETURNING review_id AS response_review_id, professional_id AS response_professional_id,
 responder_id AS response_responder_id, body AS response_body, created_at AS response_created,
 updated_at AS response_updated,to_jsonb(professional_review_responses.*) AS response_row \gset
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(:'response_row'::jsonb,pg_temp.d613_response(:'review_id'::uuid,'Thank you for your review.'),
 'complete response INSERT RETURNING matches modeled actor overwrite and timestamp defaults');
SELECT is(:'response_review_id'::uuid,:'review_id'::uuid,'response RETURNING review identity');
SELECT is(:'response_professional_id'::uuid,'d6130002-0000-4000-8000-000000000001'::uuid,
 'response RETURNING professional identity');
SELECT is(:'response_responder_id'::uuid,'d6130001-0000-4000-8000-000000000002'::uuid,
 'response RETURNING uses actual professional actor');
SELECT is(:'response_body'::text,'Thank you for your review.','response RETURNING body');
SELECT is((SELECT to_jsonb(r) FROM public.professional_review_responses r WHERE review_id=:'review_id'::uuid),
 jsonb_build_object('review_id',:'review_id'::uuid,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'responder_id','d6130001-0000-4000-8000-000000000002'::uuid,'body','Thank you for your review.',
 'created_at',:'response_created'::timestamptz,'updated_at',:'response_updated'::timestamptz),
 'full stored response equals independently specified insert row');
SELECT is(pg_temp.d613_graph(),jsonb_set((SELECT graph FROM d613_baseline WHERE label='review'),
 '{responses}',jsonb_build_object(:'review_id',pg_temp.d613_response(:'review_id'::uuid,'Thank you for your review.'))),
 'response insertion changes only the one modeled row across complete graph');
SELECT is((SELECT count(*)::integer FROM public.professional_review_responses WHERE review_id=:'review_id'::uuid),1,
 'exactly one response belongs to review');
INSERT INTO d613_baseline SELECT 'responded',jsonb_set(graph,'{responses}',
 jsonb_build_object(:'review_id',pg_temp.d613_response(:'review_id'::uuid,'Thank you for your review.')))
FROM d613_baseline WHERE label='review';

-- A public reader sees the response; an outsider cannot write it.
SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.role','anon',true);
SET LOCAL ROLE anon;
SELECT pg_temp.d613_assert_actor(NULL::uuid, 'anon');
SELECT is((SELECT body FROM public.professional_review_responses WHERE review_id=:'review_id'::uuid),
 'Thank you for your review.','public reader sees the response');
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000003'::uuid, 'authenticated');
WITH changed AS (UPDATE public.professional_review_responses SET body='Outsider edit'
 WHERE review_id=:'review_id'::uuid RETURNING review_id)
SELECT is((SELECT count(*)::integer FROM changed),0,'outsider update is filtered by RLS');
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='responded'),
 'outsider update leaves complete graph unchanged');

-- Owner can edit body, while identity columns remain immutable.
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000002'::uuid, 'authenticated');
SELECT throws_ok(format('UPDATE public.professional_review_responses SET responder_id=%L WHERE review_id=%L',
 'd6130001-0000-4000-8000-000000000003',:'review_id'),
 'P0001','review_response_identity_fields_are_immutable','owner cannot change response identity');
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(pg_temp.d613_graph(),(SELECT graph FROM d613_baseline WHERE label='responded'),
 'immutable-identity denial leaves complete graph unchanged');
SELECT set_config('request.jwt.claim.sub','d6130001-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"d6130001-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.d613_assert_actor('d6130001-0000-4000-8000-000000000002'::uuid, 'authenticated');
UPDATE public.professional_review_responses SET body='Updated professional response.'
WHERE review_id=:'review_id'::uuid RETURNING review_id AS updated_review_id,
 professional_id AS updated_professional_id,responder_id AS updated_responder_id,
 body AS updated_body,created_at AS updated_created,updated_at AS updated_updated,
 to_jsonb(professional_review_responses.*) AS updated_row \gset
RESET ROLE;
SELECT pg_temp.d613_clear_identity();
SELECT is(:'updated_row'::jsonb,pg_temp.d613_response(:'review_id'::uuid,'Updated professional response.'),
 'complete response UPDATE RETURNING matches modeled full row');
SELECT is(:'updated_review_id'::uuid,:'review_id'::uuid,'update RETURNING retains review identity');
SELECT is(:'updated_responder_id'::uuid,'d6130001-0000-4000-8000-000000000002'::uuid,
 'update RETURNING retains responder identity');
SELECT is(:'updated_professional_id'::uuid,'d6130002-0000-4000-8000-000000000001'::uuid,
 'update RETURNING retains professional identity');
SELECT is(:'updated_body'::text,'Updated professional response.','update RETURNING has edited body');
SELECT is(:'updated_created'::timestamptz,:'response_created'::timestamptz,
 'update retains creation timestamp');
SELECT ok(:'updated_updated'::timestamptz >= :'response_updated'::timestamptz,
 'update timestamp is monotonic');
SELECT is((SELECT to_jsonb(r) FROM public.professional_review_responses r WHERE review_id=:'review_id'::uuid),
 jsonb_build_object('review_id',:'review_id'::uuid,'professional_id','d6130002-0000-4000-8000-000000000001'::uuid,
 'responder_id','d6130001-0000-4000-8000-000000000002'::uuid,'body','Updated professional response.',
 'created_at',:'response_created'::timestamptz,'updated_at',:'updated_updated'::timestamptz),
 'full stored response equals independently specified update row');
SELECT is(pg_temp.d613_graph(),jsonb_set((SELECT graph FROM d613_baseline WHERE label='responded'),
 ARRAY['responses',:'review_id'],pg_temp.d613_response(:'review_id'::uuid,'Updated professional response.')),
 'response update changes only one modeled row across complete graph');

SELECT set_config('request.jwt.claim.sub','',true);
SELECT set_config('request.jwt.claims','{}',true);
SELECT set_config('request.jwt.claim.role','',true);
SELECT is(current_user,'postgres','effective identity restored before rollback');
SELECT is(auth.uid(),NULL::uuid,'JWT subject restored before rollback');
SELECT * FROM finish();
ROLLBACK;
