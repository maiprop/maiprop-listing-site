\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_t13_additional_[a-z0-9_]+|maiprop_d0_[a-z0-9_]{6,48})$'
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres' OR inet_server_addr() IS NOT NULL
 OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'a1390001-%')
 OR EXISTS(SELECT 1 FROM auth.users WHERE lower(email)='kr@maiprop.co')
 THEN RAISE EXCEPTION 'owned clean origin clone without duplicate owner required'; END IF;
END $$;
CREATE FUNCTION pg_temp.a139_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
 'professionals',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.professionals x),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x),
 'inputs',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.agent_data_inputs x),
 'bans',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.agent_data_input_bans x))
$$;
CREATE FUNCTION pg_temp.a139_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $$
 WITH tables AS (SELECT unnest(ARRAY['auth.users','public.profiles','public.profiles_public',
 'public.professionals','public.notifications','public.agent_data_inputs',
 'public.agent_data_input_bans'])::regclass oid),
 named AS (SELECT to_regprocedure(sig) oid FROM (VALUES
 ('auth.uid()'),('auth.jwt()'),('public.has_platform_admin(uuid)'),('private.has_platform_admin(uuid)'),
 ('public.authoritative_role(uuid)'),
 ('public.complete_onboarding_role_for_user(uuid,public.user_role,text,text,text,text)'),
 ('public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)'),
 ('public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)'),
 ('public.apply_verified_data_input_discount(uuid,text,integer,text)'),
 ('public.agent_data_input_max_per_month()'),('public.agent_data_input_discount_pct_per_input()'),
 ('private.notify_professional_verification_change()'),
 ('private.guard_professional_managed_fields()'),
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
 'privileges',(SELECT jsonb_agg(jsonb_build_object('role',r,
 'public_schema',has_schema_privilege(r,'public','USAGE'),
 'private_schema',has_schema_privilege(r,'private','USAGE'),
 'invoice',has_function_privilege(r,'public.apply_verified_data_input_discount(uuid,text,integer,text)','EXECUTE'),
 'professionals_select',has_table_privilege(r,'public.professionals','SELECT'),
 'professionals_update',has_table_privilege(r,'public.professionals','UPDATE'),
 'notifications_insert',has_table_privilege(r,'public.notifications','INSERT'),
 'inputs_update',has_table_privilege(r,'public.agent_data_inputs','UPDATE')) ORDER BY r)
 FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) roles(r)))
$$;
CREATE TEMP TABLE a139_pre AS SELECT pg_backend_pid() pid,pg_temp.a139_graph() graph,
 pg_temp.a139_catalog() catalog;
SELECT 'A139_PRE',pid,encode(digest(graph::text,'sha256'),'hex'),
 encode(digest(catalog::text,'sha256'),'hex') FROM a139_pre;
SELECT 'A139_CATALOG_PRE',catalog::text FROM a139_pre;
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SELECT plan(35);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers enabled');
SELECT is((SELECT v->>'body' FROM a139_pre,jsonb_array_elements(catalog->'functions') v
 WHERE v->>'sig'='apply_verified_data_input_discount(uuid,text,integer,text)'),
 '2264aea13ff83e816851597152a3d0489a61a1253fab8c71ed86aa3553ef7ca0',
 'installed invoice body matches historical unhit identity');
SELECT is((SELECT v->>'body' FROM a139_pre,jsonb_array_elements(catalog->'functions') v
 WHERE v->>'sig' LIKE '%notify_professional_verification_change()'),
 'ab59eddc45f5794024fdb8c2259bff3dca5e4f899e5253fd698b1c096b5853c7',
 'installed professional notice body matches historical unhit identity');
SELECT ok(has_function_privilege('service_role','public.apply_verified_data_input_discount(uuid,text,integer,text)','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.apply_verified_data_input_discount(uuid,text,integer,text)','EXECUTE'),
 'invoice reservation is service-only');
SELECT ok((SELECT count(*)=1 FROM pg_trigger WHERE tgrelid='public.professionals'::regclass
 AND tgname='trg_professional_verification_notify' AND tgenabled='O'),
 'professional notice trigger enabled');
SELECT ok((SELECT count(*)=4 FROM pg_trigger WHERE tgrelid='public.agent_data_inputs'::regclass
 AND NOT tgisinternal AND tgenabled='O'),'all agent input triggers enabled');

