-- Exact Edge-shaped SQL RPC contract: invalid renovation years, then two units.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source','maiprop_replay_current_20260921')
     OR current_setting('maiprop.test_disposable_database', true) IS DISTINCT FROM current_database()
     OR inet_server_addr() IS NOT NULL
     OR current_user <> 'postgres'
     OR current_setting('session_replication_role') <> 'origin' THEN
    RAISE EXCEPTION 'matching disposable local database required';
  END IF;
END $$;
SET LOCAL statement_timeout='30s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SET LOCAL search_path=public,extensions;
SELECT plan(65);

SELECT is(current_setting('session_replication_role'),'origin','normal trigger mode');
SELECT ok(NOT (SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control),'cleanup gate remains closed');
SELECT ok(NOT has_function_privilege('authenticated','public.create_new_building_listing_with_storage_for_service(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE'),'browser has no wrapper grant');
SELECT ok(has_function_privilege('service_role','public.create_new_building_listing_with_storage_for_service(uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)','EXECUTE'),'service has wrapper grant');
SELECT ok(has_function_privilege('authenticated','public.register_new_building_storage_upload(uuid,text,text,text)','EXECUTE'),'browser has registration grant');

-- Synthetic actor with normal signup and onboarding triggers; no Pro override.
INSERT INTO auth.users(id,email) VALUES ('13000001-0000-4000-8000-000000000001','task13-renovation@example.test');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','onboarding actual service role');
SELECT is(auth.uid(),NULL::uuid,'onboarding no user subject');
SELECT public.complete_onboarding_role_for_user('13000001-0000-4000-8000-000000000001','developer'::public.user_role,'developer','Task 13 Developer','Athens','+302100000000');
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
INSERT INTO public.pricing_configs(key,label,audience,module,unit,amount,is_active,metadata)
VALUES ('task13_renovation_developer','Task 13 developer','developer','developer_subscription','monthly',129,true,
        '{"stripe_product_id":"prod_task13_renovation","stripe_price_id_monthly":"price_task13_renovation"}');
INSERT INTO public.billing_subscriptions
 (user_id,stripe_customer_id,stripe_subscription_id,stripe_product_id,stripe_price_id,plan_key,audience,
  status,billing_cycle,current_period_start,current_period_end,runtime_mode,livemode,state_source,state_observed_at,
  stripe_event_id,stripe_event_created_at)
VALUES ('13000001-0000-4000-8000-000000000001','cus_task13_renovation','sub_task13_renovation',
 'prod_task13_renovation','price_task13_renovation','task13_renovation_developer','developer',
 'active','monthly',now()-interval '1 day',now()+interval '30 days',public.current_billing_runtime_mode(),
 public.current_billing_runtime_mode()='live','webhook_canonical',now(),'evt_task13_renovation',now());
SELECT is((SELECT role::text FROM public.profiles WHERE user_id='13000001-0000-4000-8000-000000000001'),'developer','authoritative developer role');
SELECT ok(NOT (SELECT force_pro_access FROM public.profiles WHERE user_id='13000001-0000-4000-8000-000000000001'),'no Pro override');
SELECT ok((SELECT role_switch_in_progress_at IS NULL AND NOT role_switch_audit_required FROM public.profiles WHERE user_id='13000001-0000-4000-8000-000000000001'),'no role switch');
SELECT ok(private.has_current_billing_subscription_for_user('13000001-0000-4000-8000-000000000001'),'canonical billing subscription recognized');
SELECT ok(private.has_developer_listing_access('13000001-0000-4000-8000-000000000001'),'developer listing access recognized');
SELECT ok(public.is_pro('13000001-0000-4000-8000-000000000001'),'actor is Pro by ledger');
SELECT ok(public.get_listing_limit('13000001-0000-4000-8000-000000000001') >
 (SELECT count(*) FROM public.listings WHERE owner_id='13000001-0000-4000-8000-000000000001' AND status='active'),
 'listing quota exceeds starting active count');

