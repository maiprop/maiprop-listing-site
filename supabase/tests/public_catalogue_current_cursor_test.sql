\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_d0_[a-z0-9_]{6,48}|maiprop_t13cat_[0-9]{8}_cursor[0-9]{2})$'
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source','maiprop_d0_20261003_refresh01')
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'cat13_%')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'cat13_%')
 THEN RAISE EXCEPTION 'catalogue cursor suite requires owned disposable socket clone and origin triggers'; END IF;
END $$;
-- Wait before the fixture transaction, so a pre-existing publication in this
-- real minute cannot take the publisher's ordinary early-return path. This is
-- read-only, bounded, and keeps the later PRE/test/POST on the same backend.
DO $$ DECLARE deadline timestamptz := clock_timestamp()+interval '65 seconds';
BEGIN
 LOOP
  EXIT WHEN extract(second FROM clock_timestamp()) < 25
   AND NOT EXISTS (SELECT 1 FROM private.public_catalogue_publications p
    WHERE p.snapshot_minute=date_trunc('minute',clock_timestamp()) AND p.status='published');
  IF clock_timestamp()>=deadline THEN
   RAISE EXCEPTION 'catalogue next real-minute publication window unavailable';
  END IF;
  PERFORM pg_sleep(0.5);
 END LOOP;
END $$;
-- Register pg_trgm's read-only GUC defaults before the exact pg_settings
-- baseline; the catalogue's location index would otherwise register them mid-run.
DO $$ BEGIN PERFORM extensions.similarity('catalogue','catalogue'); END $$;
CREATE FUNCTION pg_temp.cat13_outer_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY id),'[]'::jsonb) FROM auth.users u),
 'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]'::jsonb) FROM public.profiles p),
 'profiles_public',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]'::jsonb) FROM public.profiles_public p),
 'listings',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]'::jsonb) FROM public.listings l),
 'publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY publication_id),'[]'::jsonb) FROM private.public_catalogue_publications p),
 'current',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY singleton),'[]'::jsonb) FROM private.public_catalogue_current c),
 'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY version_id),'[]'::jsonb) FROM private.public_catalogue_versions v),
 'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.listing_promotion_allocations a),
 'images',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) FROM public.listing_images i),
 'projects',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb) FROM public.projects p),
 'notifications',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb) FROM public.notifications n))
$$;
CREATE FUNCTION pg_temp.cat13_bindings() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
  'sha256',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(p.proowner),'acl',coalesce(to_jsonb(p.proacl),'null'::jsonb)))
  FROM pg_proc p WHERE p.pronamespace IN ('public'::regnamespace,'private'::regnamespace,'auth'::regnamespace)
   AND (p.proname LIKE '%catalogue%' OR p.oid IN
    (SELECT t.tgfoid FROM pg_trigger t WHERE t.tgrelid IN
     ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,
      'private.public_catalogue_versions'::regclass) AND NOT t.tgisinternal)
    OR p.oid IN ('public.release_expired_firesale_reservations(uuid)'::regprocedure,
     'public.audit_firesale_interest_mutation()'::regprocedure,
     'public.has_platform_admin(uuid)'::regprocedure,
     'private.has_platform_admin(uuid)'::regprocedure,
     'public.normalize_location_text(text)'::regprocedure,
     'public.expand_location_search_aliases(text)'::regprocedure,
     'public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure))),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',t.tgname,
  'table',t.tgrelid::regclass::text,'enabled',t.tgenabled,
  'definition',pg_get_triggerdef(t.oid,true),'function',t.tgfoid::regprocedure::text)
  ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
  FROM pg_trigger t WHERE t.tgrelid IN
   ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,
    'private.public_catalogue_versions'::regclass) AND NOT t.tgisinternal),
 'source_view',encode(digest(pg_get_viewdef('public.public_listing_catalogue'::regclass,true),'sha256'),'hex'),
 'source_view_acl',(SELECT to_jsonb(c.relacl) FROM pg_class c WHERE c.oid='public.public_listing_catalogue'::regclass))
$$;
CREATE TEMP TABLE cat13_baseline AS SELECT pg_backend_pid() pid,current_user db_role,session_user session_role,
 current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') origin,auth.uid() actor,auth.jwt() jwt,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 pg_temp.cat13_bindings() bindings,
 (SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'))
 FROM pg_proc p WHERE p.oid IN (
 'public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,numeric,uuid,boolean,integer,integer,jsonb)'::regprocedure,
 'public.publish_public_catalogue()'::regprocedure,'private.publish_public_catalogue()'::regprocedure,
 'private.resolve_public_catalogue_publication(bigint)'::regprocedure,
 'public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure)) hashes,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value))
 FROM pg_sequences) seqs,
 (SELECT jsonb_object_agg(name,setting) FROM pg_settings) settings,
 pg_temp.cat13_outer_graph() graph;
SELECT 'CAT13_PRE' phase,pid,db_role,session_role,marker,origin,actor,jwt,
 sub_claim,claims,role_claim,hashes,bindings,seqs,
 encode(digest(settings::text,'sha256'),'hex') settings_sha256,
 encode(digest(graph::text,'sha256'),'hex') graph_sha256 FROM cat13_baseline;
CREATE FUNCTION pg_temp.cat13_check_sequences(p_new_count integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE b jsonb; actual_seqs jsonb; expected_seqs jsonb;
BEGIN
 SELECT seqs INTO STRICT b FROM cat13_baseline;
 SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) INTO actual_seqs
 FROM pg_sequences;
 expected_seqs := jsonb_set(jsonb_set(b,
 ARRAY['private.public_catalogue_publications_publication_id_seq'],
 to_jsonb((b->>'private.public_catalogue_publications_publication_id_seq')::bigint+1),false),
 ARRAY['private.public_catalogue_versions_version_id_seq'],
 to_jsonb(coalesce((b->>'private.public_catalogue_versions_version_id_seq')::bigint,0)+p_new_count),false);
 IF actual_seqs IS DISTINCT FROM expected_seqs THEN
  RAISE EXCEPTION 'catalogue named sequence movement differs from one publication and % modeled versions',p_new_count;
 END IF;
 RETURN 'CAT13_SEQUENCE_CLEAN';
END $$;
BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SET LOCAL client_min_messages=warning;
SELECT plan(111);
SELECT is(current_setting('session_replication_role'),'origin','fixture and business actions use origin triggers');
SELECT is((SELECT count(*)::integer FROM pg_trigger WHERE tgrelid IN
 ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,
 'private.public_catalogue_versions'::regclass) AND NOT tgisinternal AND tgenabled <> 'O'),0,
 'all relevant normal triggers enabled');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,numeric,uuid,boolean,integer,integer,jsonb)','7d1792b529c640190e0804695c3dfa8d4cd337b625ba59128ef370d990219dec'),
 ('public.publish_public_catalogue()','b31d2b8547a601636f551476ce1c21142656ef45c6182f30760b1c4dd750be0d'),
 ('private.publish_public_catalogue()','bd0fab37fb9788e36b407e3a53929ed69ff7db3581dcc7badcb039bbab626968'),
 ('private.resolve_public_catalogue_publication(bigint)','aba8c8c1c1896b632012a45624a72065099ae4751294113b6ce4912d04dafa08'),
 ('public.admin_review_invitation_request(uuid,uuid,text,text,text)','4f25f37c8f7eb1e0a0c89d6bcf54108921710973fa38fe7f97289b171483b511')) x(sig,sha)),
 'five final installed routine definitions bound');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('public.release_expired_firesale_reservations(uuid)','d407139144d8ad3a0ed4bfe49edca50e14a465b21c8fe3f993816dcfe37fbc08'),
 ('public.audit_firesale_interest_mutation()','7085921d35e04cc57beddda7b0b495736cda701374596264e02c7d960d847c1c'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce')) x(sig,sha)),
 'remaining four October routine definitions bound to installed clone');