-- Preserve the source's existing demo identity; create only fixture identities.
INSERT INTO auth.users(id,email) VALUES
 ('a1390001-0000-4000-8000-000000000001','kr@maiprop.co'),
 ('a1390001-0000-4000-8000-000000000002','a139-approve@example.test'),
 ('a1390001-0000-4000-8000-000000000003','a139-reject@example.test'),
 ('a1390001-0000-4000-8000-000000000004','a139-agent@example.test'),
 ('a1390001-0000-4000-8000-000000000005','a139-other-agent@example.test');
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='a1390001-0000-4000-8000-000000000001'),
 'admin','normal owner trigger establishes authoritative admin');
-- The professional onboarding contract requires the user's public profile first.
SELECT set_config('request.jwt.claim.sub','a1390001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1390001-0000-4000-8000-000000000002"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.professionals(id,user_id,category,title)
 VALUES('a1390002-0000-4000-8000-000000000001','a1390001-0000-4000-8000-000000000002','architect','A139 architect');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a1390001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1390001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
INSERT INTO public.professionals(id,user_id,category,title)
 VALUES('a1390002-0000-4000-8000-000000000002','a1390001-0000-4000-8000-000000000003','architect','A139 architect');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('a1390001-0000-4000-8000-000000000002','professional','professional','A139 Approve','Athens','+302100000001');
SELECT public.complete_onboarding_role_for_user('a1390001-0000-4000-8000-000000000003','professional','professional','A139 Reject','Athens','+302100000002');
SELECT public.complete_onboarding_role_for_user('a1390001-0000-4000-8000-000000000004','agent','agent');
SELECT public.complete_onboarding_role_for_user('a1390001-0000-4000-8000-000000000005','agent','agent');
RESET ROLE;
SELECT ok((SELECT count(*)=2 FROM public.profiles WHERE user_id::text LIKE 'a1390001-%' AND role='professional')
 AND (SELECT count(*)=2 FROM public.profiles WHERE user_id::text LIKE 'a1390001-%' AND role='agent'),
 'two professionals and two agents normally onboarded');
CREATE TEMP TABLE a139_result(label text PRIMARY KEY,sqlstate text,message text,result jsonb,actor_role text,subject uuid);
GRANT INSERT ON a139_result TO authenticated,service_role;
CREATE FUNCTION pg_temp.a139_attempt(label text,command text) RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
DECLARE v_state text;v_message text;v_result jsonb;
BEGIN
 BEGIN
  EXECUTE command INTO v_result;
  INSERT INTO a139_result VALUES(label,NULL,NULL,v_result,current_role,auth.uid());
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state=RETURNED_SQLSTATE,v_message=MESSAGE_TEXT;
  INSERT INTO a139_result VALUES(label,v_state,v_message,NULL,current_role,auth.uid());
 END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.a139_attempt(text,text) TO authenticated,service_role;

SELECT ok((SELECT count(*)=2 AND bool_and(verified=false AND rejection_reason IS NULL AND verified_at IS NULL)
 FROM public.professionals WHERE id::text LIKE 'a1390002-%'),'both normal profiles start pending');
CREATE TEMP TABLE a139_prof_before AS SELECT pg_temp.a139_graph() graph;
SELECT set_config('request.jwt.claim.sub','a1390001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"role":"authenticated","sub":"a1390001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_role::text||':'||auth.uid()::text,
 'authenticated:a1390001-0000-4000-8000-000000000001','approval uses actual admin role and JWT subject');
SELECT pg_temp.a139_attempt('approve',$q$WITH changed AS (
 UPDATE public.professionals SET verified=true,license_number='LIC-A139',rejection_reason=NULL,verified_at=now()
 WHERE id='a1390002-0000-4000-8000-000000000001' RETURNING *)
 SELECT count(*)::int FROM changed$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM a139_result WHERE label='approve'),NULL::text,'admin approval executes');
SELECT is((SELECT result FROM a139_result WHERE label='approve'),'1'::jsonb,'admin approval affected exactly one row');
SELECT ok((SELECT verified=true AND license_number='LIC-A139' AND verified_at=now()
 AND rejection_reason IS NULL FROM public.professionals
 WHERE id='a1390002-0000-4000-8000-000000000001'),'approval row has exact verification fields');