SET LOCAL app.settings.supabase_url='https://task13.example.test';
CREATE TEMP TABLE nb_case AS SELECT
 '13000001-0000-4000-8000-000000000001'::uuid actor,
 '13000002-0000-4000-8000-000000000001'::uuid project_id,
 '13000001-0000-4000-8000-000000000001/13000002-0000-4000-8000-000000000001/create/'::text path_prefix,
 'https://task13.example.test/storage/v1/object/public/'::text url_prefix;
CREATE TEMP VIEW nb_input AS SELECT
 jsonb_build_object('id',project_id,'name','  Task 13 Renovation  ','city','Athens','address','Synthetic 1',
   'latitude',37.9838,'longitude',23.7275,'construction_year',2020,'renovation_year',2026,
   'developer_company','Fixture Developer','description','Two unit renovation') AS project,
 '[{"unit_id":"HIGH","floor":4,"internal_sqm":100.005,"price":345678.995,"bedrooms":3,"bathrooms":2,"energy_class":"A"},{"unit_id":"LOW","floor":1,"internal_sqm":70.345,"price":123456.785,"bedrooms":2,"bathrooms":1,"energy_class":"B"}]'::jsonb AS units,
 jsonb_build_array(jsonb_build_object('url',url_prefix||'project-media/'||path_prefix||'plan.pdf','media_type','floor_plan','title','Floor plan','sort_order',2)) AS media,
 jsonb_build_object('title',' Task 13 Listing ','description','Renovated flats','cover_image_url',url_prefix||'listing-images/'||path_prefix||'cover.jpg') AS listing,
 jsonb_build_array(url_prefix||'listing-images/'||path_prefix||'second.jpg') AS images,
 jsonb_build_array(
   jsonb_build_object('bucket','listing-images','object_path',path_prefix||'cover.jpg'),
   jsonb_build_object('bucket','listing-images','object_path',path_prefix||'second.jpg'),
   jsonb_build_object('bucket','project-media','object_path',path_prefix||'plan.pdf')) AS manifest
 FROM nb_case;
GRANT SELECT ON nb_case,nb_input TO authenticated,service_role;
SELECT set_config('request.jwt.claim.sub','13000001-0000-4000-8000-000000000001',true),
       set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"13000001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user,'authenticated','registration actual browser role');
SELECT is(auth.uid(),'13000001-0000-4000-8000-000000000001'::uuid,'registration actor subject');
SELECT is(auth.jwt()->>'role','authenticated','registration JWT role');
SELECT is(auth.jwt()->>'sub','13000001-0000-4000-8000-000000000001','registration JWT subject');
SELECT public.register_new_building_storage_upload(project_id,'listing-images',path_prefix||'cover.jpg',url_prefix||'listing-images/'||path_prefix||'cover.jpg') FROM nb_case;
SELECT public.register_new_building_storage_upload(project_id,'listing-images',path_prefix||'second.jpg',url_prefix||'listing-images/'||path_prefix||'second.jpg') FROM nb_case;
SELECT public.register_new_building_storage_upload(project_id,'project-media',path_prefix||'plan.pdf',url_prefix||'project-media/'||path_prefix||'plan.pdf') FROM nb_case;
RESET ROLE;
SELECT is((SELECT count(*) FROM public.storage_cleanup_jobs WHERE project_id=(SELECT project_id FROM nb_case)),3::bigint,'three real registrations');
SELECT is((SELECT count(*) FROM public.storage_cleanup_jobs WHERE project_id=(SELECT project_id FROM nb_case) AND status='pending' AND reason='new_build_upload'),3::bigint,'all registrations pending');

