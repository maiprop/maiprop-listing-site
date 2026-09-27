\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database() OR inet_server_addr() IS NOT NULL OR current_database() IN ('postgres','template0','template1','maiprop_replay_current_20260921') THEN RAISE EXCEPTION 'Explicit matching disposable socket database required'; END IF; END $$;
SET LOCAL statement_timeout='30s';
CREATE EXTENSION IF NOT EXISTS pgtap;
SET LOCAL search_path=public,extensions;
SELECT no_plan();
-- Owner-only synthetic setup. Unchanged DML triggers are excluded from reader proof.
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) VALUES ('7a010000-0000-4000-8000-000000000001','task7a-1@example.test'),('7a010000-0000-4000-8000-000000000002','task7a-2@example.test'),('7a010000-0000-4000-8000-000000000003','task7a-3@example.test'),('7a010000-0000-4000-8000-000000000004','task7a-4@example.test'),('7a010000-0000-4000-8000-000000000005','task7a-5@example.test'),('7a010000-0000-4000-8000-000000000006','task7a-6@example.test');
INSERT INTO public.profiles(user_id,role,display_name) VALUES ('7a010000-0000-4000-8000-000000000001','seller','Task7a 1'),('7a010000-0000-4000-8000-000000000002','seller','Task7a 2'),('7a010000-0000-4000-8000-000000000003','seller','Task7a 3'),('7a010000-0000-4000-8000-000000000004','admin','Task7a 4'),('7a010000-0000-4000-8000-000000000005','seller','Task7a 5'),('7a010000-0000-4000-8000-000000000006','seller','Task7a 6');
INSERT INTO public.organizations(id,name,slug,created_by) VALUES ('7a030000-0000-4000-8000-000000000001','Task7a One','task7a-one','7a010000-0000-4000-8000-000000000001'),('7a030000-0000-4000-8000-000000000002','Task7a Two','task7a-two','7a010000-0000-4000-8000-000000000006');
INSERT INTO public.organization_memberships(organization_id,user_id,role,status) VALUES ('7a030000-0000-4000-8000-000000000001','7a010000-0000-4000-8000-000000000001','viewer','active'),('7a030000-0000-4000-8000-000000000001','7a010000-0000-4000-8000-000000000002','viewer','active'),('7a030000-0000-4000-8000-000000000001','7a010000-0000-4000-8000-000000000003','member','active');
INSERT INTO public.listings(id,owner_id,organization_id,title,city,price,sqm,property_type,listing_type,status,views_count,created_at) VALUES
('7a020000-0000-4000-8000-000000000001','7a010000-0000-4000-8000-000000000001',NULL,'Task7a 1','Athens',100000,100,'apartment','sale','active',10,'2026-09-01T12:00:00Z'),
('7a020000-0000-4000-8000-000000000002','7a010000-0000-4000-8000-000000000001',NULL,'Task7a 2','Athens',100000,100,'apartment','sale','paused',20,'2026-09-01T12:00:00Z'),
('7a020000-0000-4000-8000-000000000003','7a010000-0000-4000-8000-000000000001','7a030000-0000-4000-8000-000000000001','Task7a 3','Athens',100000,100,'apartment','sale','active',30,'2026-09-01T12:00:00Z'),
('7a020000-0000-4000-8000-000000000004','7a010000-0000-4000-8000-000000000003','7a030000-0000-4000-8000-000000000001','Task7a 4','Athens',100000,100,'apartment','sale','active',40,'2026-09-01T12:00:00Z'),
('7a020000-0000-4000-8000-000000000005','7a010000-0000-4000-8000-000000000006',NULL,'Task7a 5','Athens',100000,100,'apartment','sale','active',50,'2026-09-01T12:00:00Z'),
('7a020000-0000-4000-8000-000000000006','7a010000-0000-4000-8000-000000000004',NULL,'Task7a 6','Athens',100000,100,'apartment','sale','active',60,'2026-09-01T12:00:00Z'),
('7a020000-0000-4000-8000-000000000007','7a010000-0000-4000-8000-000000000006','7a030000-0000-4000-8000-000000000002','Task7a 7','Athens',100000,100,'apartment','sale','active',70,'2026-09-01T12:00:00Z');
INSERT INTO public.listing_images(listing_id,url,sort_order) VALUES ('7a020000-0000-4000-8000-000000000001','https://example.test/second.jpg',2),('7a020000-0000-4000-8000-000000000001','https://example.test/first.jpg',1);
INSERT INTO public.open_house_settings(listing_id,offer_deadline) VALUES ('7a020000-0000-4000-8000-000000000001','2026-10-01T12:00:00Z');
SET LOCAL session_replication_role=origin;

