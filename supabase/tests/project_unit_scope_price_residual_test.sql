\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
     OR inet_server_addr() IS NOT NULL
     OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source') THEN
    RAISE EXCEPTION 'Explicit matching disposable socket database required';
  END IF;
END $$;
SET LOCAL statement_timeout='30s';
SET LOCAL lock_timeout='3s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SET LOCAL search_path=public,extensions;
SELECT plan(50);

SELECT is(current_setting('session_replication_role'),'origin','normal triggers active before fixture setup');
SELECT ok(NOT (SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control WHERE singleton),'cleanup stays disabled');
SELECT ok(has_function_privilege('service_role','public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)','EXECUTE')
  AND NOT has_function_privilege('anon','public.bulk_update_project_unit_prices_for_user(uuid,uuid,numeric)','EXECUTE'),'explicit-user price RPC is service-only');
SELECT ok(has_function_privilege('service_role','public.bulk_update_project_unit_prices(uuid,numeric)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.bulk_update_project_unit_prices(uuid,numeric)','EXECUTE'),'legacy price RPC is service-only');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgname IN ('trg_guard_project_units_project_scope','trg_guard_project_media_project_scope') AND tgenabled='O'),2,'unit and media scope triggers enabled');

-- All identities and entitlement changes use the ordinary signup/onboarding triggers.
INSERT INTO auth.users(id,email) VALUES
 ('d2160001-0000-4000-8000-000000000001','d2-project-owner@example.test'),
 ('d2160001-0000-4000-8000-000000000002','d2-project-manager@example.test'),
 ('d2160001-0000-4000-8000-000000000003','d2-project-viewer@example.test'),
 ('d2160001-0000-4000-8000-000000000004','d2-project-outsider@example.test');
SELECT public.complete_onboarding_role_for_user(id,'developer','developer','D2 Fixture','Athens')
  FROM auth.users WHERE id::text LIKE 'd2160001-%';
UPDATE public.profiles SET force_pro_access=true WHERE user_id::text LIKE 'd2160001-%';
INSERT INTO public.organizations(id,name,slug,created_by,plan) VALUES
 ('d2160003-0000-4000-8000-000000000001','D2 Project Org','d2-project-org','d2160001-0000-4000-8000-000000000001','pro');
INSERT INTO public.organization_memberships(organization_id,user_id,role,status) VALUES
 ('d2160003-0000-4000-8000-000000000001','d2160001-0000-4000-8000-000000000002','member','active'),
 ('d2160003-0000-4000-8000-000000000001','d2160001-0000-4000-8000-000000000003','viewer','active');
INSERT INTO public.projects(id,owner_id,organization_id,name,city,building_permit_number) VALUES
 ('d2160002-0000-4000-8000-000000000001','d2160001-0000-4000-8000-000000000001',NULL,'D2 Personal A','Athens','TEST'),
 ('d2160002-0000-4000-8000-000000000002','d2160001-0000-4000-8000-000000000001','d2160003-0000-4000-8000-000000000001','D2 Org','Athens','TEST'),
 ('d2160002-0000-4000-8000-000000000003','d2160001-0000-4000-8000-000000000001',NULL,'D2 Personal B','Athens','TEST');
INSERT INTO public.project_units(id,project_id,unit_id,availability_status,price,internal_sqm) VALUES
 ('d2160004-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001','A','available',200001,80),
 ('d2160004-0000-4000-8000-000000000002','d2160002-0000-4000-8000-000000000001','B','available',999,3),
 ('d2160004-0000-4000-8000-000000000003','d2160002-0000-4000-8000-000000000001','C','reserved',50000,25),
 ('d2160004-0000-4000-8000-000000000004','d2160002-0000-4000-8000-000000000001','D','available',NULL,40),
 ('d2160004-0000-4000-8000-000000000005','d2160002-0000-4000-8000-000000000002','ORG','available',300000,100),
 ('d2160004-0000-4000-8000-000000000006','d2160002-0000-4000-8000-000000000003','FOREIGN','available',400000,100);