SELECT ok(has_function_privilege('anon','public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,numeric,uuid,boolean,integer,integer,jsonb)','EXECUTE')
 AND has_function_privilege('authenticated','public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,numeric,uuid,boolean,integer,integer,jsonb)','EXECUTE')
 AND has_function_privilege('service_role','public.publish_public_catalogue()','EXECUTE')
 AND NOT has_function_privilege('anon','public.publish_public_catalogue()','EXECUTE')
 AND NOT has_function_privilege('authenticated','public.publish_public_catalogue()','EXECUTE')
 AND has_schema_privilege('anon','public','USAGE') AND has_schema_privilege('authenticated','public','USAGE')
 AND NOT has_table_privilege('anon','private.public_catalogue_versions','SELECT')
 AND NOT has_table_privilege('authenticated','private.public_catalogue_versions','SELECT'),
 'effective reader/publisher ACL and private snapshot boundary');
SELECT ok((SELECT bool_and(cache_size=1) FROM pg_sequences WHERE
 (schemaname,sequencename) IN (('private','public_catalogue_publications_publication_id_seq'),
 ('private','public_catalogue_versions_version_id_seq'))),
 'both named publisher identity sequences consume one value per nextval');

-- Preserve the entire source and catalogue prestate. These saved rows are not
-- used as expected new publisher output; all additions are checked separately.
CREATE FUNCTION pg_temp.cat13_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY id),'[]'::jsonb) FROM auth.users u),
 'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]'::jsonb) FROM public.profiles p),
 'profiles_public',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]'::jsonb) FROM public.profiles_public p),
 'listings',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]'::jsonb) FROM public.listings l),
 'publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY publication_id),'[]'::jsonb) FROM private.public_catalogue_publications p),
 'current',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY singleton),'[]'::jsonb) FROM private.public_catalogue_current c),
 'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY version_id),'[]'::jsonb) FROM private.public_catalogue_versions v),
 'allocations',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM public.listing_promotion_allocations a),
 'images',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) FROM public.listing_images i),
 'projects',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]'::jsonb) FROM public.projects p),
 'notifications',(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY id),'[]'::jsonb) FROM public.notifications n))
$$;
CREATE TEMP TABLE cat13_pre AS SELECT pg_temp.cat13_graph() graph;
SELECT is((SELECT count(*)::integer FROM public.listings WHERE id::text LIKE 'c7130002-%'),0,
 'fixture listing namespace is absent from the prestate');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE 'c7130001-%'),0,
 'fixture auth namespace is absent from the prestate');

CREATE TEMP TABLE cat13_clock AS SELECT date_trunc('minute',clock_timestamp())-interval '1 minute' AS created_at,
 date_trunc('minute',clock_timestamp())+interval '3 days' AS upcoming_at,
 date_trunc('minute',clock_timestamp())-interval '3 days' AS past_at;
INSERT INTO auth.users(id,email) VALUES ('c7130001-0000-4000-8000-000000000001','t13cat-owner@example.test');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id='c7130001-0000-4000-8000-000000000001'),1,
 'normal auth user fixture inserted once');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id='c7130001-0000-4000-8000-000000000001'),1,
 'normal auth trigger created exactly one profile');
SELECT is((SELECT count(*)::integer FROM public.profiles_public WHERE user_id='c7130001-0000-4000-8000-000000000001'),1,
 'normal public-profile sync created exactly one projection');

INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,
 created_at,updated_at,ai_score,views_count,open_house_date,open_house_transaction_type,is_off_market)