CREATE TEMP VIEW nb_state AS SELECT jsonb_build_object(
 'auth',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM auth.users x WHERE id=(SELECT actor FROM nb_case)),
 'profile',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.profiles x WHERE user_id=(SELECT actor FROM nb_case)),
 'profile_public',(SELECT jsonb_agg(to_jsonb(x) ORDER BY user_id) FROM public.profiles_public x WHERE user_id=(SELECT actor FROM nb_case)),
 'pricing',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.pricing_configs x WHERE key='task13_renovation_developer'),
 'billing',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.billing_subscriptions x WHERE stripe_subscription_id='sub_task13_renovation'),
 'projects',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.projects x WHERE id=(SELECT project_id FROM nb_case)),
 'units',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.project_units x WHERE project_id=(SELECT project_id FROM nb_case)),
 'listings',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.listings x WHERE project_id=(SELECT project_id FROM nb_case)),
 'images',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.listing_images x WHERE listing_id IN (SELECT id FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case))),
 'media',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.project_media x WHERE project_id=(SELECT project_id FROM nb_case)),
 'jobs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.storage_cleanup_jobs x WHERE project_id=(SELECT project_id FROM nb_case)),
 'notifications',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.notifications x WHERE user_id=(SELECT actor FROM nb_case)),
 'allocations',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.listing_promotion_allocations x WHERE owner_id=(SELECT actor FROM nb_case)),
 'admin_audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.admin_audit_log x WHERE actor_id=(SELECT actor FROM nb_case) OR target_id=(SELECT actor FROM nb_case)),
 'privacy_audit',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM public.privacy_audit_log x WHERE actor_id=(SELECT actor FROM nb_case) OR target_user_id=(SELECT actor FROM nb_case))
) AS state;
CREATE TEMP TABLE nb_before AS SELECT state FROM nb_state;
SELECT state AS complete_state_before_denial FROM nb_before;
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','invalid request actual service role');
SELECT is(auth.uid(),NULL::uuid,'invalid request has no user subject');
SELECT is(auth.jwt()->>'role','service_role','invalid request JWT role');
SELECT is(auth.jwt()->>'sub',NULL::text,'invalid request JWT has no subject');
SELECT throws_ok($q$SELECT public.create_new_building_listing_with_storage_for_service(
  '13000001-0000-4000-8000-000000000001',NULL,'renovation',
  project||'{"renovation_year":2019}'::jsonb,units,media,listing,images,manifest) FROM nb_input$q$,
  '22023','renovation_years_invalid','invalid chronology denied by child through wrapper');
RESET ROLE;
SELECT is((SELECT state FROM nb_state),(SELECT state FROM nb_before),'invalid year leaves entire scoped graph unchanged');
SELECT state AS complete_state_after_denial FROM nb_state;

SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','valid request actual service role');
SELECT is(auth.uid(),NULL::uuid,'valid request has no user subject');
SELECT is(auth.jwt()->>'role','service_role','valid request JWT role');
SELECT is(auth.jwt()->>'sub',NULL::text,'valid request JWT has no subject');
CREATE TEMP TABLE nb_return AS SELECT public.create_new_building_listing_with_storage_for_service(
  '13000001-0000-4000-8000-000000000001',NULL,'renovation',project,units,media,listing,images,manifest) AS result FROM nb_input;
RESET ROLE;
SELECT is((SELECT result->>'projectId' FROM nb_return),(SELECT project_id::text FROM nb_case),'returned project ID');
SELECT is((SELECT result->>'listingId' FROM nb_return),(SELECT id::text FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case)),'returned listing ID');
SELECT is((SELECT result->>'idempotent' FROM nb_return),'false','first valid result not idempotent');
SELECT is((SELECT result FROM nb_return),jsonb_build_object(
 'listingId',(SELECT id FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case)),
 'projectId',(SELECT project_id FROM nb_case),'idempotent',false),'complete first-call return JSON');
SELECT result AS complete_return_json FROM nb_return;
SELECT is((SELECT count(*) FROM public.project_units WHERE project_id=(SELECT project_id FROM nb_case)),2::bigint,'two linked units');
SELECT is((SELECT count(*) FROM public.project_units WHERE project_id=(SELECT project_id FROM nb_case) AND listing_id=(SELECT result->>'listingId' FROM nb_return)::uuid),2::bigint,'both units link to representative');
SELECT is((SELECT jsonb_build_array(price,sqm,price_per_sqm,construction_status,year_built,tags) FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case)),
 '[123456.79,70.35,1754.89,"renovated",2020,["renovation_project","renovation_year:2026"]]'::jsonb,
 'cheapest second submitted unit drives representative and renovation metadata');