SELECT ok((SELECT count(*)=1 AND bool_and(user_id='a1390001-0000-4000-8000-000000000002'
 AND title='Professional profile verified'
 AND body='Your professional profile has been verified and the verified badge is now visible.'
 AND type='professional_verification' AND link='/dashboard/profile' AND read=false)
 FROM public.notifications WHERE NOT (SELECT graph->'notifications' ? id::text FROM a139_prof_before)),
 'approval emits exactly one complete applicant notice');
SELECT ok((SELECT pg_temp.a139_graph() = jsonb_set(
 jsonb_set(b.graph,'{professionals,a1390002-0000-4000-8000-000000000001}',
 b.graph->'professionals'->'a1390002-0000-4000-8000-000000000001'||
 jsonb_build_object('verified',true,'license_number','LIC-A139','rejection_reason',NULL,
 'verified_at',now(),'updated_at',now()),false),
 ARRAY['notifications',n.id::text],to_jsonb(n),true)
 FROM a139_prof_before b,public.notifications n
 WHERE NOT (b.graph->'notifications' ? n.id::text)),
 'approval changes the complete graph by exactly one profile and one notice');
CREATE TEMP TABLE a139_after_approve AS SELECT pg_temp.a139_graph() graph;
SET LOCAL ROLE authenticated;
SELECT pg_temp.a139_attempt('notes',$q$WITH changed AS (
 UPDATE public.professionals SET notes='internal A139 note'
 WHERE id='a1390002-0000-4000-8000-000000000001' RETURNING *)
 SELECT count(*)::int FROM changed$q$);
SELECT pg_temp.a139_attempt('repeat_approve',$q$WITH changed AS (
 UPDATE public.professionals SET verified=true,license_number='LIC-A139',rejection_reason=NULL,verified_at=now()
 WHERE id='a1390002-0000-4000-8000-000000000001' RETURNING *)
 SELECT count(*)::int FROM changed$q$);
RESET ROLE;
SELECT is((SELECT string_agg(label||':'||coalesce(sqlstate,'ok')||':'||result::text,',' ORDER BY label)
 FROM a139_result WHERE label IN ('notes','repeat_approve')),
 'notes:ok:1,repeat_approve:ok:1','notes and repeated approval each affect exactly one row');
SELECT ok((SELECT count(*)=1 AND bool_and(notes='internal A139 note')
 FROM public.professionals WHERE id='a1390002-0000-4000-8000-000000000001'),
 'notes persist without modifying verification');
SELECT is((SELECT graph->'notifications' FROM a139_after_approve),pg_temp.a139_graph()->'notifications',
 'notes and repeated approval emit no extra notice');
SELECT is(pg_temp.a139_graph(),
 (SELECT jsonb_set(graph,'{professionals,a1390002-0000-4000-8000-000000000001}',
 graph->'professionals'->'a1390002-0000-4000-8000-000000000001'||
 jsonb_build_object('notes','internal A139 note'),false) FROM a139_after_approve),
 'notes and repeated approval preserve complete graph apart from expected note');
CREATE TEMP TABLE a139_before_reject AS SELECT pg_temp.a139_graph() graph;
SET LOCAL ROLE authenticated;
SELECT pg_temp.a139_attempt('reject',$q$WITH changed AS (
 UPDATE public.professionals SET verified=false,rejection_reason='Missing license',verified_at=NULL
 WHERE id='a1390002-0000-4000-8000-000000000002' RETURNING *)
 SELECT count(*)::int FROM changed$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM a139_result WHERE label='reject'),NULL::text,'admin rejection executes');
SELECT is((SELECT result FROM a139_result WHERE label='reject'),'1'::jsonb,'admin rejection affected exactly one row');
SELECT ok((SELECT verified=false AND rejection_reason='Missing license' AND verified_at IS NULL
 FROM public.professionals WHERE id='a1390002-0000-4000-8000-000000000002'),
 'rejection row has exact status and reason');
SELECT ok((SELECT count(*)=1 AND bool_and(user_id='a1390001-0000-4000-8000-000000000003'
 AND title='Professional verification rejected'
 AND body='Your professional verification was rejected. Missing license'
 AND type='professional_verification' AND link='/dashboard/profile' AND read=false)
 FROM public.notifications WHERE NOT (SELECT graph->'notifications' ? id::text FROM a139_before_reject)),
 'rejection emits exactly one complete applicant notice');