SELECT ('c7130002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'c7130001-0000-4000-8000-000000000001'::uuid,'T13 catalogue cursor '||n,'T13CatUnique',
 100*n,80,'apartment',CASE WHEN n IN (5,6) THEN 'open_house' ELSE 'sale' END::public.listing_type,
 CASE WHEN n=7 THEN 'draft' ELSE 'active' END::public.listing_status,
 c.created_at,c.created_at,CASE n WHEN 1 THEN 90 WHEN 2 THEN 70 ELSE NULL END,
 CASE n WHEN 1 THEN 40 WHEN 2 THEN 30 WHEN 3 THEN 20 ELSE 10 END,
 CASE WHEN n=5 THEN c.upcoming_at WHEN n=6 THEN c.past_at ELSE NULL END,
 CASE WHEN n IN (5,6) THEN 'sale' ELSE NULL END,n=8
FROM generate_series(1,8)n CROSS JOIN cat13_clock c;
SELECT is((SELECT count(*)::integer FROM public.listings WHERE id::text LIKE 'c7130002-%'),8,
 'all eight source listings exist under normal triggers');
SELECT is((SELECT jsonb_agg(jsonb_build_object('id',right(id::text,12),'type',listing_type,
 'status',status,'hidden',is_off_market,'price',price,'score',ai_score,'views',views_count)
 ORDER BY id) FROM public.listings WHERE id::text LIKE 'c7130002-%'),
 (SELECT jsonb_agg(jsonb_build_object('id',lpad(n::text,12,'0'),
 'type',CASE WHEN n IN (5,6) THEN 'open_house' ELSE 'sale' END,
 'status',CASE WHEN n=7 THEN 'draft' ELSE 'active' END,'hidden',n=8,
 'price',100*n,'score',CASE n WHEN 1 THEN 90 WHEN 2 THEN 70 ELSE NULL END,
 'views',CASE n WHEN 1 THEN 40 WHEN 2 THEN 30 WHEN 3 THEN 20 ELSE 10 END) ORDER BY n)
 FROM generate_series(1,8)n),'all eight source identities and sort/visibility fields independently modeled');
SELECT is((SELECT count(*)::integer FROM public.public_listing_catalogue
 WHERE id::text LIKE 'c7130002-%'),6,'normal source projection contains exactly six visible fixture rows');
SELECT is((SELECT count(*)::integer FROM public.listing_promotion_allocations WHERE listing_id::text LIKE 'c7130002-%'),0,
 'fixture inserts created no promotion allocation');

-- Build complete expected inserted rows from the explicit fixture literals and
-- ordinary column defaults in trigger-free temporary copies. Only the normal
-- profile UUID is bound from the generated identity; no persisted row supplies
-- expected nonidentity fields.
CREATE TEMP TABLE cat13_expected_user (LIKE auth.users INCLUDING DEFAULTS);
INSERT INTO cat13_expected_user(id,email) VALUES
 ('c7130001-0000-4000-8000-000000000001','t13cat-owner@example.test');
CREATE TEMP TABLE cat13_expected_profile (LIKE public.profiles INCLUDING DEFAULTS);
INSERT INTO cat13_expected_profile(id,user_id,created_at,updated_at)
SELECT p.id,'c7130001-0000-4000-8000-000000000001',now(),now()
FROM public.profiles p WHERE p.user_id='c7130001-0000-4000-8000-000000000001';
CREATE TEMP TABLE cat13_expected_profiles_public (LIKE public.profiles_public INCLUDING DEFAULTS);
INSERT INTO cat13_expected_profiles_public(user_id,display_name,avatar_url,first_name,last_name,role,owner_participant_type)
SELECT user_id,display_name,avatar_url,first_name,last_name,role,NULL
FROM cat13_expected_profile;
CREATE TEMP TABLE cat13_expected_listing (LIKE public.listings INCLUDING DEFAULTS);
INSERT INTO cat13_expected_listing(id,owner_id,title,city,price,sqm,property_type,listing_type,status,
 created_at,updated_at,ai_score,views_count,open_house_date,open_house_transaction_type,is_off_market)
SELECT ('c7130002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'c7130001-0000-4000-8000-000000000001'::uuid,'T13 catalogue cursor '||n,'T13CatUnique',
 100*n,80,'apartment',CASE WHEN n IN (5,6) THEN 'open_house' ELSE 'sale' END::public.listing_type,
 CASE WHEN n=7 THEN 'draft' ELSE 'active' END::public.listing_status,
 c.created_at,c.created_at,CASE n WHEN 1 THEN 90 WHEN 2 THEN 70 ELSE NULL END,
 CASE n WHEN 1 THEN 40 WHEN 2 THEN 30 WHEN 3 THEN 20 ELSE 10 END,
 CASE WHEN n=5 THEN c.upcoming_at WHEN n=6 THEN c.past_at ELSE NULL END,
 CASE WHEN n IN (5,6) THEN 'sale' ELSE NULL END,n=8
FROM generate_series(1,8)n CROSS JOIN cat13_clock c;
UPDATE cat13_expected_listing SET location_search_text=
 public.expand_location_search_aliases(public.normalize_location_text(
 coalesce(title,'')||' '||coalesce(address,'')||' '||coalesce(city,'')||' '||
 coalesce(region,'')||' '||coalesce(postal_code,'')));
SELECT is((SELECT to_jsonb(u) FROM auth.users u WHERE id='c7130001-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(u) FROM cat13_expected_user u),'entire auth user equals explicit insert and schema defaults');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='c7130001-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(p) FROM cat13_expected_profile p),'entire normal-trigger profile equals modeled generated identity and defaults');
SELECT is((SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='c7130001-0000-4000-8000-000000000001'),
 (SELECT to_jsonb(p) FROM cat13_expected_profiles_public p),'entire public profile equals modeled normal projection');
SELECT is((SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM public.listings l WHERE id::text LIKE 'c7130002-%'),
 (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM cat13_expected_listing l),
 'all eight complete listing rows equal explicit fixture literals and schema defaults');
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY id),'[]'::jsonb)
 FROM auth.users u WHERE id<>'c7130001-0000-4000-8000-000000000001'),
 (SELECT graph->'users' FROM cat13_pre),'every old auth user unchanged by fixture setup');
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]'::jsonb)
 FROM public.profiles p WHERE user_id<>'c7130001-0000-4000-8000-000000000001'),
 (SELECT graph->'profiles' FROM cat13_pre),'every old profile unchanged by fixture setup');
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY user_id),'[]'::jsonb)
 FROM public.profiles_public p WHERE user_id<>'c7130001-0000-4000-8000-000000000001'),
 (SELECT graph->'profiles_public' FROM cat13_pre),'every old public profile unchanged by fixture setup');
SELECT is((SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]'::jsonb)
 FROM public.listings l WHERE id::text NOT LIKE 'c7130002-%'),
 (SELECT graph->'listings' FROM cat13_pre),'every old listing unchanged by fixture setup');
SELECT ok((SELECT bool_and((SELECT graph->k FROM cat13_pre)=(SELECT pg_temp.cat13_graph()->k))
 FROM unnest(ARRAY['publications','current','versions','allocations','images','projects','notifications'])k),
 'fixture setup leaves all other full graph categories unchanged');

-- Expected complete card keys are fixed from the source contract. Their values
-- come from source rows and normal defaults, before publication exists.
CREATE TEMP TABLE cat13_snapshot AS SELECT date_trunc('minute',clock_timestamp()) snapshot_minute;
CREATE TEMP TABLE cat13_promotion AS
SELECT a.listing_id,
 max(a.ends_at) FILTER (WHERE a.promotion_type='spotlight') spotlight_until,
 max(a.ends_at) FILTER (WHERE a.promotion_type='priority') priority_until
FROM public.listing_promotion_allocations a CROSS JOIN cat13_snapshot s
WHERE a.starts_at<=s.snapshot_minute AND a.ends_at>s.snapshot_minute
 AND (a.revoked_at IS NULL OR a.revoked_at>s.snapshot_minute)
GROUP BY a.listing_id;
CREATE FUNCTION pg_temp.cat13_expected_card(p_id uuid) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT (SELECT jsonb_object_agg(k, to_jsonb(l)->k)
 FROM unnest(ARRAY['id','owner_id','project_id','created_at','title','address','city','region',
 'price','price_per_sqm','sqm','bedrooms','bathrooms','floor','total_floors','year_built',
 'energy_class','property_type','listing_type','open_house_date','open_house_transaction_type',
 'auction_date','auction_starting_bid','cover_image_url','ai_score','views_count','tags',
 'heating_system','construction_status','commercial_subtype','walkability_score','safety_score',
 'noise_score','latitude','longitude','has_video_tour','has_virtual_tour','has_parking',
 'has_elevator','has_balcony','has_pool','pets_allowed','has_furnished','has_garden','has_ac',
 'has_fireplace','has_storage','has_view','has_smart_home','has_attic','has_double_glazing',
 'has_secure_door','has_alarm','has_loading_dock','has_three_phase_power','has_cctv',
 'has_disability_access','has_structured_cabling','has_facade','has_night_power',
 'has_solar_water','is_pre_sale']) k)
 || jsonb_build_object('status','active','tags',coalesce(to_jsonb(l.tags),'[]'::jsonb),
 'is_featured',p.spotlight_until IS NOT NULL,'featured_until',p.spotlight_until,
 'priority_placement',CASE WHEN p.priority_until IS NULL THEN 0 ELSE 1 END,
 'priority_until',p.priority_until,
 'is_off_market',false,
 'project',(SELECT jsonb_build_object('name',p.name,'delivery_date',p.delivery_date)
 FROM public.projects p WHERE p.id=l.project_id AND p.status='active'),
 'listing_images',coalesce((SELECT jsonb_agg(jsonb_build_object('url',x.url,'sort_order',x.sort_order)
 ORDER BY x.sort_order) FROM (SELECT i.url,i.sort_order FROM public.listing_images i
 WHERE i.listing_id=l.id ORDER BY i.sort_order LIMIT 3)x),'[]'::jsonb))
 FROM public.listings l LEFT JOIN cat13_promotion p ON p.listing_id=l.id WHERE l.id=p_id