SELECT is((SELECT jsonb_agg(jsonb_build_array(unit_id,price,internal_sqm,price_per_sqm) ORDER BY unit_id) FROM public.project_units WHERE project_id=(SELECT project_id FROM nb_case)),
 '[["HIGH",345679.00,100.01,3456.44],["LOW",123456.79,70.35,1754.89]]'::jsonb,'unit prices and sqm rounded independently');
SELECT is((SELECT count(*) FROM public.project_media WHERE project_id=(SELECT project_id FROM nb_case) AND media_type='floor_plan' AND sort_order=2),1::bigint,'typed floor plan persisted');
SELECT is((SELECT count(*) FROM public.listing_images WHERE listing_id=(SELECT result->>'listingId' FROM nb_return)::uuid AND sort_order=1),1::bigint,'ordered additional image persisted');
SELECT is((SELECT count(*) FROM public.storage_cleanup_jobs WHERE project_id=(SELECT project_id FROM nb_case) AND status='completed'),3::bigint,'all registered jobs completed');
-- Build default-complete expected rows from the pinned catalog and independent
-- request values. Only generated identities/clocks are bound from output.
CREATE FUNCTION pg_temp.nb_expected_row(p_table regclass,p_overrides jsonb)
RETURNS jsonb LANGUAGE plpgsql AS $fn$
DECLARE c record; v jsonb; result jsonb := '{}'::jsonb;
BEGIN
  FOR c IN SELECT a.attname,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_expr
           FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
           WHERE a.attrelid=p_table AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum LOOP
    IF c.attgenerated <> '' THEN CONTINUE; END IF;
    IF p_overrides ? c.attname THEN v:=p_overrides->c.attname;
    ELSIF c.default_expr IS NULL THEN v:='null'::jsonb;
    ELSIF c.default_expr='gen_random_uuid()' THEN RAISE EXCEPTION 'unbound generated id in %',p_table;
    ELSE EXECUTE 'SELECT to_jsonb('||c.default_expr||')' INTO v;
    END IF;
    result:=result||jsonb_build_object(c.attname,v);
  END LOOP;
  RETURN result;
END $fn$;
SELECT ok((SELECT bool_and(created_at >= transaction_timestamp() AND created_at <= clock_timestamp()
       AND updated_at >= transaction_timestamp() AND updated_at <= clock_timestamp())
  FROM public.projects WHERE id=(SELECT project_id FROM nb_case)),'project clocks bounded');
SELECT ok((SELECT bool_and(created_at >= transaction_timestamp() AND created_at <= clock_timestamp()
       AND updated_at >= transaction_timestamp() AND updated_at <= clock_timestamp())
  FROM public.project_units WHERE project_id=(SELECT project_id FROM nb_case)),'unit clocks bounded');
SELECT ok((SELECT bool_and(created_at >= transaction_timestamp() AND created_at <= clock_timestamp()
       AND updated_at >= transaction_timestamp() AND updated_at <= clock_timestamp())
  FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case)),'listing clocks bounded');
SELECT ok((SELECT bool_and(created_at >= transaction_timestamp() AND created_at <= clock_timestamp()
       AND completed_at >= transaction_timestamp() AND completed_at <= clock_timestamp()
       AND updated_at >= transaction_timestamp() AND updated_at <= clock_timestamp()
       AND next_attempt_at BETWEEN transaction_timestamp()+interval '24 hours' AND clock_timestamp()+interval '24 hours')
  FROM public.storage_cleanup_jobs WHERE project_id=(SELECT project_id FROM nb_case)),'all cleanup clocks bounded');
SELECT is((SELECT to_jsonb(p) FROM public.projects p WHERE id=(SELECT project_id FROM nb_case)),
 (SELECT pg_temp.nb_expected_row('public.projects',jsonb_build_object(
   'id',project_id,'owner_id',actor,'organization_id',NULL,'name','Task 13 Renovation',
   'city','Athens','address','Synthetic 1','description','Two unit renovation',
   'developer_company','Fixture Developer','latitude',37.9838,'longitude',23.7275,
   'created_at',(SELECT created_at FROM public.projects WHERE id=project_id),
   'updated_at',(SELECT updated_at FROM public.projects WHERE id=project_id))) FROM nb_case),
 'complete renovation project row');