SELECT ok((SELECT pg_temp.a139_graph() = jsonb_set(
 jsonb_set(b.graph,'{professionals,a1390002-0000-4000-8000-000000000002}',
 b.graph->'professionals'->'a1390002-0000-4000-8000-000000000002'||
 jsonb_build_object('verified',false,'rejection_reason','Missing license','verified_at',NULL,
 'updated_at',now()),false),
 ARRAY['notifications',n.id::text],to_jsonb(n),true)
 FROM a139_before_reject b,public.notifications n
 WHERE NOT (b.graph->'notifications' ? n.id::text)),
 'rejection changes complete graph by exactly one profile and one notice');
CREATE TEMP TABLE a139_after_reject AS SELECT pg_temp.a139_graph() graph;
SET LOCAL ROLE authenticated;
SELECT pg_temp.a139_attempt('repeat_reject',$q$WITH changed AS (
 UPDATE public.professionals SET verified=false,rejection_reason='Missing license',verified_at=NULL
 WHERE id='a1390002-0000-4000-8000-000000000002' RETURNING *)
 SELECT count(*)::int FROM changed$q$);
RESET ROLE;
SELECT is((SELECT result FROM a139_result WHERE label='repeat_reject'),'1'::jsonb,
 'repeated rejection still affects one row');
SELECT is(pg_temp.a139_graph(),(SELECT graph FROM a139_after_reject),
 'repeated rejection leaves complete graph unchanged');

-- Data input submission and review use the accepted normal service setup.
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
INSERT INTO public.agent_data_inputs(id,user_id,property_address,property_type,transaction_type,agent_side,sale_price,closing_date)
 VALUES
 ('a1390003-0000-4000-8000-000000000001','a1390001-0000-4000-8000-000000000004','A139 Athens 1','house','sale','seller',100000,CURRENT_DATE),
 ('a1390003-0000-4000-8000-000000000002','a1390001-0000-4000-8000-000000000004','A139 Athens 2','house','sale','seller',110000,CURRENT_DATE),
 ('a1390003-0000-4000-8000-000000000003','a1390001-0000-4000-8000-000000000004','A139 pending','house','sale','seller',120000,CURRENT_DATE),
 ('a1390003-0000-4000-8000-000000000004','a1390001-0000-4000-8000-000000000005','A139 other','house','sale','seller',130000,CURRENT_DATE);
SELECT public.admin_review_agent_data_input(id,'verified',NULL,false,
 'a1390001-0000-4000-8000-000000000001') FROM (VALUES
 ('a1390003-0000-4000-8000-000000000001'::uuid),
 ('a1390003-0000-4000-8000-000000000002'::uuid),
 ('a1390003-0000-4000-8000-000000000004'::uuid)) x(id);
RESET ROLE;
SELECT ok((SELECT count(*)=4 AND count(*) FILTER(WHERE status='verified')=3
 AND count(*) FILTER(WHERE status='pending')=1 AND bool_and(discount_applied=false)
 FROM public.agent_data_inputs WHERE id::text LIKE 'a1390003-%'),
 'normal submission and authorized review produce two eligible target inputs and controls');
CREATE TEMP TABLE a139_before_invoice AS SELECT pg_temp.a139_graph() graph;
SET LOCAL ROLE service_role;
SELECT is(current_role::text||':'||coalesce(auth.uid()::text,'none'),'service_role:none',
 'invoice call has actual service role and no JWT subject');
SELECT pg_temp.a139_attempt('reserve',$q$SELECT to_jsonb(r) FROM public.apply_verified_data_input_discount(
 'a1390001-0000-4000-8000-000000000004','in_a139',10005,'op_a139') r$q$);
RESET ROLE;
SELECT is((SELECT sqlstate FROM a139_result WHERE label='reserve'),NULL::text,'invoice reservation succeeds');
SELECT is((SELECT result FROM a139_result WHERE label='reserve'),
 jsonb_build_object('applied_count',2,'applied_pct',1.0,'expected_amount_cents',100,'operation_key','op_a139'),
 'reservation returns independently calculated two rows, one percent, rounded minor amount and key');