$$;
CREATE TEMP TABLE cat13_expected_fixture AS
SELECT l.id,l.listing_type::text listing_type,l.created_at,l.price,l.ai_score,l.views_count,
 l.open_house_date,pg_temp.cat13_expected_card(l.id) card_payload
FROM public.listings l WHERE l.id::text LIKE 'c7130002-%' AND l.status='active' AND NOT l.is_off_market;
SELECT is((SELECT count(*)::integer FROM cat13_expected_fixture),6,'independent fixture card oracle has six visible rows');
SELECT is((SELECT bool_and(card_payload->>'city'='T13CatUnique' AND
 card_payload->>'owner_id'='c7130001-0000-4000-8000-000000000001') FROM cat13_expected_fixture),true,
 'full expected cards retain synthetic city and owner');

-- Publisher expectation is from independently enumerated source membership.
CREATE TEMP TABLE cat13_expected_publish AS SELECT
 (SELECT count(*)::integer FROM public.listings l JOIN public.public_listing_catalogue d ON d.id=l.id
 WHERE l.status='active' AND NOT l.is_off_market AND l.created_at <= (SELECT snapshot_minute FROM cat13_snapshot)
 AND lower(concat_ws(' ',coalesce(l.title,''),coalesce(l.address,''),coalesce(l.tags::text,'')))
 !~ '(supervisor-[0-9]+|e2e-full-publish|qa-full-publish|devin test|test free listing)') row_count,
 (SELECT count(*)::integer FROM cat13_expected_fixture) fixture_count;
CREATE TEMP TABLE cat13_expected_source AS
SELECT l.id listing_id,CASE WHEN p.priority_until IS NULL THEN 0 ELSE 1 END::integer priority_rank,
 (p.spotlight_until IS NOT NULL) spotlight_active,l.owner_id,l.project_id,
 l.created_at,l.title,l.address,l.city,l.region,
 lower(concat_ws(' ',coalesce(l.location_search_text,''),coalesce(l.address,''),
 coalesce(l.city,''),coalesce(l.region,''),coalesce(l.postal_code,''),coalesce(l.tags::text,''))) normalized_location,
 l.price,l.price_per_sqm,l.sqm,l.bedrooms::numeric bedrooms,l.bathrooms::numeric bathrooms,
 l.floor::numeric floor,l.total_floors::numeric total_floors,l.year_built,l.energy_class,
 l.property_type::text property_type,l.listing_type::text listing_type,
 CASE WHEN l.listing_type::text<>'auction' THEN NULL ELSE
 (SELECT substr(tag.value,length('os_auction:')+1) FROM unnest(coalesce(l.tags,'{}'::text[]))tag(value)
 WHERE tag.value LIKE 'os_auction:%' ORDER BY tag.value LIMIT 1) END os_tag,
 CASE WHEN l.listing_type::text<>'auction' THEN 0 ELSE
 (SELECT count(*)::integer FROM unnest(coalesce(l.tags,'{}'::text[]))tag(value)
 WHERE tag.value LIKE 'os_auction:%') END os_tag_count,l.open_house_date,l.open_house_transaction_type,
 l.auction_date,l.auction_starting_bid,l.ai_score::numeric ai_score,l.walkability_score::numeric walkability_score,
 l.views_count::bigint views_count,l.heating_system,l.construction_status,l.commercial_subtype,
 l.latitude,l.longitude,coalesce(l.tags,'{}'::text[]) tags,
 array_remove(ARRAY[
 CASE WHEN l.has_parking THEN 'has_parking' END,CASE WHEN l.has_elevator THEN 'has_elevator' END,
 CASE WHEN l.has_balcony THEN 'has_balcony' END,CASE WHEN l.has_pool THEN 'has_pool' END,
 CASE WHEN l.pets_allowed THEN 'pets_allowed' END,CASE WHEN l.has_furnished THEN 'has_furnished' END,
 CASE WHEN l.has_garden THEN 'has_garden' END,CASE WHEN l.has_ac THEN 'has_ac' END,
 CASE WHEN l.has_fireplace THEN 'has_fireplace' END,CASE WHEN l.has_storage THEN 'has_storage' END,
 CASE WHEN l.has_view THEN 'has_view' END,CASE WHEN l.has_smart_home THEN 'has_smart_home' END,
 CASE WHEN l.has_attic THEN 'has_attic' END,CASE WHEN l.has_double_glazing THEN 'has_double_glazing' END,
 CASE WHEN l.has_secure_door THEN 'has_secure_door' END,CASE WHEN l.has_alarm THEN 'has_alarm' END,
 CASE WHEN l.has_loading_dock THEN 'has_loading_dock' END,
 CASE WHEN l.has_three_phase_power THEN 'has_three_phase_power' END,
 CASE WHEN l.has_cctv THEN 'has_cctv' END,
 CASE WHEN l.has_disability_access THEN 'has_disability_access' END,
 CASE WHEN l.has_structured_cabling THEN 'has_structured_cabling' END,
 CASE WHEN l.has_facade THEN 'has_facade' END,CASE WHEN l.has_night_power THEN 'has_night_power' END,
 CASE WHEN l.has_solar_water THEN 'has_solar_water' END,
 CASE WHEN l.has_video_tour THEN 'has_video_tour' END,
 CASE WHEN l.has_virtual_tour THEN 'has_virtual_tour' END]::text[],NULL) features,
 pg_temp.cat13_expected_card(l.id) card_payload,
 (to_jsonb(d)-'listing_images_detail'-'project_detail') ||
 jsonb_build_object('status','active','listing_images',d.listing_images_detail,
 'project',d.project_detail,'is_featured',p.spotlight_until IS NOT NULL,
 'featured_until',p.spotlight_until,
 'priority_placement',CASE WHEN p.priority_until IS NULL THEN 0 ELSE 1 END,
 'priority_until',p.priority_until) detail_payload
FROM public.listings l JOIN public.public_listing_catalogue d ON d.id=l.id
LEFT JOIN cat13_promotion p ON p.listing_id=l.id
WHERE l.status='active' AND NOT l.is_off_market
 AND l.created_at <= (SELECT snapshot_minute FROM cat13_snapshot)
 AND lower(concat_ws(' ',coalesce(l.title,''),coalesce(l.address,''),coalesce(l.tags::text,'')))
 !~ '(supervisor-[0-9]+|e2e-full-publish|qa-full-publish|devin test|test free listing)';