SELECT ok(NOT has_function_privilege('anon','public.get_manageable_listing_catalogue_page(integer,timestamp with time zone,uuid)','EXECUTE'),'anonymous page ACL denies');
SELECT ok(NOT has_function_privilege('service_role','public.get_manageable_listing_summary()','EXECUTE'),'service role summary ACL denies');
SELECT is((SELECT count(*) FROM pg_proc WHERE proname IN ('get_manageable_listing_catalogue','get_manageable_listing_catalogue_page','get_manageable_listing_summary') AND prosecdef AND proconfig @> ARRAY['search_path=""']),3::bigint,'three definers retain empty search path');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"7a010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is(current_user,'authenticated'::name,'owner uses actual authenticated role');
SELECT is((SELECT count(*) FROM public.get_manageable_listing_catalogue()),2::bigint,'owner managed rows');
SELECT is((SELECT total_count FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),2::bigint,'owner authorized total');
SELECT is((public.get_manageable_listing_summary()->>'totalListings')::int,2,'owner summary count');
SELECT is((public.get_manageable_listing_summary()->>'totalViews')::int,30,'owner summary views');
SELECT is((public.get_manageable_listing_summary()->>'activeListings')::int,1,'owner active count');
SELECT is((SELECT count(*) FROM public.get_listing_management_catalogue() WHERE id::text LIKE '7a020000-%'),4::bigint,'owner legacy behavior preserved');
SELECT set_config('request.jwt.claims','{"sub":"7a010000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT is(current_user,'authenticated'::name,'viewer uses actual authenticated role');
SELECT is((SELECT count(*) FROM public.get_manageable_listing_catalogue()),0::bigint,'viewer managed rows');
SELECT is((SELECT total_count FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),0::bigint,'viewer authorized total');
SELECT is((public.get_manageable_listing_summary()->>'totalListings')::int,0,'viewer summary count');
SELECT is((public.get_manageable_listing_summary()->>'totalViews')::int,0,'viewer summary views');
SELECT is((public.get_manageable_listing_summary()->>'activeListings')::int,0,'viewer active count');
SELECT is((SELECT count(*) FROM public.get_listing_management_catalogue() WHERE id::text LIKE '7a020000-%'),2::bigint,'viewer legacy behavior preserved');
SELECT set_config('request.jwt.claims','{"sub":"7a010000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT is(current_user,'authenticated'::name,'manager uses actual authenticated role');
SELECT is((SELECT count(*) FROM public.get_manageable_listing_catalogue()),2::bigint,'manager managed rows');
SELECT is((SELECT total_count FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),2::bigint,'manager authorized total');
SELECT is((public.get_manageable_listing_summary()->>'totalListings')::int,2,'manager summary count');
SELECT is((public.get_manageable_listing_summary()->>'totalViews')::int,70,'manager summary views');
SELECT is((public.get_manageable_listing_summary()->>'activeListings')::int,2,'manager active count');
SELECT is((SELECT count(*) FROM public.get_listing_management_catalogue() WHERE id::text LIKE '7a020000-%'),2::bigint,'manager legacy behavior preserved');
SELECT set_config('request.jwt.claims','{"sub":"7a010000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SELECT is(current_user,'authenticated'::name,'admin uses actual authenticated role');
SELECT is((SELECT count(*) FROM public.get_manageable_listing_catalogue()),4::bigint,'admin managed rows');
SELECT is((SELECT total_count FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),4::bigint,'admin authorized total');
SELECT is((public.get_manageable_listing_summary()->>'totalListings')::int,4,'admin summary count');
SELECT is((public.get_manageable_listing_summary()->>'totalViews')::int,200,'admin summary views');
SELECT is((public.get_manageable_listing_summary()->>'activeListings')::int,4,'admin active count');
SELECT is((SELECT count(*) FROM public.get_listing_management_catalogue() WHERE id::text LIKE '7a020000-%'),7::bigint,'admin legacy behavior preserved');
SELECT set_config('request.jwt.claims','{"sub":"7a010000-0000-4000-8000-000000000005","role":"authenticated"}',true);
SELECT is(current_user,'authenticated'::name,'outsider uses actual authenticated role');
SELECT is((SELECT count(*) FROM public.get_manageable_listing_catalogue()),0::bigint,'outsider managed rows');
SELECT is((SELECT total_count FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),0::bigint,'outsider authorized total');
SELECT is((public.get_manageable_listing_summary()->>'totalListings')::int,0,'outsider summary count');
SELECT is((public.get_manageable_listing_summary()->>'totalViews')::int,0,'outsider summary views');
SELECT is((public.get_manageable_listing_summary()->>'activeListings')::int,0,'outsider active count');
SELECT is((SELECT count(*) FROM public.get_listing_management_catalogue() WHERE id::text LIKE '7a020000-%'),0::bigint,'outsider legacy behavior preserved');
SELECT set_config('request.jwt.claims','{"sub":"7a010000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT is((SELECT data->0->>'id' FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),'7a020000-0000-4000-8000-000000000002','equal timestamp breaks ties by descending ID');
SELECT is((SELECT next_id::text FROM public.get_manageable_listing_catalogue_page(p_limit=>1)),'7a020000-0000-4000-8000-000000000002','next cursor is last returned row');
SELECT is((SELECT data->0->>'id' FROM public.get_manageable_listing_catalogue_page(p_limit=>1,p_before_created_at=>'2026-09-01T12:00:00Z',p_before_id=>'7a020000-0000-4000-8000-000000000002')),'7a020000-0000-4000-8000-000000000001','second page has no duplicate');
SELECT is((SELECT total_count FROM public.get_manageable_listing_catalogue_page(1,'2026-09-01T12:00:00Z','7a020000-0000-4000-8000-000000000002')),2::bigint,'total is not remaining count');
SELECT ok((SELECT next_id IS NULL AND next_created_at IS NULL FROM public.get_manageable_listing_catalogue_page(1,'2026-09-01T12:00:00Z','7a020000-0000-4000-8000-000000000002')),'final page has no cursor');
SELECT is((SELECT data FROM public.get_manageable_listing_catalogue_page(1,'2026-09-01T12:00:00Z','7a020000-0000-4000-8000-000000000001')),'[]'::jsonb,'past-final empty page');
SELECT is((SELECT jsonb_array_length(data) FROM public.get_manageable_listing_catalogue_page(p_limit=>0)),1,'zero limit clamps to one');
SELECT is((SELECT jsonb_array_length(data) FROM public.get_manageable_listing_catalogue_page(p_limit=>NULL)),2,'null limit defaults');
SELECT throws_ok($q$SELECT * FROM public.get_manageable_listing_catalogue_page(1,NULL,'7a020000-0000-4000-8000-000000000001')$q$,'22023','manageable_catalogue_cursor_invalid','ID-only cursor rejected');
SELECT throws_ok($q$SELECT * FROM public.get_manageable_listing_catalogue_page(1,'2026-09-01',NULL)$q$,'22023','manageable_catalogue_cursor_invalid','date-only cursor rejected');
SELECT is((SELECT listing_images->0->>'url' FROM public.get_listing_management_catalogue() WHERE id='7a020000-0000-4000-8000-000000000001'),'https://example.test/first.jpg','legacy image order and shape preserved');
SELECT is((SELECT jsonb_array_length(open_house_settings) FROM public.get_listing_management_catalogue() WHERE id='7a020000-0000-4000-8000-000000000001'),1,'legacy settings aggregation preserved');
SELECT set_config('request.jwt.claims','{}',true);
SELECT throws_ok('SELECT public.get_manageable_listing_summary()','28000','auth_required','authenticated role without actor fails closed');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok('SELECT public.get_manageable_listing_summary()','42501',NULL,'actual anonymous role denied');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