SELECT ok((SELECT count(*)=2 AND bool_and(discount_applied=true AND discount_applied_at=now()
 AND applied_to_invoice_at=now() AND discount_invoice_id='in_a139'
 AND stripe_credit_expected_amount_cents=100 AND stripe_credit_operation_key='op_a139'
 AND stripe_credit_id IS NULL AND stripe_credit_amount_cents IS NULL)
 FROM public.agent_data_inputs WHERE id IN
 ('a1390003-0000-4000-8000-000000000001','a1390003-0000-4000-8000-000000000002')),
 'exact eligible rows have reservation fields without a provider credit');
SELECT ok((SELECT pg_temp.a139_graph() = jsonb_set(
 jsonb_set(b.graph,'{inputs,a1390003-0000-4000-8000-000000000001}',
 b.graph->'inputs'->'a1390003-0000-4000-8000-000000000001'||
 jsonb_build_object('discount_applied',true,'discount_applied_at',now(),
 'discount_invoice_id','in_a139','applied_to_invoice_at',now(),
 'stripe_credit_expected_amount_cents',100,'stripe_credit_operation_key','op_a139',
 'updated_at',now()),false),
 '{inputs,a1390003-0000-4000-8000-000000000002}',
 b.graph->'inputs'->'a1390003-0000-4000-8000-000000000002'||
 jsonb_build_object('discount_applied',true,'discount_applied_at',now(),
 'discount_invoice_id','in_a139','applied_to_invoice_at',now(),
 'stripe_credit_expected_amount_cents',100,'stripe_credit_operation_key','op_a139',
 'updated_at',now()),false)
 FROM a139_before_invoice b),
 'reservation changes complete graph by exactly two target rows');
CREATE TEMP TABLE a139_after_invoice AS SELECT pg_temp.a139_graph() graph;
SET LOCAL ROLE service_role;
SELECT pg_temp.a139_attempt('retry',$q$SELECT to_jsonb(r) FROM public.apply_verified_data_input_discount(
 'a1390001-0000-4000-8000-000000000004','in_a139',10005,'op_a139') r$q$);
SELECT pg_temp.a139_attempt('changed_key',$q$SELECT to_jsonb(r) FROM public.apply_verified_data_input_discount(
 'a1390001-0000-4000-8000-000000000004','in_a139',10005,'op_changed') r$q$);
SELECT pg_temp.a139_attempt('changed_subtotal',$q$SELECT to_jsonb(r) FROM public.apply_verified_data_input_discount(
 'a1390001-0000-4000-8000-000000000004','in_a139',11005,'op_a139') r$q$);
RESET ROLE;
SELECT is((SELECT result FROM a139_result WHERE label='retry'),
 (SELECT result FROM a139_result WHERE label='reserve'),'same invoice retry returns identical reservation');
SELECT is((SELECT string_agg(label||':'||sqlstate||':'||message,',' ORDER BY label)
 FROM a139_result WHERE label IN ('changed_key','changed_subtotal')),
 'changed_key:P0001:credit_reservation_expectation_mismatch,changed_subtotal:P0001:credit_reservation_expectation_mismatch',
 'changed key and subtotal raise exact installed SQLSTATE and message');
SELECT is(pg_temp.a139_graph(),(SELECT graph FROM a139_after_invoice),
 'same retry and mismatch denials preserve complete graph');
SELECT * FROM finish();
ROLLBACK;
SELECT 'A139_POST',pg_backend_pid(),encode(digest(pg_temp.a139_graph()::text,'sha256'),'hex'),
 encode(digest(pg_temp.a139_catalog()::text,'sha256'),'hex');
SELECT 'A139_CATALOG_POST',pg_temp.a139_catalog()::text;
DO $$ BEGIN
 IF pg_backend_pid()<>(SELECT pid FROM a139_pre)
 OR pg_temp.a139_graph()<>(SELECT graph FROM a139_pre)
 OR pg_temp.a139_catalog()<>(SELECT catalog FROM a139_pre)
 OR EXISTS(SELECT 1 FROM auth.users WHERE id::text LIKE 'a1390001-%')
 OR EXISTS(SELECT 1 FROM public.agent_data_inputs WHERE id::text LIKE 'a1390003-%')
 THEN RAISE EXCEPTION 'rollback left graph, catalog, or fixture residue'; END IF;
END $$;
SELECT 'A139_ROLLBACK_CLEAN';