SELECT is((SELECT count(*)::integer FROM cat13_expected_source),
 (SELECT row_count FROM cat13_expected_publish),
 'complete prepublication source model covers all old and fixture candidates');
SELECT is((SELECT count(*)::integer FROM cat13_expected_source WHERE listing_id::text LIKE 'c7130002-%'),6,
 'complete source model has exact synthetic membership');
SELECT is((SELECT count(*)::integer FROM cat13_expected_source WHERE listing_id::text NOT LIKE 'c7130002-%'),
 (SELECT row_count-fixture_count FROM cat13_expected_publish),
 'complete source model includes all pre-existing eligible listings');
CREATE TEMP TABLE cat13_pre_versions AS SELECT * FROM private.public_catalogue_versions;
CREATE TEMP TABLE cat13_pre_publications AS SELECT * FROM private.public_catalogue_publications;
CREATE TEMP TABLE cat13_delta AS
SELECT m.listing_id,decode(md5(to_jsonb(m)::text),'hex') expected_hash,
 v.version_id prior_version_id,
 (v.version_id IS NULL OR v.content_hash IS DISTINCT FROM decode(md5(to_jsonb(m)::text),'hex')) needs_new
FROM cat13_expected_source m LEFT JOIN cat13_pre_versions v
 ON v.listing_id=m.listing_id AND v.valid_to_publication IS NULL;
CREATE TEMP TABLE cat13_removed AS
SELECT v.version_id FROM cat13_pre_versions v
WHERE v.valid_to_publication IS NULL
 AND NOT EXISTS (SELECT 1 FROM cat13_expected_source m WHERE m.listing_id=v.listing_id);
CREATE TEMP TABLE cat13_expected_publish_delta AS
SELECT (SELECT count(*)::integer FROM cat13_expected_source) row_count,
 ((SELECT count(*)::integer FROM cat13_delta WHERE needs_new)+
  (SELECT count(*)::integer FROM cat13_removed)) source_transition_count,
 ((SELECT count(*)::integer FROM cat13_delta WHERE needs_new)+
  (SELECT count(*)::integer FROM cat13_delta WHERE needs_new AND prior_version_id IS NOT NULL)+
  (SELECT count(*)::integer FROM cat13_removed)) version_mutation_count,
 (SELECT count(*)::integer FROM cat13_pre_versions WHERE valid_to_publication IS NOT NULL) historical_closed_count,
 ((SELECT count(*)::integer FROM cat13_delta WHERE needs_new)+
  (SELECT count(*)::integer FROM cat13_removed)+
  (SELECT count(*)::integer FROM cat13_pre_versions WHERE valid_to_publication IS NOT NULL)) reported_changed_count,
 (SELECT count(*)::integer FROM cat13_delta WHERE needs_new) new_version_count;
SELECT is((SELECT row_count FROM cat13_expected_publish_delta),
 (SELECT row_count FROM cat13_expected_publish),
 'source membership and independent full-join delta agree before publication');
CREATE TEMP TABLE cat13_seed AS SELECT pg_temp.cat13_graph() graph;

SET LOCAL ROLE service_role;
CREATE TEMP TABLE cat13_published AS SELECT * FROM public.publish_public_catalogue();
RESET ROLE;
SELECT is((SELECT count(*)::integer FROM cat13_published),1,'service publisher returns one complete record');
SELECT is((SELECT row_count FROM cat13_published),(SELECT row_count FROM cat13_expected_publish),
 'returned source cardinality equals independent prepublication count');
SELECT is((SELECT changed_count FROM cat13_published),(SELECT reported_changed_count FROM cat13_expected_publish_delta),
 'returned changed cardinality follows pinned full join including historical closed rows');
SELECT ok((SELECT publication_id > (SELECT max((p->>'publication_id')::bigint)
 FROM jsonb_array_elements((SELECT graph->'publications' FROM cat13_seed))p)
 AND snapshot_minute=date_trunc('minute',
 (SELECT started_at FROM private.public_catalogue_publications
 WHERE publication_id=cat13_published.publication_id))
 AND snapshot_minute=(SELECT snapshot_minute FROM cat13_snapshot)
 AND published_at >= snapshot_minute AND published_at < snapshot_minute+interval '1 minute'
 FROM cat13_published),'returned publication identity and clock follow normal publisher contract');
SELECT is((SELECT publication_id FROM cat13_published),
 (SELECT (seqs->>'private.public_catalogue_publications_publication_id_seq')::bigint+1
 FROM cat13_baseline),'new publication identity consumes exactly one named sequence value');
SELECT is((SELECT to_jsonb(p) FROM cat13_published p),
 (SELECT jsonb_build_object('publication_id',publication_id,'snapshot_minute',snapshot_minute,
 'published_at',published_at,'row_count',e.row_count,'changed_count',e.reported_changed_count)
 FROM cat13_published CROSS JOIN cat13_expected_publish_delta e),
 'all five publisher return fields match independent count and generated bindings');
SELECT is((SELECT count(*)::integer FROM private.public_catalogue_versions v
 WHERE v.valid_from_publication=(SELECT publication_id FROM cat13_published)),
 (SELECT new_version_count FROM cat13_expected_publish_delta),
 'publisher creates exactly the modeled new source versions');
SELECT is((SELECT count(DISTINCT version_id)::integer FROM private.public_catalogue_versions v
 WHERE v.valid_from_publication=(SELECT publication_id FROM cat13_published)),
 (SELECT new_version_count FROM cat13_expected_publish_delta),
 'all modeled new version identities are distinct');
SELECT is((SELECT min(version_id) FROM private.public_catalogue_versions v
 WHERE v.valid_from_publication=(SELECT publication_id FROM cat13_published)),
 (SELECT coalesce((seqs->>'private.public_catalogue_versions_version_id_seq')::bigint,0)+1
 FROM cat13_baseline),'first new version identity follows named sequence prestate');
SELECT is((SELECT max(version_id) FROM private.public_catalogue_versions v
 WHERE v.valid_from_publication=(SELECT publication_id FROM cat13_published)),
 (SELECT coalesce((seqs->>'private.public_catalogue_versions_version_id_seq')::bigint,0)+d.new_version_count
 FROM cat13_baseline CROSS JOIN cat13_expected_publish_delta d),
 'last new version identity consumes exact modeled sequence span');
SELECT is((SELECT count(*)::integer FROM cat13_expected_source m
 JOIN cat13_delta d ON d.listing_id=m.listing_id
 JOIN private.public_catalogue_versions v ON v.listing_id=m.listing_id
 WHERE (to_jsonb(v)-'version_id'-'valid_from_publication'-'valid_to_publication'-'content_hash')
 = (to_jsonb(m)-'os_tag_count')
 AND v.content_hash=decode(md5(to_jsonb(m)::text),'hex')
 AND v.valid_from_publication=(SELECT publication_id FROM cat13_published)
 AND v.valid_to_publication IS NULL AND d.needs_new),
 (SELECT new_version_count FROM cat13_expected_publish_delta),
 'all new complete version records and hashes equal independent source model');