SELECT is((SELECT jsonb_agg(to_jsonb(u) ORDER BY unit_id) FROM public.project_units u WHERE project_id=(SELECT project_id FROM nb_case)),
 (SELECT jsonb_agg(pg_temp.nb_expected_row('public.project_units',jsonb_build_object(
   'id',u.id,'project_id',c.project_id,'listing_id',(SELECT result->>'listingId' FROM nb_return)::uuid,
   'unit_id',u.unit_id,'floor',CASE u.unit_id WHEN 'HIGH' THEN 4 ELSE 1 END,
   'availability_status','available','internal_sqm',CASE u.unit_id WHEN 'HIGH' THEN 100.01 ELSE 70.35 END,
   'price',CASE u.unit_id WHEN 'HIGH' THEN 345679.00 ELSE 123456.79 END,
   'price_per_sqm',CASE u.unit_id WHEN 'HIGH' THEN 3456.44 ELSE 1754.89 END,
   'bedrooms',CASE u.unit_id WHEN 'HIGH' THEN 3 ELSE 2 END,
   'bathrooms',CASE u.unit_id WHEN 'HIGH' THEN 2 ELSE 1 END,
   'energy_class',CASE u.unit_id WHEN 'HIGH' THEN 'A' ELSE 'B' END,
   'created_at',u.created_at,'updated_at',u.updated_at)) ORDER BY u.unit_id)
  FROM public.project_units u CROSS JOIN nb_case c WHERE u.project_id=c.project_id),
 'complete two-unit rows including defaults');
SELECT is((SELECT to_jsonb(l)-'location_search_text'-'os_auction_id' FROM public.listings l WHERE project_id=(SELECT project_id FROM nb_case)),
 (SELECT pg_temp.nb_expected_row('public.listings',jsonb_build_object(
   'id',l.id,'owner_id',c.actor,'organization_id',NULL,'project_id',c.project_id,
   'title','Task 13 Listing','description','Renovated flats','city','Athens','address','Synthetic 1',
   'latitude',37.9838,'longitude',23.7275,'property_type','apartment','listing_type','new_build',
   'price',123456.79,'sqm',70.35,'price_per_sqm',1754.89,'bedrooms',2,'bathrooms',1,'floor',1,
   'energy_class','B','construction_status','renovated','year_built',2020,
   'cover_image_url',c.url_prefix||'listing-images/'||c.path_prefix||'cover.jpg',
   'status','active','is_pre_sale',false,
   'tags',jsonb_build_array('renovation_project','renovation_year:2026'),
   'created_at',l.created_at,'updated_at',l.updated_at))
  FROM public.listings l CROSS JOIN nb_case c WHERE l.project_id=c.project_id),
 'complete representative listing row including defaults');
SELECT is((SELECT location_search_text FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case)),
 public.expand_location_search_aliases(public.normalize_location_text('Task 13 Listing Synthetic 1 Athens  ')),
 'generated location text matches independent listing input');
SELECT is((SELECT os_auction_id FROM public.listings WHERE project_id=(SELECT project_id FROM nb_case)),NULL::text,'generated auction ID absent for renovation listing');
SELECT is((SELECT to_jsonb(m) FROM public.project_media m WHERE project_id=(SELECT project_id FROM nb_case)),
 (SELECT pg_temp.nb_expected_row('public.project_media',jsonb_build_object(
   'id',m.id,'project_id',c.project_id,'url',c.url_prefix||'project-media/'||c.path_prefix||'plan.pdf',
   'media_type','floor_plan','title','Floor plan','sort_order',2,'created_at',m.created_at))
  FROM public.project_media m CROSS JOIN nb_case c WHERE m.project_id=c.project_id),
 'complete typed project media row');