INSERT INTO public.project_media(id,project_id,url,media_type,title) VALUES
 ('d2160005-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001','https://fixture.example.test/a.pdf','brochure_pdf','A'),
 ('d2160005-0000-4000-8000-000000000002','d2160002-0000-4000-8000-000000000002','https://fixture.example.test/org.pdf','brochure_pdf','Org');

SELECT is(current_setting('session_replication_role'),'origin','fixture setup kept normal triggers');
SELECT is((SELECT count(*)::integer FROM public.project_units WHERE id::text LIKE 'd2160004-%'),6,'six scoped units exist before price mutation');
SELECT is((SELECT count(*)::integer FROM public.project_media WHERE id::text LIKE 'd2160005-%'),2,'two scoped media rows exist before scope attempts');
CREATE TEMP VIEW d2_project_state AS SELECT jsonb_build_object(
 'projects',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.projects p WHERE id::text LIKE 'd2160002-%'),
 'units',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.project_units u WHERE id::text LIKE 'd2160004-%'),
 'media',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM public.project_media m WHERE id::text LIKE 'd2160005-%'),
 'jobs',(SELECT jsonb_agg(to_jsonb(j) ORDER BY id) FROM public.storage_cleanup_jobs j WHERE owner_id::text LIKE 'd2160001-%'),
 'notices',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.notifications n WHERE user_id::text LIKE 'd2160001-%')
) AS state;
CREATE TEMP TABLE d2_project_before AS SELECT state FROM d2_project_state;
-- Compare the whole graph after price writes, omitting only the two rows'
-- update clocks. Their clocks are checked separately below.
CREATE TEMP VIEW d2_price_comparable_state AS
SELECT jsonb_set(state,'{units}',(
  SELECT jsonb_agg(CASE WHEN unit->>'id' IN (
    'd2160004-0000-4000-8000-000000000001',
    'd2160004-0000-4000-8000-000000000002'
  ) THEN unit - 'updated_at' ELSE unit END ORDER BY unit->>'id')
  FROM jsonb_array_elements(state->'units') AS unit
)) AS state FROM d2_project_state;
CREATE TEMP TABLE d2_price_start AS SELECT state FROM d2_price_comparable_state;

SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true),set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','price RPC uses actual service role');
SELECT is(auth.uid(),NULL::uuid,'service price call has no actor subject');
SELECT is(public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001',10),2,'only available priced units updated');
RESET ROLE;
SELECT is((SELECT jsonb_agg(jsonb_build_array(id,price,price_per_sqm) ORDER BY id) FROM public.project_units WHERE project_id='d2160002-0000-4000-8000-000000000001'),
 '[ ["d2160004-0000-4000-8000-000000000001",220001,2750.01],["d2160004-0000-4000-8000-000000000002",1099,366.33],["d2160004-0000-4000-8000-000000000003",50000,null],["d2160004-0000-4000-8000-000000000004",null,null] ]'::jsonb,'exact rounded prices; reserved and null-priced rows unchanged');
SELECT is((SELECT price FROM public.project_units WHERE id='d2160004-0000-4000-8000-000000000005'),300000::numeric,'other project unchanged');
SELECT is((SELECT state FROM d2_price_comparable_state),
 (SELECT jsonb_set(state,'{units}',(
   SELECT jsonb_agg(CASE unit->>'id'
     WHEN 'd2160004-0000-4000-8000-000000000001' THEN unit || '{"price":220001,"price_per_sqm":2750.01}'::jsonb
     WHEN 'd2160004-0000-4000-8000-000000000002' THEN unit || '{"price":1099,"price_per_sqm":366.33}'::jsonb
     ELSE unit END ORDER BY unit->>'id')
   FROM jsonb_array_elements(state->'units') AS unit
 )) FROM d2_price_start),'positive price write changes only two intended unit values in full state');
SELECT ok((SELECT bool_and(unit.updated_at >= (original->>'updated_at')::timestamptz
  AND unit.updated_at <= clock_timestamp())
 FROM public.project_units unit
 JOIN LATERAL jsonb_array_elements((SELECT state->'units' FROM d2_project_before)) AS original
   ON original->>'id'=unit.id::text
 WHERE unit.id IN ('d2160004-0000-4000-8000-000000000001','d2160004-0000-4000-8000-000000000002')),
 'positive price update clocks stay within fixture and observation time');
CREATE TEMP TABLE d2_price_before_denials AS SELECT state FROM d2_project_state;
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user(NULL,'d2160002-0000-4000-8000-000000000001',10)$q$,'42501','user_id is required','explicit-user price requires actor');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001',NULL,10)$q$,'22023','project_id is required','explicit-user price requires project');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000999',10)$q$,'42501','Project not found','non-null missing project is refused');
RESET ROLE;
SELECT is((SELECT state FROM d2_project_state),(SELECT state FROM d2_price_before_denials),'missing project denial preserves full prior state');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001',NULL)$q$,'22023','percentage must be a finite non-zero value between -100 and 1000','null percentage refused');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001',0)$q$,'22023','percentage must be a finite non-zero value between -100 and 1000','zero percentage refused');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001','NaN'::numeric)$q$,'22023','percentage must be a finite non-zero value between -100 and 1000','NaN percentage refused');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001',1001)$q$,'22023','percentage must be a finite non-zero value between -100 and 1000','out-of-range percentage refused');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000004','d2160002-0000-4000-8000-000000000001',10)$q$,'42501','Project not found','foreign actor cannot change personal prices');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000002','d2160002-0000-4000-8000-000000000002',10)$q$,'42501','Project not found','organization manager is not price RPC owner');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices('d2160002-0000-4000-8000-000000000001',10)$q$,'42501','Not authenticated','legacy service/no-sub call cannot derive owner');
RESET ROLE;
SELECT is((SELECT state FROM d2_project_state),(SELECT state FROM d2_price_before_denials),'all denied price calls preserve full project/unit/media/job state');
SET LOCAL ROLE service_role;
SELECT is(public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001',-50),2,'negative percentage updates same two units');
RESET ROLE;
SELECT is((SELECT jsonb_agg(jsonb_build_array(id,price,price_per_sqm) ORDER BY id) FROM public.project_units WHERE id IN ('d2160004-0000-4000-8000-000000000001','d2160004-0000-4000-8000-000000000002')),
 '[["d2160004-0000-4000-8000-000000000001",110001,1375.01],["d2160004-0000-4000-8000-000000000002",550,183.33]]'::jsonb,'negative percent uses numeric rounding and recomputes sqm');
SELECT is((SELECT state FROM d2_price_comparable_state),
 (SELECT jsonb_set(state,'{units}',(
   SELECT jsonb_agg(CASE unit->>'id'
     WHEN 'd2160004-0000-4000-8000-000000000001' THEN unit || '{"price":110001,"price_per_sqm":1375.01}'::jsonb
     WHEN 'd2160004-0000-4000-8000-000000000002' THEN unit || '{"price":550,"price_per_sqm":183.33}'::jsonb
     ELSE unit END ORDER BY unit->>'id')
   FROM jsonb_array_elements(state->'units') AS unit
 )) FROM d2_price_start),'negative price write preserves every other row and field in full state');
SELECT ok((SELECT bool_and(unit.updated_at >= (original->>'updated_at')::timestamptz
  AND unit.updated_at <= clock_timestamp())
 FROM public.project_units unit
 JOIN LATERAL jsonb_array_elements((SELECT state->'units' FROM d2_project_before)) AS original
   ON original->>'id'=unit.id::text
 WHERE unit.id IN ('d2160004-0000-4000-8000-000000000001','d2160004-0000-4000-8000-000000000002')),
 'negative price update clocks stay within fixture and observation time');
CREATE TEMP TABLE d2_scope_before AS SELECT state FROM d2_project_state;

SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000001',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d2160001-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT is(current_user,'authenticated','scope attempts use actual browser role');
SELECT is(auth.uid(),'d2160001-0000-4000-8000-000000000001'::uuid,'scope attempts carry owner subject');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices_for_user('d2160001-0000-4000-8000-000000000001','d2160002-0000-4000-8000-000000000001',10)$q$,'42501','permission denied for function bulk_update_project_unit_prices_for_user','browser cannot execute explicit-user price RPC');
SELECT throws_ok($q$SELECT public.bulk_update_project_unit_prices('d2160002-0000-4000-8000-000000000001',10)$q$,'42501','permission denied for function bulk_update_project_unit_prices','browser cannot execute legacy price RPC');
SELECT throws_ok($q$UPDATE public.project_units SET project_id='d2160002-0000-4000-8000-000000000003' WHERE id='d2160004-0000-4000-8000-000000000001'$q$,'42501','permission_denied: project child scope cannot be reassigned','owner cannot transfer unit to another owned project');
SELECT throws_ok($q$UPDATE public.project_media SET project_id='d2160002-0000-4000-8000-000000000003' WHERE id='d2160005-0000-4000-8000-000000000001'$q$,'42501','permission_denied: project child scope cannot be reassigned','owner cannot transfer media to another owned project');
RESET ROLE;
SELECT is((SELECT state FROM d2_project_state),(SELECT state FROM d2_scope_before),'browser RPC and scope denials preserve full state');

SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d2160001-0000-4000-8000-000000000002"}',true);
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE public.project_units SET unit_number='manager-edited' WHERE id='d2160004-0000-4000-8000-000000000005' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed),1,'organization manager can edit own organization unit content');
WITH changed AS (UPDATE public.project_media SET title='manager-edited' WHERE id='d2160005-0000-4000-8000-000000000002' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed),1,'organization manager can edit own organization media content');
RESET ROLE;
SELECT is((SELECT unit_number FROM public.project_units WHERE id='d2160004-0000-4000-8000-000000000005'),'manager-edited','manager unit edit persisted');
SELECT is((SELECT title FROM public.project_media WHERE id='d2160005-0000-4000-8000-000000000002'),'manager-edited','manager media edit persisted');
CREATE TEMP TABLE d2_viewer_before AS SELECT state FROM d2_project_state;
SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d2160001-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE public.project_units SET unit_number='viewer-edited' WHERE id='d2160004-0000-4000-8000-000000000005' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed),0,'organization viewer updates no unit');
WITH changed AS (UPDATE public.project_media SET title='viewer-edited' WHERE id='d2160005-0000-4000-8000-000000000002' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed),0,'organization viewer updates no media');
RESET ROLE;
SELECT is((SELECT state FROM d2_project_state),(SELECT state FROM d2_viewer_before),'viewer denials preserve full state');
SELECT set_config('request.jwt.claim.sub','d2160001-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"role":"authenticated","sub":"d2160001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE authenticated;
WITH changed AS (UPDATE public.project_units SET unit_number='outsider-edited' WHERE id='d2160004-0000-4000-8000-000000000001' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed),0,'outsider updates no unit');
WITH changed AS (UPDATE public.project_media SET title='outsider-edited' WHERE id='d2160005-0000-4000-8000-000000000001' RETURNING id)
SELECT is((SELECT count(*)::integer FROM changed),0,'outsider updates no media');
RESET ROLE;
SELECT is((SELECT state FROM d2_project_state),(SELECT state FROM d2_viewer_before),'outsider denials preserve full state');
SELECT ok(NOT (SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control WHERE singleton),'cleanup remains disabled after every case');
SELECT is(current_setting('session_replication_role'),'origin','normal triggers retained through test');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','',true),set_config('request.jwt.claims','',true);
SELECT * FROM finish();
ROLLBACK;