SELECT is((SELECT count(*)::integer FROM private.public_catalogue_versions v
 JOIN cat13_expected_fixture e ON e.id=v.listing_id
 WHERE v.valid_from_publication=(SELECT publication_id FROM cat13_published)
 AND v.valid_to_publication IS NULL AND v.card_payload=e.card_payload
 AND v.price=e.price AND v.ai_score IS NOT DISTINCT FROM e.ai_score
 AND v.views_count=e.views_count AND v.created_at=e.created_at
 AND v.open_house_date IS NOT DISTINCT FROM e.open_house_date
 AND v.listing_type=e.listing_type AND v.priority_rank=0),6,
 'six fixture versions have independently modeled full cards and sort fields');
SELECT is((SELECT count(*)::integer FROM private.public_catalogue_versions v
 WHERE v.listing_id::text LIKE 'c7130002-%'),6,
 'hidden draft/off-market rows have no version');
CREATE TEMP TABLE cat13_retention AS
SELECT min(publication_id) oldest_retained FROM
 (SELECT publication_id FROM
  (SELECT publication_id FROM cat13_pre_publications WHERE status='published'
   UNION ALL SELECT publication_id FROM cat13_published) published
  ORDER BY publication_id DESC LIMIT 46) recent;
CREATE TEMP TABLE cat13_expected_old_publications AS
SELECT * FROM cat13_pre_publications old CROSS JOIN cat13_retention r
WHERE NOT ((old.status='published' AND old.retain_until <=
 (SELECT started_at FROM private.public_catalogue_publications
  WHERE publication_id=(SELECT publication_id FROM cat13_published))
 AND old.publication_id < r.oldest_retained)
 OR (old.status='building' AND old.started_at <
 (SELECT started_at FROM private.public_catalogue_publications
  WHERE publication_id=(SELECT publication_id FROM cat13_published))-interval '5 minutes'));
SELECT is((SELECT count(*)::integer FROM private.public_catalogue_publications),
 (SELECT count(*)::integer+1 FROM cat13_expected_old_publications),
 'retention keeps precisely modeled old publications and the new publication');
SELECT is((SELECT to_jsonb(c)-'updated_at' FROM private.public_catalogue_current c),
 jsonb_build_object('singleton',true,'publication_id',(SELECT publication_id FROM cat13_published)),
 'current pointer identifies exactly the new publication');
SELECT is((SELECT updated_at FROM private.public_catalogue_current),
 (SELECT published_at FROM cat13_published),'pointer timestamp follows publisher return');
SELECT is((SELECT status FROM private.public_catalogue_publications
 WHERE publication_id=(SELECT publication_id FROM cat13_published)),'published',
 'new publication finalized');
SELECT is((SELECT retain_until-snapshot_minute FROM private.public_catalogue_publications
 WHERE publication_id=(SELECT publication_id FROM cat13_published)),interval '40 minutes',
 'new publication retention matches exact contract');
SELECT is((SELECT row_count FROM private.public_catalogue_publications
 WHERE publication_id=(SELECT publication_id FROM cat13_published)),(SELECT row_count FROM cat13_expected_publish),
 'persisted publication count equals independent source membership');
SELECT is((SELECT (homepage_payload->>'auction_count')::integer FROM private.public_catalogue_publications
 WHERE publication_id=(SELECT publication_id FROM cat13_published)),
 (SELECT count(*)::integer FROM cat13_expected_source WHERE listing_type='auction'),
 'homepage auction count equals independent source membership');
CREATE TEMP TABLE cat13_expected_homepage AS
SELECT jsonb_build_object(
 'publication_id',p.publication_id,'snapshot_minute',p.snapshot_minute,
 'featured',coalesce((SELECT jsonb_agg(x.card_payload ORDER BY x.created_at DESC)
 FROM (SELECT card_payload,created_at FROM cat13_expected_source
 WHERE spotlight_active AND listing_type IN ('sale','new_build')
 ORDER BY created_at DESC,listing_id DESC LIMIT 12)x),'[]'::jsonb),
 'open_houses',coalesce((SELECT jsonb_agg(x.card_payload ORDER BY x.open_house_date)
 FROM (SELECT card_payload,open_house_date FROM cat13_expected_source
 WHERE listing_type='open_house' AND open_house_date>=p.snapshot_minute
 ORDER BY open_house_date,listing_id LIMIT 12)x),'[]'::jsonb),
 'property_type_counts',coalesce((SELECT jsonb_object_agg(property_type,n)
 FROM (SELECT property_type,count(*)::integer n FROM cat13_expected_source GROUP BY property_type)c),'{}'::jsonb),
 'popular_locations',coalesce((SELECT jsonb_agg(jsonb_build_object('city',city,'listing_count',n)
 ORDER BY n DESC,city) FROM (SELECT city,count(*)::integer n FROM cat13_expected_source
 GROUP BY city ORDER BY count(*) DESC,city LIMIT 12)c),'[]'::jsonb),
 'price_index',coalesce((SELECT jsonb_agg(jsonb_build_object('city',city,'avg_price_per_sqm',avg_sqm,
 'listing_count',n) ORDER BY n DESC,city) FROM
 (SELECT city,round(avg(price_per_sqm)) avg_sqm,count(*)::integer n FROM cat13_expected_source
 WHERE price_per_sqm IS NOT NULL GROUP BY city ORDER BY count(*) DESC,city LIMIT 12)c),'[]'::jsonb),
 'auction_count',(SELECT count(*)::integer FROM cat13_expected_source WHERE listing_type='auction')) payload
FROM cat13_published p;
SELECT is((SELECT homepage_payload FROM private.public_catalogue_publications
 WHERE publication_id=(SELECT publication_id FROM cat13_published)),
 (SELECT payload FROM cat13_expected_homepage),
 'entire homepage payload equals independent complete-source aggregation');
SELECT ok((SELECT started_at>=snapshot_minute AND started_at<=published_at
 AND published_at=(SELECT published_at FROM cat13_published)
 FROM private.public_catalogue_publications
 WHERE publication_id=(SELECT publication_id FROM cat13_published)),
 'generated publication timestamps obey order and returned identity');
SELECT is((SELECT to_jsonb(p) FROM private.public_catalogue_publications p
 WHERE p.publication_id=(SELECT publication_id FROM cat13_published)),
 (SELECT jsonb_build_object('publication_id',r.publication_id,'snapshot_minute',r.snapshot_minute,
 'started_at',actual.started_at,'published_at',r.published_at,
 'retain_until',r.snapshot_minute+interval '40 minutes',
 'row_count',e.row_count,'changed_count',e.reported_changed_count,'status','published',
 'homepage_payload',h.payload)
 FROM cat13_published r CROSS JOIN cat13_expected_publish_delta e CROSS JOIN cat13_expected_homepage h
 JOIN private.public_catalogue_publications actual ON actual.publication_id=r.publication_id),
 'complete new publication row matches independent counts, payload, retention and bound timestamps');
