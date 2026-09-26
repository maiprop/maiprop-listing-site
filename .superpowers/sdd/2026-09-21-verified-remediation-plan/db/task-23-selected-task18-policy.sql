-- Explicit selected-upgrade variant. Run only after
-- new_build_enquiry_captured_upgrade_setup.sql and the Task18 migration;
-- its captured-policy assertions are intentionally outside ordinary *_test.sql discovery.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);
SELECT is((SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND cmd='SELECT'), 'user_or_owner_select_new_building_lead', 'captured SELECT policy name is preserved');
SELECT is((SELECT roles::text FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND cmd='SELECT'), '{public}', 'captured SELECT policy remains TO PUBLIC');
SELECT ok((SELECT qual NOT ILIKE '%has_platform_admin%' AND qual ILIKE '%current_user_owns_listing%' FROM pg_policies WHERE schemaname='public' AND tablename='new_building_leads' AND cmd='SELECT'), 'captured policy gains only the corrected exact-owner term');
SELECT ok(NOT has_schema_privilege('anon','private','USAGE'), 'captured fixture does not grant anon private-schema usage');
SET LOCAL ROLE anon;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads),0,'anonymous PUBLIC-policy evaluation returns no rows without a schema permission error');
RESET ROLE;
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id) VALUES ('e1893000-0000-4000-8000-000000000001'),('e1893000-0000-4000-8000-000000000002'),('e1893000-0000-4000-8000-000000000003');
INSERT INTO public.profiles(user_id,role) VALUES ('e1893000-0000-4000-8000-000000000001','admin'),('e1893000-0000-4000-8000-000000000002','developer'),('e1893000-0000-4000-8000-000000000003','buyer');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status) VALUES ('e1894000-0000-4000-8000-000000000001','e1893000-0000-4000-8000-000000000002','Captured admin fixture','Athens',1,1,'apartment','new_build','paused');
INSERT INTO public.new_building_leads(id,new_building_id,user_id,email,full_name,notes) VALUES ('e1895000-0000-4000-8000-000000000001','e1894000-0000-4000-8000-000000000001','e1893000-0000-4000-8000-000000000003','buyer@example.com','Buyer','Fixture');
SET LOCAL session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"e1893000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT count(*)::integer FROM public.new_building_leads WHERE id='e1895000-0000-4000-8000-000000000001'),0,'captured baseline does not import the source-only admin branch');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
