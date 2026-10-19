\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_t13_project_firesale_[0-9]{8}_[0-9]{2}|maiprop_d0_[a-z0-9_]{6,48})$'
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 THEN RAISE EXCEPTION 'project/firesale suite requires exact owned disposable socket clone'; END IF;
END $$;
CREATE FUNCTION pg_temp.pf_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM auth.users x),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles x),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(x)),'{}'::jsonb) FROM public.profiles_public x),
 'pricing',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.pricing_configs x),
 'billing',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.billing_subscriptions x),
 'projects',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.projects x),
 'units',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.project_units x),
 'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.listings x),
 'images',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.listing_images x),
 'media',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.project_media x),
 'jobs',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.storage_cleanup_jobs x),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.notifications x),
 'allocations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.listing_promotion_allocations x),
 'admin_audit',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.admin_audit_log x),
 'privacy_audit',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(x)),'{}'::jsonb) FROM public.privacy_audit_log x))
$$;
CREATE FUNCTION pg_temp.pf_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('sha',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl,'expanded_acl',(SELECT jsonb_agg(to_jsonb(a) ORDER BY grantee,privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a))) FROM pg_proc p WHERE p.oid IN ('public.create_new_building_listing_with_storage_for_service(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::regprocedure,'public.register_new_building_storage_upload(uuid,text,text,text)'::regprocedure,'public.update_listing_cover_with_storage_for_service(uuid,uuid,uuid,text)'::regprocedure,'public.delete_listing_for_user(uuid)'::regprocedure,'private.delete_listing_for_actor(uuid)'::regprocedure,'public.complete_onboarding_role_for_user(uuid,public.user_role,text,text,text,text)'::regprocedure,'private.has_platform_admin(uuid)'::regprocedure,'public.has_platform_admin(uuid)'::regprocedure) OR p.oid IN (SELECT tgfoid FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.projects'::regclass,'public.project_units'::regclass,'public.listings'::regclass,'public.listing_images'::regclass,'public.storage_cleanup_jobs'::regclass) AND NOT tgisinternal)),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'definition',pg_get_triggerdef(oid,true)) ORDER BY tgrelid::regclass::text,tgname),'[]'::jsonb) FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.projects'::regclass,'public.project_units'::regclass,'public.listings'::regclass,'public.listing_images'::regclass,'public.storage_cleanup_jobs'::regclass) AND NOT tgisinternal),
 'tables',(SELECT jsonb_object_agg(c.oid::regclass::text,jsonb_build_object('owner',pg_get_userbyid(c.relowner),'acl',c.relacl,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'columns',(SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',polname,'cmd',polcmd,'roles',polroles,'using',pg_get_expr(polqual,polrelid),'check',pg_get_expr(polwithcheck,polrelid)) ORDER BY polname),'[]'::jsonb) FROM pg_policy WHERE polrelid=c.oid))) FROM pg_class c WHERE c.oid IN ('auth.users'::regclass,'public.profiles'::regclass,'public.projects'::regclass,'public.project_units'::regclass,'public.listings'::regclass,'public.listing_images'::regclass,'public.project_media'::regclass,'public.storage_cleanup_jobs'::regclass)),
 'fks',(SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'ref',confrelid::regclass::text,'delete',confdeltype,'def',pg_get_constraintdef(oid)) ORDER BY conrelid::regclass::text,conname) FROM pg_constraint WHERE contype='f' AND confrelid='public.listings'::regclass),
 'effective',(SELECT jsonb_object_agg(r,jsonb_build_object('public',has_schema_privilege(r,'public','USAGE'),'private',has_schema_privilege(r,'private','USAGE'),'cover',has_function_privilege(r,'public.update_listing_cover_with_storage_for_service(uuid,uuid,uuid,text)','EXECUTE'),'delete',has_function_privilege(r,'public.delete_listing_for_user(uuid)','EXECUTE'),'registration',has_function_privilege(r,'public.register_new_building_storage_upload(uuid,text,text,text)','EXECUTE'),'listings_select',has_table_privilege(r,'public.listings','SELECT'),'listings_delete',has_table_privilege(r,'public.listings','DELETE'))) FROM (VALUES('postgres'),('anon'),('authenticated'),('service_role')) q(r)))
$$;
CREATE TEMP TABLE pf_baseline AS SELECT pg_backend_pid() pid,current_user db_role,session_user session_role,current_setting('maiprop.test_disposable_database',true) marker,current_setting('session_replication_role') origin,auth.uid() actor,auth.jwt() jwt,pg_temp.pf_catalog() catalog,pg_temp.pf_graph() graph;
SELECT 'PF_PRE',pid,db_role,session_role,marker,origin,actor,encode(digest(catalog::text,'sha256'),'hex'),encode(digest(graph::text,'sha256'),'hex') FROM pf_baseline;
BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SELECT plan(27);
SELECT is(current_setting('session_replication_role'),'origin','normal triggers active');
SELECT ok(NOT (SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control),'cleanup gate closed');
SELECT ok((SELECT bool_and(tgenabled='O') FROM pg_trigger WHERE tgrelid IN ('auth.users'::regclass,'public.projects'::regclass,'public.project_units'::regclass,'public.listings'::regclass,'public.listing_images'::regclass) AND NOT tgisinternal),'relevant triggers enabled');
SELECT is((SELECT catalog->'routines'->'update_listing_cover_with_storage_for_service(uuid,uuid,uuid,text)'->>'sha' FROM pf_baseline),'56ba2f52db52288c3b125bbd59f84d9b3e746e8371fb230a7ca3cd714e84f6a7','cover installed identity');
SELECT is((SELECT catalog->'routines'->'private.delete_listing_for_actor(uuid)'->>'sha' FROM pf_baseline),'05bd38a53a68d1c3dcc44195c1927743b26c24812d4d1dde4fb047264fc3f5c4','delete installed identity');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE 'a13f0001-%'),0,'fixture namespace unused');
INSERT INTO auth.users(id,email) VALUES ('a13f0001-0000-4000-8000-000000000001','pf-owner@example.test'),('a13f0001-0000-4000-8000-000000000002','pf-foreign@example.test');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user('a13f0001-0000-4000-8000-000000000001','developer','developer','PF Developer','Athens','+302100000000');
SELECT public.complete_onboarding_role_for_user('a13f0001-0000-4000-8000-000000000002','seller','seller');
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
INSERT INTO public.pricing_configs(key,label,audience,module,unit,amount,is_active,metadata) VALUES ('pf_project_developer','PF developer','developer','developer_subscription','monthly',129,true,'{"stripe_product_id":"prod_pf_project","stripe_price_id_monthly":"price_pf_project"}');
INSERT INTO public.billing_subscriptions(user_id,stripe_customer_id,stripe_subscription_id,stripe_product_id,stripe_price_id,plan_key,audience,status,billing_cycle,current_period_start,current_period_end,runtime_mode,livemode,state_source,state_observed_at,stripe_event_id,stripe_event_created_at) VALUES ('a13f0001-0000-4000-8000-000000000001','cus_pf_project','sub_pf_project','prod_pf_project','price_pf_project','pf_project_developer','developer','active','monthly',now()-interval '1 day',now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live','webhook_canonical',now(),'evt_pf_project',now());
SELECT ok(private.has_developer_listing_access('a13f0001-0000-4000-8000-000000000001'),'canonical developer access');
SET LOCAL app.settings.supabase_url='https://pf.example.test';
CREATE TEMP TABLE pf_case AS SELECT 'a13f0001-0000-4000-8000-000000000001'::uuid actor,'a13f0002-0000-4000-8000-000000000001'::uuid project_id,'a13f0001-0000-4000-8000-000000000001/a13f0002-0000-4000-8000-000000000001/create/'::text path,'https://pf.example.test/storage/v1/object/public/listing-images/'::text url;
CREATE TEMP VIEW pf_input AS SELECT jsonb_build_object('id',project_id,'name','PF Project','city','Athens','building_permit_number','TEST') project,'[{"unit_id":"A1","internal_sqm":80,"price":200000}]'::jsonb units,'[]'::jsonb media,jsonb_build_object('title','PF Listing','cover_image_url',url||path||'cover.jpg') listing,jsonb_build_array(url||path||'second.jpg') images,jsonb_build_array(jsonb_build_object('bucket','listing-images','object_path',path||'cover.jpg'),jsonb_build_object('bucket','listing-images','object_path',path||'second.jpg')) manifest FROM pf_case;
GRANT SELECT ON pf_case,pf_input TO authenticated,service_role;
SELECT set_config('request.jwt.claim.sub','a13f0001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"a13f0001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT public.register_new_building_storage_upload(project_id,'listing-images',path||'cover.jpg',url||path||'cover.jpg') FROM pf_case;
SELECT public.register_new_building_storage_upload(project_id,'listing-images',path||'second.jpg',url||path||'second.jpg') FROM pf_case;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE pf_creation AS SELECT public.create_new_building_listing_with_storage_for_service('a13f0001-0000-4000-8000-000000000001',NULL,'new_build',project,units,media,listing,images,manifest) result FROM pf_input;
RESET ROLE;
SELECT is((SELECT result FROM pf_creation),jsonb_build_object('projectId','a13f0002-0000-4000-8000-000000000001','listingId',(SELECT id FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001'),'idempotent',false),'normal project creation return');
GRANT SELECT ON pf_creation TO authenticated;
SELECT is((SELECT count(*)::integer FROM public.project_units WHERE project_id='a13f0002-0000-4000-8000-000000000001' AND listing_id=(SELECT id FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001')),1,'linked unit');
SELECT is((SELECT count(*)::integer FROM public.listing_images WHERE listing_id=(SELECT id FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001')),1,'attached image');
CREATE TEMP TABLE pf_before AS SELECT pg_temp.pf_graph() graph;
SELECT set_config('request.jwt.claim.sub','a13f0001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"a13f0001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT public.register_new_building_storage_upload(project_id,'listing-images',path||'replacement.jpg',url||path||'replacement.jpg') FROM pf_case;
RESET ROLE;
CREATE TEMP TABLE pf_registered AS SELECT pg_temp.pf_graph() graph;
SELECT is((SELECT graph->'jobs' FROM pf_registered),(SELECT graph->'jobs' FROM pf_before) || (SELECT jsonb_build_object(id::text,to_jsonb(j)) FROM public.storage_cleanup_jobs j WHERE object_path LIKE '%/replacement.jpg'),'new ticket alone added');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
CREATE TEMP TABLE pf_cover_result AS SELECT public.update_listing_cover_with_storage_for_service('a13f0001-0000-4000-8000-000000000001',project_id,(SELECT id FROM public.listings WHERE project_id=pf_case.project_id),url||path||'replacement.jpg') result FROM pf_case;
RESET ROLE;
SELECT is((SELECT result FROM pf_cover_result),(SELECT to_jsonb(l) FROM public.listings l WHERE project_id='a13f0002-0000-4000-8000-000000000001'),'complete cover return equals persisted listing');
SELECT is((SELECT result FROM pf_cover_result),(SELECT graph->'listings'->(SELECT id::text FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001') FROM pf_registered)||jsonb_build_object('cover_image_url',(SELECT url||path||'replacement.jpg' FROM pf_case),'updated_at',now()),'complete cover return independently modeled from prestate');
SELECT is((SELECT result->>'cover_image_url' FROM pf_cover_result),(SELECT url||path||'replacement.jpg' FROM pf_case),'replacement URL persisted');
SELECT is((SELECT graph->'jobs'->j.id::text FROM pf_registered,pf_case,public.storage_cleanup_jobs j WHERE j.object_path=pf_case.path||'cover.jpg'),(SELECT to_jsonb(j) FROM pf_case,public.storage_cleanup_jobs j WHERE j.object_path=pf_case.path||'cover.jpg'),'former cover ticket unchanged');
SELECT ok((SELECT status='completed' AND completed_at IS NOT NULL AND lease_token IS NULL AND lease_expires_at IS NULL AND last_error IS NULL FROM public.storage_cleanup_jobs WHERE object_path LIKE '%/replacement.jpg'),'new ticket completed and cleared');
WITH expected AS (SELECT jsonb_set(jsonb_set(graph,ARRAY['listings',(SELECT id::text FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001')],(graph->'listings'->(SELECT id::text FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001'))||jsonb_build_object('cover_image_url',(SELECT url||path||'replacement.jpg' FROM pf_case),'updated_at',now())),ARRAY['jobs',(SELECT id::text FROM public.storage_cleanup_jobs WHERE object_path LIKE '%/replacement.jpg')],(graph->'jobs'->(SELECT id::text FROM public.storage_cleanup_jobs WHERE object_path LIKE '%/replacement.jpg'))||jsonb_build_object('status','completed','completed_at',now(),'updated_at',now(),'last_error',NULL,'lease_token',NULL,'lease_expires_at',NULL)) graph FROM pf_registered) SELECT is(pg_temp.pf_graph(),(SELECT graph FROM expected),'cover exact full graph');
CREATE TEMP TABLE pf_after_cover AS SELECT pg_temp.pf_graph() graph;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.update_listing_cover_with_storage_for_service('a13f0001-0000-4000-8000-000000000001','a13f0002-0000-4000-8000-000000000001',(SELECT id FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001'),'https://pf.example.test/storage/v1/object/public/listing-images/a13f0001-0000-4000-8000-000000000001/a13f0002-0000-4000-8000-000000000001/create/unregistered.jpg')$q$,'55000','storage_upload_not_registered','unregistered replacement denied');
RESET ROLE;
SELECT is(pg_temp.pf_graph(),(SELECT graph FROM pf_after_cover),'cover denial leaves full graph unchanged');
SELECT set_config('request.jwt.claim.sub','a13f0001-0000-4000-8000-000000000002',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"a13f0001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE authenticated;
SELECT throws_ok(format('SELECT public.delete_listing_for_user(%L)',(SELECT result->>'listingId' FROM pf_creation)),'42501','listing_not_managed','foreign seller cannot delete project listing');
RESET ROLE;
SELECT is(pg_temp.pf_graph(),(SELECT graph FROM pf_after_cover),'foreign denial leaves full graph unchanged');
SELECT set_config('request.jwt.claim.sub','a13f0001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"a13f0001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT public.delete_listing_for_user((SELECT result->>'listingId' FROM pf_creation)::uuid) AS deleted \gset
RESET ROLE;
SELECT is(:'deleted'::boolean,true,'owner ordinary delete returns true');
SELECT is((SELECT count(*)::integer FROM public.listings WHERE project_id='a13f0002-0000-4000-8000-000000000001'),0,'project listing removed');
SELECT is((SELECT count(*)::integer FROM public.listing_images WHERE listing_id=(SELECT result->>'listingId' FROM pf_creation)::uuid),0,'attached image cascades');
SELECT is((SELECT count(*)::integer FROM public.project_units WHERE project_id='a13f0002-0000-4000-8000-000000000001' AND listing_id IS NULL),1,'unit survives detached');
WITH removed AS (
 SELECT jsonb_set(graph,'{listings}',(graph->'listings')-(SELECT result->>'listingId' FROM pf_creation)) graph
 FROM pf_after_cover
), images_removed AS (
 SELECT jsonb_set(graph,'{images}',(SELECT coalesce(jsonb_object_agg(k,value),'{}'::jsonb)
  FROM jsonb_each(graph->'images') q(k,value)
  WHERE value->>'listing_id' IS DISTINCT FROM (SELECT result->>'listingId' FROM pf_creation))) graph
 FROM removed
), expected AS (
 SELECT jsonb_set(graph,'{units}',(SELECT jsonb_object_agg(k,CASE
  WHEN value->>'project_id'='a13f0002-0000-4000-8000-000000000001'
  THEN value||'{"listing_id":null}'::jsonb ELSE value END)
  FROM jsonb_each(graph->'units') q(k,value))) graph FROM images_removed
)
SELECT is(pg_temp.pf_graph(),(SELECT graph FROM expected),'ordinary delete exact complete graph');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','',true),set_config('request.jwt.claims','{}',true);
SELECT is(pg_temp.pf_catalog(),(SELECT catalog FROM pf_baseline),'same backend catalog unchanged');
SELECT * FROM finish();
ROLLBACK;
SELECT 'PF_POST',pg_backend_pid(),current_user,session_user,current_setting('maiprop.test_disposable_database',true),current_setting('session_replication_role'),auth.uid(),encode(digest(pg_temp.pf_catalog()::text,'sha256'),'hex'),encode(digest(pg_temp.pf_graph()::text,'sha256'),'hex');
SELECT (SELECT catalog FROM pf_baseline)=pg_temp.pf_catalog() AS catalog_restored,(SELECT graph FROM pf_baseline)=pg_temp.pf_graph() AS graph_restored,(SELECT pid FROM pf_baseline)=pg_backend_pid() AS same_backend;
DROP TABLE pg_temp.pf_baseline;