SELECT is((SELECT jsonb_agg(to_jsonb(p) ORDER BY publication_id)
 FROM private.public_catalogue_publications p WHERE p.publication_id<>(SELECT publication_id FROM cat13_published)),
 (SELECT coalesce(jsonb_agg(to_jsonb(p)-'oldest_retained' ORDER BY publication_id),'[]'::jsonb)
 FROM cat13_expected_old_publications p),
 'complete retained old publication rows match prestate and retention model');
SELECT is((SELECT graph->'current' FROM cat13_seed),
 (SELECT graph->'current' FROM cat13_pre),
 'fixture creation leaves the prior catalogue current pointer unchanged');
CREATE TEMP TABLE cat13_expected_graph AS
SELECT jsonb_set(jsonb_set(jsonb_set(s.graph,'{publications}',
 (SELECT coalesce(jsonb_agg(to_jsonb(old)-'oldest_retained' ORDER BY old.publication_id),'[]'::jsonb)
 FROM cat13_expected_old_publications old)||jsonb_build_array(jsonb_build_object(
 'publication_id',p.publication_id,'snapshot_minute',p.snapshot_minute,
 'started_at',actual.started_at,'published_at',p.published_at,
 'retain_until',p.snapshot_minute+interval '40 minutes',
 'row_count',e.row_count,'changed_count',e.reported_changed_count,'status','published',
 'homepage_payload',h.payload)),false),'{current}',
 jsonb_build_array(jsonb_build_object('singleton',true,'publication_id',p.publication_id,
 'updated_at',p.published_at)),false),'{versions}',
 (SELECT coalesce(jsonb_agg(version_row ORDER BY version_id),'[]'::jsonb) FROM (
  SELECT old.version_id,
   to_jsonb(old)||jsonb_build_object('valid_to_publication',
    CASE WHEN old.valid_to_publication IS NULL AND
     (d.needs_new OR removed.version_id IS NOT NULL) THEN p.publication_id
     ELSE old.valid_to_publication END) version_row
  FROM cat13_pre_versions old
  LEFT JOIN cat13_delta d ON d.prior_version_id=old.version_id
  LEFT JOIN cat13_removed removed ON removed.version_id=old.version_id
  CROSS JOIN cat13_retention r
  WHERE NOT (old.valid_to_publication IS NOT NULL AND
    old.valid_to_publication<=r.oldest_retained)
   AND NOT (old.valid_to_publication IS NULL AND
    (d.needs_new OR removed.version_id IS NOT NULL) AND p.publication_id<=r.oldest_retained)
  UNION ALL
  SELECT v.version_id,(to_jsonb(m)-'os_tag_count')||jsonb_build_object(
   'version_id',v.version_id,'valid_from_publication',p.publication_id,
   'valid_to_publication',NULL::bigint,'content_hash',d.expected_hash)
  FROM cat13_expected_source m JOIN cat13_delta d ON d.listing_id=m.listing_id AND d.needs_new
  JOIN private.public_catalogue_versions v ON v.listing_id=m.listing_id
   AND v.valid_from_publication=p.publication_id
 ) modeled),false) graph
FROM cat13_seed s CROSS JOIN cat13_published p CROSS JOIN cat13_expected_publish_delta e
CROSS JOIN cat13_expected_homepage h
JOIN private.public_catalogue_publications actual ON actual.publication_id=p.publication_id;
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_expected_graph),
 'entire persisted graph equals source-derived publication, pointer and all retained and new complete versions');
CREATE TEMP TABLE cat13_published_graph AS SELECT pg_temp.cat13_graph() graph;
SELECT new_version_count AS cat13_new_count FROM cat13_expected_publish_delta \gset
SELECT publication_id AS cat13_publication_id FROM cat13_published \gset

-- Reader result sets are isolated by a supported city filter. The expected
-- records are composed from prepublication source cards, never actual versions.
CREATE FUNCTION pg_temp.cat13_expected_rows(p_ids integer[]) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
 'publication_id',p.publication_id,'published_at',p.published_at,
 'listing_id',e.id,'priority_rank',0,'created_at',e.created_at,'price',e.price,
 'ai_score',e.ai_score,'views_count',e.views_count,'open_house_date',e.open_house_date,
 'card_payload',e.card_payload) ORDER BY wanted.ord),'[]'::jsonb)
 FROM unnest(p_ids) WITH ORDINALITY wanted(n,ord)
 JOIN cat13_expected_fixture e ON e.id=('c7130002-0000-4000-8000-'||lpad(wanted.n::text,12,'0'))::uuid
 CROSS JOIN cat13_published p
$$;
SET LOCAL ROLE anon;
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_limit=>2) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[4,3]),
 'anon newest first page exact full records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'newest page preserves complete graph');

SELECT created_at AS cat13_created_at FROM cat13_clock \gset
SET LOCAL ROLE anon;
SELECT is(current_user,'anon','newest continuation executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_sort=>'newest',
 p_cursor_timestamp=>:'cat13_created_at'::timestamptz,
 p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000003',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[2,1]),
 'newest keyset returns B,A complete records without repeated C,D');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'newest continuation preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','price ascending continuation executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_sort=>'price_asc',
 p_cursor_numeric=>200,p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000002',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[3,4]),
 'ascending-price keyset returns exact C,D records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'ascending-price read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','price descending continuation executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_sort=>'price_desc',
 p_cursor_numeric=>300,p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000003',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[2,1]),
 'descending-price keyset returns exact B,A records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'descending-price read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','views continuation executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_sort=>'views',
 p_cursor_numeric=>30,p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000002',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[3,4]),
 'views keyset returns exact C,D records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'views read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','scored AI continuation executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_sort=>'ai_score',
 p_cursor_numeric=>90,p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000001',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[2,4,3]),
 'scored AI continuation enters null scores in exact order');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'scored AI read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','null AI continuation executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_sort=>'ai_score',p_cursor_is_null=>true,
 p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000004',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[3]),
 'null AI cursor returns the one lower-UUID null row');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'null AI read preserves graph');