SELECT is((SELECT to_jsonb(i) FROM public.listing_images i WHERE listing_id=(SELECT result->>'listingId' FROM nb_return)::uuid),
 (SELECT pg_temp.nb_expected_row('public.listing_images',jsonb_build_object(
   'id',i.id,'listing_id',(SELECT result->>'listingId' FROM nb_return)::uuid,
   'url',c.url_prefix||'listing-images/'||c.path_prefix||'second.jpg',
   'sort_order',1,'created_at',i.created_at))
  FROM public.listing_images i CROSS JOIN nb_case c WHERE i.listing_id=(SELECT result->>'listingId' FROM nb_return)::uuid),
 'complete ordered listing image row');
SELECT is((SELECT jsonb_agg(to_jsonb(j) ORDER BY bucket,object_path) FROM public.storage_cleanup_jobs j WHERE project_id=(SELECT project_id FROM nb_case)),
 (SELECT jsonb_agg(pg_temp.nb_expected_row('public.storage_cleanup_jobs',jsonb_build_object(
   'id',j.id,'bucket',j.bucket,'object_path',c.path_prefix||suffix,
   'object_url',c.url_prefix||j.bucket||'/'||c.path_prefix||suffix,
   'owner_id',c.actor,'project_id',c.project_id,'reason','new_build_upload','status','completed',
   'attempts',0,'next_attempt_at',j.next_attempt_at,'created_at',j.created_at,
   'updated_at',j.updated_at,'completed_at',j.completed_at)) ORDER BY j.bucket,j.object_path)
  FROM public.storage_cleanup_jobs j CROSS JOIN nb_case c
  CROSS JOIN LATERAL (SELECT CASE WHEN j.bucket='project-media' THEN 'plan.pdf'
                                  WHEN j.object_path LIKE '%/cover.jpg' THEN 'cover.jpg'
                                  ELSE 'second.jpg' END AS suffix) n
  WHERE j.project_id=c.project_id),
 'complete three settled cleanup rows');
SELECT is((SELECT state->'profile' FROM nb_state),(SELECT state->'profile' FROM nb_before),'creation preserves full developer profile');
SELECT is((SELECT state->'profile_public' FROM nb_state),(SELECT state->'profile_public' FROM nb_before),'creation preserves public profile neighbor');
SELECT is((SELECT state->'billing' FROM nb_state),(SELECT state->'billing' FROM nb_before),'creation preserves full canonical ledger');
SELECT is((SELECT state->'notifications' FROM nb_state),(SELECT state->'notifications' FROM nb_before),'notification neighbors unchanged');
SELECT is((SELECT state->'allocations' FROM nb_state),(SELECT state->'allocations' FROM nb_before),'promotion allocation neighbors unchanged');
SELECT is((SELECT state->'admin_audit' FROM nb_state),(SELECT state->'admin_audit' FROM nb_before),'admin audit neighbors unchanged');
SELECT is((SELECT state->'privacy_audit' FROM nb_state),(SELECT state->'privacy_audit' FROM nb_before),'privacy audit neighbors unchanged');
CREATE TEMP TABLE nb_after AS SELECT state FROM nb_state;
SELECT state AS complete_state_after_creation FROM nb_after;
SELECT set_config('request.jwt.claim.sub','13000001-0000-4000-8000-000000000001',true),
       set_config('request.jwt.claim.role','authenticated',true),
       set_config('request.jwt.claims','{"role":"authenticated","sub":"13000001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user,'authenticated','direct wrapper denial actual browser role');
SELECT is(auth.uid(),'13000001-0000-4000-8000-000000000001'::uuid,'direct wrapper denial actor subject');
SELECT is(auth.jwt()->>'role','authenticated','direct wrapper denial JWT role');
SELECT throws_ok($q$SELECT public.create_new_building_listing_with_storage_for_service(
  '13000001-0000-4000-8000-000000000001',NULL,'renovation',project,units,media,listing,images,manifest)
  FROM nb_input$q$,'42501','permission denied for function create_new_building_listing_with_storage_for_service',
 'direct browser wrapper call denied by installed grant');
RESET ROLE;
SELECT is((SELECT state FROM nb_state),(SELECT state FROM nb_after),'direct wrapper denial leaves complete graph unchanged');
SELECT * FROM finish();
ROLLBACK;