SELECT upcoming_at AS cat13_upcoming_at,past_at AS cat13_past_at FROM cat13_clock \gset
SET LOCAL ROLE anon;
SELECT is(current_user,'anon','upcoming open-house reader executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'open_house',p_open_house_mode=>'upcoming',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[5]),
 'upcoming first page returns exact U record');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'upcoming first page preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','upcoming cursor executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'open_house',p_open_house_mode=>'upcoming',
 p_cursor_timestamp=>:'cat13_upcoming_at'::timestamptz,
 p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000005',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,'[]'::jsonb,'upcoming cursor past U returns empty');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'upcoming empty continuation preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','past open-house reader executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'open_house',p_open_house_mode=>'past',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[6]),
 'past first page returns exact P record');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'past first page preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','past cursor executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'open_house',p_open_house_mode=>'past',
 p_cursor_timestamp=>:'cat13_past_at'::timestamptz,
 p_cursor_listing_id=>'c7130002-0000-4000-8000-000000000006',p_limit=>4) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,'[]'::jsonb,'past cursor past P returns empty');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'past empty continuation preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','visibility control executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_limit=>20) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[6,5,4,3,2,1]),
 'all six visible fixtures and neither hidden control return as exact records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'visibility read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','empty priority stream executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_priority_mode=>'priority',p_limit=>20) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,'[]'::jsonb,'no priority allocations yields exact empty stream');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'priority empty read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','organic stream executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_priority_mode=>'organic',p_limit=>20) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[6,5,4,3,2,1]),
 'all six fixtures return in organic stream with exact records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'organic read preserves graph');

SET LOCAL ROLE authenticated;
SELECT is(current_user,'authenticated','authenticated browser reader uses actual database role');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_listing_type=>'sale',p_limit=>20) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,pg_temp.cat13_expected_rows(ARRAY[4,3,2,1]),
 'authenticated reader sees same exact pinned sale records');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'authenticated read preserves graph');

SET LOCAL ROLE anon;
SELECT is(current_user,'anon','nonmatching supported filter executes under anon');
SELECT coalesce(jsonb_agg(to_jsonb(q)-'ordinality' ORDER BY q.ordinality),'[]'::jsonb) AS cat13_result
 FROM public.query_public_catalogue(p_publication_id=>:cat13_publication_id,
 p_city=>'T13CatUnique',p_property_type=>'house',p_limit=>20) WITH ORDINALITY q \gset
RESET ROLE;
SELECT is(:'cat13_result'::jsonb,'[]'::jsonb,'nonmatching property type returns zero');
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'nonmatching filter preserves graph');

SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT * FROM public.query_public_catalogue(p_publication_id=>%s,p_sort=>''unknown'')',
 :cat13_publication_id),'22023','public_catalogue_invalid_sort','anon invalid sort denied');
RESET ROLE;
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'invalid sort denial preserves graph');
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT * FROM public.query_public_catalogue(p_publication_id=>%s,p_open_house_mode=>''future'')',
 :cat13_publication_id),'22023','public_catalogue_invalid_open_house_mode','anon invalid open-house mode denied');
RESET ROLE;
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'invalid open-house mode preserves graph');
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT * FROM public.query_public_catalogue(p_publication_id=>%s,p_sort=>''newest'',p_cursor_listing_id=>''c7130002-0000-4000-8000-000000000001'')',
 :cat13_publication_id),'22023','public_catalogue_invalid_cursor','anon incomplete newest cursor denied');
RESET ROLE;
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'incomplete newest cursor preserves graph');
SET LOCAL ROLE anon;
SELECT throws_ok(format('SELECT * FROM public.query_public_catalogue(p_publication_id=>%s,p_sort=>''ai_score'',p_cursor_listing_id=>''c7130002-0000-4000-8000-000000000001'')',
 :cat13_publication_id),'22023','public_catalogue_invalid_cursor','anon incomplete scored AI cursor denied');
RESET ROLE;
SELECT is(pg_temp.cat13_graph(),(SELECT graph FROM cat13_published_graph),'incomplete AI cursor preserves graph');

SELECT * FROM finish();
ROLLBACK;
\echo CAT13_ROLLBACK_COMPLETE
DO $$ DECLARE b record; h jsonb; BEGIN
 SELECT * INTO STRICT b FROM cat13_baseline;
 SELECT jsonb_object_agg(p.oid::regprocedure::text,encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex')) INTO h
 FROM pg_proc p WHERE p.oid IN (
 'public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamptz,numeric,uuid,boolean,integer,integer,jsonb)'::regprocedure,
 'public.publish_public_catalogue()'::regprocedure,'private.publish_public_catalogue()'::regprocedure,
 'private.resolve_public_catalogue_publication(bigint)'::regprocedure,
 'public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure);
 IF b.pid IS DISTINCT FROM pg_backend_pid() OR b.db_role IS DISTINCT FROM current_user
 OR b.session_role IS DISTINCT FROM session_user OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.origin IS DISTINCT FROM current_setting('session_replication_role') OR b.actor IS DISTINCT FROM auth.uid()
 OR b.jwt IS DISTINCT FROM auth.jwt() OR nullif(b.sub_claim,'') IS DISTINCT FROM nullif(current_setting('request.jwt.claim.sub',true),'')
 OR nullif(b.claims,'') IS DISTINCT FROM nullif(current_setting('request.jwt.claims',true),'')
 OR nullif(b.role_claim,'') IS DISTINCT FROM nullif(current_setting('request.jwt.claim.role',true),'') OR b.hashes IS DISTINCT FROM h
 OR b.bindings IS DISTINCT FROM pg_temp.cat13_bindings()
 OR b.settings IS DISTINCT FROM (SELECT jsonb_object_agg(name,setting) FROM pg_settings)
 OR b.graph IS DISTINCT FROM pg_temp.cat13_outer_graph()
 THEN RAISE EXCEPTION 'catalogue same-backend baseline changed: settings %, graph %',
 b.settings IS DISTINCT FROM (SELECT jsonb_object_agg(name,setting) FROM pg_settings),
 b.graph IS DISTINCT FROM pg_temp.cat13_outer_graph(); END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'cat13_%' AND relname<>'cat13_baseline')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'cat13_%'
 AND proname NOT IN ('cat13_outer_graph','cat13_check_sequences','cat13_bindings'))
 OR EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'c7130001-%')
 OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'c7130001-%')
 OR EXISTS (SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'c7130001-%')
 OR EXISTS (SELECT 1 FROM public.listings WHERE id::text LIKE 'c7130002-%')
 OR EXISTS (SELECT 1 FROM private.public_catalogue_versions WHERE listing_id::text LIKE 'c7130002-%')
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 THEN RAISE EXCEPTION 'catalogue suite residue'; END IF;
END $$;
SELECT pg_temp.cat13_check_sequences(:cat13_new_count);
SELECT 'CAT13_POST' phase,pid,db_role,session_role,marker,origin,actor,jwt,
 sub_claim,claims,role_claim,hashes,pg_temp.cat13_bindings() bindings,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences) seqs,
 encode(digest((SELECT jsonb_object_agg(name,setting) FROM pg_settings)::text,'sha256'),'hex') settings_sha256,
 encode(digest(pg_temp.cat13_outer_graph()::text,'sha256'),'hex') graph_sha256
FROM cat13_baseline;
DROP TABLE cat13_baseline;
DROP FUNCTION pg_temp.cat13_outer_graph();
DROP FUNCTION pg_temp.cat13_bindings();
DROP FUNCTION pg_temp.cat13_check_sequences(integer);
SELECT 'CAT13_SAME_BACKEND_CLEAN' result;
