\set ON_ERROR_STOP on
DO $$ BEGIN
 IF current_database() !~ '^(maiprop_d0_[a-z0-9_]{6,48}|maiprop_t13promo_[0-9]{8}_activation[0-9]{2})$'
 OR current_database() IN ('postgres','template0','template1','maiprop_t12q_20260930_source','maiprop_d0_20261003_refresh01')
 OR current_setting('maiprop.test_disposable_database',true) IS DISTINCT FROM current_database()
 OR current_user <> 'postgres' OR session_user <> 'postgres'
 OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> 'postgres'
 OR inet_server_addr() IS NOT NULL OR current_setting('session_replication_role') <> 'origin'
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source') <> 0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source')) <> 0
 OR EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'promo13_%')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'promo13_%')
 THEN RAISE EXCEPTION 'promotion suite requires owned disposable socket clone and origin triggers'; END IF;
END $$;
-- Register pg_trgm defaults before the exact pg_settings PRE baseline. Normal
-- listing writes otherwise register them lazily during this transaction.
DO $$ BEGIN PERFORM extensions.similarity('promotion','promotion'); END $$;

CREATE FUNCTION pg_temp.promo13_bindings() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'routines',(SELECT jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object(
  'sha256',encode(digest(pg_get_functiondef(p.oid),'sha256'),'hex'),
  'owner',pg_get_userbyid(p.proowner),'security_definer',p.prosecdef,
  'acl',to_jsonb(p.proacl),'config',to_jsonb(p.proconfig)))
  FROM pg_proc p WHERE p.oid IN (
   'private.activate_listing_promotion(uuid,text,text)'::regprocedure,
   'public.activate_listing_promotion(uuid,text,text)'::regprocedure,
   'private.get_listing_promotion_plan_allowance(uuid,text)'::regprocedure,
   'private.current_listing_promotion_plan_subscription(uuid)'::regprocedure,
   'private.guard_listing_promotion_subscription_source()'::regprocedure,
   'private.guard_listing_promotion_allocation_identity()'::regprocedure,
   'private.guard_listing_promotion_eligibility()'::regprocedure,
   'private.sync_listing_promotion_projection(uuid)'::regprocedure,
   'private.sync_listing_promotion_projection_trigger()'::regprocedure,
   'private.notify_featured_listing_change()'::regprocedure,
   'private.insert_interaction_notification(uuid,uuid,text,text,text,text)'::regprocedure,
   'public.current_billing_runtime_mode()'::regprocedure,
   'public.addon_credit_units(text,integer)'::regprocedure,
   'public.set_addon_purchase_credits()'::regprocedure,
   'private.revoke_refunded_listing_promotions()'::regprocedure,
   'public.release_expired_firesale_reservations(uuid)'::regprocedure,
   'public.audit_firesale_interest_mutation()'::regprocedure,
   'public.has_platform_admin(uuid)'::regprocedure,
   'private.has_platform_admin(uuid)'::regprocedure,
   'public.admin_review_invitation_request(uuid,uuid,text,text,text)'::regprocedure)),
 'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,
  'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true),
  'function',t.tgfoid::regprocedure::text) ORDER BY t.tgrelid::regclass::text,t.tgname),'[]'::jsonb)
  FROM pg_trigger t WHERE t.tgrelid IN ('auth.users'::regclass,'public.profiles'::regclass,
   'public.listings'::regclass,'public.billing_subscriptions'::regclass,
   'public.addon_purchases'::regclass,'public.listing_promotion_allocations'::regclass)
   AND NOT t.tgisinternal),
 'acl',(SELECT jsonb_build_object('public_anon',has_schema_privilege('anon','public','USAGE'),
  'public_authenticated',has_schema_privilege('authenticated','public','USAGE'),
  'private_schema_authenticated',has_schema_privilege('authenticated','private','USAGE'),
  'wrapper_authenticated',has_function_privilege('authenticated','public.activate_listing_promotion(uuid,text,text)','EXECUTE'),
  'wrapper_anon',has_function_privilege('anon','public.activate_listing_promotion(uuid,text,text)','EXECUTE'),
  'wrapper_service',has_function_privilege('service_role','public.activate_listing_promotion(uuid,text,text)','EXECUTE'),
  'private_authenticated',has_function_privilege('authenticated','private.activate_listing_promotion(uuid,text,text)','EXECUTE'),
  'private_service',has_function_privilege('service_role','private.activate_listing_promotion(uuid,text,text)','EXECUTE'),
  'allocation_write_authenticated',has_table_privilege('authenticated','public.listing_promotion_allocations','INSERT,UPDATE,DELETE'),
  'addon_write_authenticated',has_table_privilege('authenticated','public.addon_purchases','INSERT,UPDATE,DELETE'))))
$$;
CREATE FUNCTION pg_temp.promo13_graph() RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object(
 'users',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(u)),'{}'::jsonb) FROM auth.users u),
 'profiles',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles p),
 'profiles_public',(SELECT coalesce(jsonb_object_agg(user_id::text,to_jsonb(p)),'{}'::jsonb) FROM public.profiles_public p),
 'listings',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(l)),'{}'::jsonb) FROM public.listings l),
 'subscriptions',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(s)),'{}'::jsonb) FROM public.billing_subscriptions s),
 'pricing',(SELECT coalesce(jsonb_object_agg(key,to_jsonb(c)),'{}'::jsonb) FROM public.pricing_configs c),
 'purchases',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.addon_purchases a),
 'allocations',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(a)),'{}'::jsonb) FROM public.listing_promotion_allocations a),
 'refunds',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY id),'[]'::jsonb) FROM private.addon_refund_events r),
 'notifications',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(n)),'{}'::jsonb) FROM public.notifications n),
 'projects',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(p)),'{}'::jsonb) FROM public.projects p),
 'images',(SELECT coalesce(jsonb_object_agg(id::text,to_jsonb(i)),'{}'::jsonb) FROM public.listing_images i),
 'catalogue_publications',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY publication_id),'[]'::jsonb) FROM private.public_catalogue_publications p),
 'catalogue_current',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY singleton),'[]'::jsonb) FROM private.public_catalogue_current c),
 'catalogue_versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY version_id),'[]'::jsonb) FROM private.public_catalogue_versions v))
$$;
CREATE TEMP TABLE promo13_baseline AS SELECT pg_backend_pid() pid,current_user db_role,
 session_user session_role,current_setting('maiprop.test_disposable_database',true) marker,
 current_setting('session_replication_role') origin,auth.uid() actor,auth.jwt() jwt,
 current_setting('request.jwt.claim.sub',true) sub_claim,
 current_setting('request.jwt.claims',true) claims,
 current_setting('request.jwt.claim.role',true) role_claim,
 pg_temp.promo13_bindings() bindings,
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences) seqs,
 (SELECT jsonb_object_agg(name,setting) FROM pg_settings) settings,
 pg_temp.promo13_graph() graph;
SELECT 'PROMO13_PRE',pid,db_role,session_role,marker,origin,actor,jwt,
 sub_claim,claims,role_claim,bindings,seqs,
 encode(digest(settings::text,'sha256'),'hex') settings_sha256,
 encode(digest(graph::text,'sha256'),'hex') graph_sha256 FROM promo13_baseline;

BEGIN;
SET LOCAL statement_timeout='40s';
SET LOCAL lock_timeout='3s';
SET LOCAL search_path=public,extensions;
SET LOCAL client_min_messages=warning;
SELECT plan(46);
SELECT is(current_setting('session_replication_role'),'origin','all fixture and business triggers stay active');
SELECT is((SELECT count(*)::integer FROM pg_trigger t WHERE t.tgrelid IN
 ('auth.users'::regclass,'public.profiles'::regclass,'public.listings'::regclass,
 'public.billing_subscriptions'::regclass,'public.addon_purchases'::regclass,
 'public.listing_promotion_allocations'::regclass) AND NOT t.tgisinternal AND t.tgenabled<>'O'),0,
 'all relevant normal triggers enabled');
SELECT ok((SELECT bool_and(encode(digest(pg_get_functiondef(to_regprocedure(sig)),'sha256'),'hex')=sha)
 FROM (VALUES
 ('private.activate_listing_promotion(uuid,text,text)','22a623559168d0a459311505b7f7a4c86dab4beb9978546d2960a0eeeae15ea6'),
 ('public.activate_listing_promotion(uuid,text,text)','1ac373d2bcafb4d79c1667daf07adc54c97835ecd2b980eebaad5c92a4fea05a'),
 ('public.release_expired_firesale_reservations(uuid)','d407139144d8ad3a0ed4bfe49edca50e14a465b21c8fe3f993816dcfe37fbc08'),
 ('public.audit_firesale_interest_mutation()','7085921d35e04cc57beddda7b0b495736cda701374596264e02c7d960d847c1c'),
 ('public.has_platform_admin(uuid)','31374ac294981f0d938178be1c91778ae53603f94b32c170304fd62b0cecfb12'),
 ('private.has_platform_admin(uuid)','ca2dbbea33761a2bed3ace2a1c20bed17767c220dd4213caa47fe93e4e26c5ce'),
 ('public.admin_review_invitation_request(uuid,uuid,text,text,text)','4f25f37c8f7eb1e0a0c89d6bcf54108921710973fa38fe7f97289b171483b511')) x(sig,sha)),
 'promotion and all five October changed installed definitions have expected hashes');
SELECT is((SELECT bindings FROM promo13_baseline)->'acl',
 jsonb_build_object('public_anon',true,'public_authenticated',true,
  'private_schema_authenticated',true,'wrapper_authenticated',true,'wrapper_anon',false,
  'wrapper_service',false,'private_authenticated',false,'private_service',true,
  'allocation_write_authenticated',false,'addon_write_authenticated',false),
 'effective wrapper/private and ledger-write boundaries are exact');
SELECT is((SELECT graph FROM promo13_baseline),pg_temp.promo13_graph(),
 'fixture namespace starts from unchanged full graph');
SELECT is((SELECT count(*)::integer FROM auth.users WHERE id::text LIKE 'a1300001-%'),0,
 'auth fixture namespace absent');
SELECT is((SELECT count(*)::integer FROM public.listings WHERE id::text LIKE 'a1300002-%'),0,
 'listing fixture namespace absent');

INSERT INTO auth.users(id,email)
SELECT ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 't13promo-owner-'||n||'@example.test' FROM generate_series(1,5)n;
SELECT set_config('request.jwt.claim.sub','',true),
 set_config('request.jwt.claims','{"role":"service_role"}',true),
 set_config('request.jwt.claim.role','service_role',true);
SET LOCAL ROLE service_role;
SELECT public.complete_onboarding_role_for_user(
 ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'seller','seller')
FROM generate_series(1,5)n;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE user_id::text LIKE 'a1300001-%'),5,
 'normal auth and onboarding made five seller profiles');
SELECT is((SELECT count(*)::integer FROM public.profiles_public WHERE user_id::text LIKE 'a1300001-%'),5,
 'normal public-profile projection made five rows');
SELECT is((SELECT bool_and(private.authoritative_role(user_id)::text='seller' AND role::text='seller'
 AND participant_type::text='seller') FROM public.profiles WHERE user_id::text LIKE 'a1300001-%'),true,
 'all five fixture actors have genuine seller authority');

INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status)
SELECT ('a1300002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'T13 promotion current '||n,'T13PromoUnique',100000+n,80,'apartment','sale','active'
FROM generate_series(1,5)n;
INSERT INTO public.pricing_configs(key,label,audience,module,unit,currency,amount,is_active,metadata)
VALUES ('pro','T13 promotion current Pro','participant','user_subscription','monthly','EUR',29,true,
 jsonb_build_object('stripe_product_id','prod_t13promo_mixed'));
INSERT INTO public.billing_subscriptions(id,user_id,stripe_customer_id,stripe_subscription_id,
 stripe_product_id,stripe_price_id,plan_key,audience,status,current_period_start,current_period_end,runtime_mode,livemode)
VALUES ('a1300004-0000-4000-8000-000000000001','a1300001-0000-4000-8000-000000000002',
 'cus_t13promo_mixed','sub_t13promo_mixed','prod_t13promo_mixed','price_t13promo_mixed',
 'pro','participant','active',now()-interval '1 day',now()+interval '90 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
INSERT INTO public.addon_purchases(id,user_id,addon_key,module,audience,unit,checkout_mode,
 status,stripe_session_id,runtime_mode,livemode)
SELECT ('a1300003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE n WHEN 1 THEN 'featured_priority_bundle' WHEN 3 THEN 'featured_listing'
 ELSE 'priority_placement' END,'listings','participant','credit','payment','paid',
 'cs_t13promo_'||n,public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'
FROM generate_series(1,4)n;
SELECT is((SELECT jsonb_agg(jsonb_build_object('n',right(id::text,12),'key',addon_key,
 'granted',credits_granted,'consumed',credits_consumed,'refunded',credits_refunded) ORDER BY id)
 FROM public.addon_purchases WHERE id::text LIKE 'a1300003-%'),
 (SELECT jsonb_agg(jsonb_build_object('n',lpad(n::text,12,'0'),
 'key',CASE n WHEN 1 THEN 'featured_priority_bundle' WHEN 3 THEN 'featured_listing'
 ELSE 'priority_placement' END,'granted',1,'consumed',0,'refunded',0) ORDER BY n)
 FROM generate_series(1,4)n),
 'normal paid-ledger trigger grants one usable credit per purchase');
SELECT is(private.get_listing_promotion_plan_allowance(
 'a1300001-0000-4000-8000-000000000002','spotlight'),1,
 'mixed seller has one included current-cycle Spotlight');
SELECT is(private.get_listing_promotion_plan_allowance(
 'a1300001-0000-4000-8000-000000000002','priority'),0,
 'mixed seller has no included Priority');
SELECT is((SELECT id FROM private.current_listing_promotion_plan_subscription(
 'a1300001-0000-4000-8000-000000000002')),
 'a1300004-0000-4000-8000-000000000001'::uuid,
 'mixed seller paid plan is the canonical source before activation');
SELECT is((SELECT count(*)::integer FROM public.listing_promotion_allocations
 WHERE listing_id::text LIKE 'a1300002-%'),0,
 'normal fixture creation made no allocation');

-- Full fixture prestate: every old row must survive setup. Generated profile
-- IDs are identity bindings; all business fields are fixed by signup/onboarding.
CREATE TEMP TABLE promo13_g0 AS SELECT pg_temp.promo13_graph() graph;
CREATE TEMP TABLE promo13_expected_user (LIKE auth.users INCLUDING DEFAULTS);
INSERT INTO promo13_expected_user(id,email)
SELECT ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 't13promo-owner-'||n||'@example.test' FROM generate_series(1,5)n;
CREATE TEMP TABLE promo13_expected_profile (LIKE public.profiles INCLUDING DEFAULTS);
INSERT INTO promo13_expected_profile(id,user_id,role,participant_type,created_at,updated_at)
SELECT p.id,('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'seller','seller',now(),now()
FROM generate_series(1,5)n JOIN public.profiles p
 ON p.user_id=('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
CREATE TEMP TABLE promo13_expected_public_profile (LIKE public.profiles_public INCLUDING DEFAULTS);
INSERT INTO promo13_expected_public_profile(user_id,role,owner_participant_type)
SELECT user_id,'seller','seller' FROM promo13_expected_profile;
CREATE TEMP TABLE promo13_expected_listing (LIKE public.listings INCLUDING DEFAULTS);
INSERT INTO promo13_expected_listing(id,owner_id,title,city,price,sqm,property_type,listing_type,status)
SELECT ('a1300002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'T13 promotion current '||n,'T13PromoUnique',100000+n,80,'apartment','sale','active'
FROM generate_series(1,5)n;
UPDATE promo13_expected_listing SET location_search_text=
 public.expand_location_search_aliases(public.normalize_location_text(
 coalesce(title,'')||' '||coalesce(address,'')||' '||coalesce(city,'')||' '||
 coalesce(region,'')||' '||coalesce(postal_code,'')));
CREATE TEMP TABLE promo13_expected_pricing (LIKE public.pricing_configs INCLUDING DEFAULTS);
INSERT INTO promo13_expected_pricing(id,key,label,audience,module,unit,currency,amount,is_active,metadata)
SELECT c.id,'pro','T13 promotion current Pro','participant','user_subscription','monthly','EUR',29,true,
 jsonb_build_object('stripe_product_id','prod_t13promo_mixed')
FROM public.pricing_configs c WHERE c.key='pro';
CREATE TEMP TABLE promo13_expected_subscription (LIKE public.billing_subscriptions INCLUDING DEFAULTS);
INSERT INTO promo13_expected_subscription(id,user_id,stripe_customer_id,stripe_subscription_id,
 stripe_product_id,stripe_price_id,plan_key,audience,status,current_period_start,current_period_end,runtime_mode,livemode)
VALUES ('a1300004-0000-4000-8000-000000000001','a1300001-0000-4000-8000-000000000002',
 'cus_t13promo_mixed','sub_t13promo_mixed','prod_t13promo_mixed','price_t13promo_mixed',
 'pro','participant','active',now()-interval '1 day',now()+interval '90 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
CREATE TEMP TABLE promo13_expected_purchase (LIKE public.addon_purchases INCLUDING DEFAULTS);
INSERT INTO promo13_expected_purchase(id,user_id,addon_key,module,audience,unit,checkout_mode,
 status,stripe_session_id,credits_granted,runtime_mode,livemode)
SELECT ('a1300003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 CASE n WHEN 1 THEN 'featured_priority_bundle' WHEN 3 THEN 'featured_listing'
 ELSE 'priority_placement' END,'listings','participant','credit','payment','paid',
 'cs_t13promo_'||n,1,public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'
FROM generate_series(1,4)n;
SELECT is((SELECT graph FROM promo13_g0),
 (SELECT g.graph || jsonb_build_object(
  'users',g.graph->'users'||(SELECT jsonb_object_agg(id::text,to_jsonb(u)) FROM promo13_expected_user u),
  'profiles',g.graph->'profiles'||(SELECT jsonb_object_agg(user_id::text,to_jsonb(p)) FROM promo13_expected_profile p),
  'profiles_public',g.graph->'profiles_public'||(SELECT jsonb_object_agg(user_id::text,to_jsonb(p)) FROM promo13_expected_public_profile p),
  'listings',g.graph->'listings'||(SELECT jsonb_object_agg(id::text,to_jsonb(l)) FROM promo13_expected_listing l),
  'pricing',g.graph->'pricing'||(SELECT jsonb_object_agg(key,to_jsonb(c)) FROM promo13_expected_pricing c),
  'subscriptions',g.graph->'subscriptions'||(SELECT jsonb_object_agg(id::text,to_jsonb(s)) FROM promo13_expected_subscription s),
  'purchases',g.graph->'purchases'||(SELECT jsonb_object_agg(id::text,to_jsonb(a)) FROM promo13_expected_purchase a))
 FROM promo13_baseline g),
 'complete normal fixture graph equals literals, defaults and generated profile IDs');
SELECT is((SELECT graph->'users' FROM promo13_g0)
 - ARRAY(SELECT ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0')) FROM generate_series(1,5)n),
 (SELECT graph->'users' FROM promo13_baseline),
 'all pre-existing auth users remain identical');
SELECT is((SELECT graph->'profiles' FROM promo13_g0)
 - ARRAY(SELECT ('a1300001-0000-4000-8000-'||lpad(n::text,12,'0')) FROM generate_series(1,5)n),
 (SELECT graph->'profiles' FROM promo13_baseline),
 'all pre-existing profiles remain identical');
SELECT is((SELECT graph->'listings' FROM promo13_g0)
 - ARRAY(SELECT ('a1300002-0000-4000-8000-'||lpad(n::text,12,'0')) FROM generate_series(1,5)n),
 (SELECT graph->'listings' FROM promo13_baseline),
 'all pre-existing listings remain identical');
SELECT ok((SELECT bool_and((SELECT graph->k FROM promo13_g0)=(SELECT graph->k FROM promo13_baseline))
 FROM unnest(ARRAY['refunds','notifications','projects','images','catalogue_publications',
 'catalogue_current','catalogue_versions'])k),
 'normal setup preserves all nonfixture ancillary graphs');
SELECT is((SELECT count(*)::integer FROM public.billing_subscriptions WHERE id='a1300004-0000-4000-8000-000000000001'),1,
 'one mixed paid subscription fixture exists');

CREATE FUNCTION pg_temp.promo13_allocation(p_id uuid,p_listing uuid,p_owner uuid,p_type text,
 p_source text,p_subscription uuid,p_purchase uuid,p_key text) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT jsonb_build_object('id',p_id,'listing_id',p_listing,'owner_id',p_owner,
 'promotion_type',p_type,'source_type',p_source,'status','active',
 'billing_subscription_id',p_subscription,'addon_purchase_id',p_purchase,
 'request_key',p_key,'plan_cycle_start',CASE WHEN p_source='plan'
 THEN date_trunc('month',now() AT TIME ZONE 'UTC')::date ELSE NULL END,
 'starts_at',now(),'ends_at',now()+interval '30 days','revoked_at',NULL,
 'revoke_reason',NULL,'created_by',p_owner,'created_at',now(),'updated_at',now(),
 'listing_snapshot','{}'::jsonb,'owner_snapshot','{}'::jsonb)
$$;
CREATE FUNCTION pg_temp.promo13_expected_next(g jsonb,p_case integer) RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE o uuid:=('a1300001-0000-4000-8000-'||lpad(p_case::text,12,'0'))::uuid;
 l uuid:=('a1300002-0000-4000-8000-'||lpad(p_case::text,12,'0'))::uuid;
 a uuid:=('a1300003-0000-4000-8000-'||lpad(p_case::text,12,'0'))::uuid;
 k text:='t13promo-'||p_case;
 t text; aid uuid; src text; pid uuid; sid uuid; out_g jsonb:=g;
BEGIN
 FOR t IN SELECT unnest(CASE WHEN p_case IN (1,2) THEN ARRAY['spotlight','priority']
  WHEN p_case=3 THEN ARRAY['spotlight'] ELSE ARRAY['priority'] END) LOOP
  SELECT id INTO STRICT aid FROM public.listing_promotion_allocations
  WHERE listing_id=l AND promotion_type=t AND request_key=k;
  src:=CASE WHEN p_case=2 AND t='spotlight' THEN 'plan' ELSE 'addon' END;
  pid:=CASE WHEN src='addon' THEN a ELSE NULL END;
  sid:=CASE WHEN src='plan' THEN 'a1300004-0000-4000-8000-000000000001'::uuid ELSE NULL END;
  out_g:=jsonb_set(out_g,ARRAY['allocations',aid::text],
   pg_temp.promo13_allocation(aid,l,o,t,src,sid,pid,k),true);
 END LOOP;
 out_g:=jsonb_set(out_g,ARRAY['listings',l::text],g->'listings'->l::text ||
  jsonb_build_object('is_featured',p_case<>4,
   'featured_until',CASE WHEN p_case<>4 THEN to_jsonb(now()+interval '30 days') ELSE 'null'::jsonb END,
   'priority_placement',CASE WHEN p_case=3 THEN 0 ELSE 1 END,
   'priority_until',CASE WHEN p_case=3 THEN 'null'::jsonb ELSE to_jsonb(now()+interval '30 days') END,
   'updated_at',now()),true);
 out_g:=jsonb_set(out_g,ARRAY['purchases',a::text],g->'purchases'->a::text ||
  jsonb_build_object('credits_consumed',1,'updated_at',now()),true);
 RETURN out_g;
END $$;
CREATE TEMP TABLE promo13_expected AS SELECT graph FROM promo13_g0;

-- Each action uses the real browser role and public wrapper. psql variables
-- carry complete JSON returns across RESET ROLE without granting temp writes.
SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000001',true),
 set_config('request.jwt.claims','{"sub":"a1300001-0000-4000-8000-000000000001","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1300001-0000-4000-8000-000000000001'::uuid
 AND auth.jwt()->>'sub'='a1300001-0000-4000-8000-000000000001' AS actor_ok \gset
SELECT public.activate_listing_promotion('a1300002-0000-4000-8000-000000000001','bundle','t13promo-1') AS result \gset
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'bundle activation used real authenticated owner identity');
SELECT is(:'result'::jsonb,jsonb_build_object('listing_id','a1300002-0000-4000-8000-000000000001'::uuid,
 'request_key','t13promo-1','ends_at',now()+interval '30 days','spotlight',true,'priority',true),
 'paid bundle returns entire fresh-activation JSON');
UPDATE promo13_expected SET graph=pg_temp.promo13_expected_next(graph,1);
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_expected),
 'paid bundle adds exactly two full rows, consumes one credit, projects both, preserves entire graph');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'bundle caller context restored');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000002',true),
 set_config('request.jwt.claims','{"sub":"a1300001-0000-4000-8000-000000000002","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1300001-0000-4000-8000-000000000002'::uuid
 AND auth.jwt()->>'sub'='a1300001-0000-4000-8000-000000000002' AS actor_ok \gset
SELECT public.activate_listing_promotion('a1300002-0000-4000-8000-000000000002','bundle','t13promo-2') AS result \gset
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'mixed activation used real authenticated owner identity');
SELECT is(:'result'::jsonb,jsonb_build_object('listing_id','a1300002-0000-4000-8000-000000000002'::uuid,
 'request_key','t13promo-2','ends_at',now()+interval '30 days','spotlight',true,'priority',true),
 'mixed bundle returns entire fresh-activation JSON');
UPDATE promo13_expected SET graph=pg_temp.promo13_expected_next(graph,2);
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_expected),
 'mixed bundle adds exact canonical plan and paid Priority rows, one credit and full graph');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'mixed caller context restored');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000003',true),
 set_config('request.jwt.claims','{"sub":"a1300001-0000-4000-8000-000000000003","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1300001-0000-4000-8000-000000000003'::uuid
 AND auth.jwt()->>'sub'='a1300001-0000-4000-8000-000000000003' AS actor_ok \gset
SELECT public.activate_listing_promotion('a1300002-0000-4000-8000-000000000003','spotlight','t13promo-3') AS result \gset
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'single Spotlight activation used real authenticated owner identity');
SELECT is(:'result'::jsonb,jsonb_build_object('listing_id','a1300002-0000-4000-8000-000000000003'::uuid,
 'request_key','t13promo-3','ends_at',now()+interval '30 days','spotlight',true,'priority',false),
 'paid Spotlight returns entire fresh-activation JSON');
UPDATE promo13_expected SET graph=pg_temp.promo13_expected_next(graph,3);
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_expected),
 'paid Spotlight adds one full row, one credit, exact projection and full graph');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'Spotlight caller context restored');

SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000004',true),
 set_config('request.jwt.claims','{"sub":"a1300001-0000-4000-8000-000000000004","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1300001-0000-4000-8000-000000000004'::uuid
 AND auth.jwt()->>'sub'='a1300001-0000-4000-8000-000000000004' AS actor_ok \gset
SELECT public.activate_listing_promotion('a1300002-0000-4000-8000-000000000004','priority','t13promo-4') AS result \gset
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'single Priority activation used real authenticated owner identity');
SELECT is(:'result'::jsonb,jsonb_build_object('listing_id','a1300002-0000-4000-8000-000000000004'::uuid,
 'request_key','t13promo-4','ends_at',now()+interval '30 days','spotlight',false,'priority',true),
 'paid Priority returns entire fresh-activation JSON');
UPDATE promo13_expected SET graph=pg_temp.promo13_expected_next(graph,4);
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_expected),
 'paid Priority adds one full row, one credit, exact projection and full graph');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'Priority caller context restored');

CREATE TEMP TABLE promo13_before_denial AS SELECT pg_temp.promo13_graph() graph;
SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000005',true),
 set_config('request.jwt.claims','{"sub":"a1300001-0000-4000-8000-000000000005","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1300001-0000-4000-8000-000000000005'::uuid
 AND auth.jwt()->>'sub'='a1300001-0000-4000-8000-000000000005' AS actor_ok \gset
SELECT throws_ok($$SELECT public.activate_listing_promotion(
 'a1300002-0000-4000-8000-000000000001','spotlight','t13promo-other-owner')$$,
 '42501','listing_promotion_forbidden','unrelated authenticated owner denied by public wrapper');
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'unrelated-owner denial used its own authenticated identity');
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_before_denial),
 'unrelated-owner denial preserves its complete own prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'unrelated-owner caller context restored');

TRUNCATE promo13_before_denial;
INSERT INTO promo13_before_denial SELECT pg_temp.promo13_graph();
SELECT set_config('request.jwt.claim.sub','a1300001-0000-4000-8000-000000000005',true),
 set_config('request.jwt.claims','{"sub":"a1300001-0000-4000-8000-000000000005","role":"authenticated"}',true),
 set_config('request.jwt.claim.role','authenticated',true);
SET LOCAL ROLE authenticated;
SELECT current_user='authenticated' AND auth.uid()='a1300001-0000-4000-8000-000000000005'::uuid
 AND auth.jwt()->>'sub'='a1300001-0000-4000-8000-000000000005' AS actor_ok \gset
SELECT throws_ok($$SELECT public.activate_listing_promotion(
 'a1300002-0000-4000-8000-000000000005','priority','t13promo-no-priority')$$,
 '42501','priority_entitlement_required','free owner without Priority credit denied');
RESET ROLE;
SELECT ok(:'actor_ok'::boolean,'missing-credit denial used its own authenticated identity');
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_before_denial),
 'missing-credit denial preserves its complete own prestate');
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claims','{}',true),
 set_config('request.jwt.claim.role','',true);
SELECT ok(current_user='postgres' AND auth.uid() IS NULL,'missing-credit caller context restored');
SELECT is(pg_temp.promo13_graph(),(SELECT graph FROM promo13_expected),
 'all four success graphs remain exact after both denials');
SELECT * FROM finish();
ROLLBACK;

SELECT 'PROMO13_SETTING_DIFF',coalesce(b.key,c.key),b.value AS pre,c.value AS post
FROM jsonb_each_text((SELECT settings FROM promo13_baseline)) b
FULL JOIN jsonb_each_text((SELECT jsonb_object_agg(name,setting) FROM pg_settings)) c USING (key)
WHERE b.value IS DISTINCT FROM c.value;

DO $$ DECLARE b record; now_seqs jsonb; now_settings jsonb; BEGIN
 SELECT * INTO STRICT b FROM promo13_baseline;
 IF b.pid IS DISTINCT FROM pg_backend_pid() OR b.db_role IS DISTINCT FROM current_user
 OR b.session_role IS DISTINCT FROM session_user
 OR b.marker IS DISTINCT FROM current_setting('maiprop.test_disposable_database',true)
 OR b.origin IS DISTINCT FROM current_setting('session_replication_role')
 OR b.actor IS DISTINCT FROM auth.uid() OR b.jwt IS DISTINCT FROM auth.jwt()
 OR NULLIF(b.sub_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.sub',true),'')
 OR NULLIF(b.claims,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claims',true),'')
 OR NULLIF(b.role_claim,'') IS DISTINCT FROM NULLIF(current_setting('request.jwt.claim.role',true),'')
 THEN RAISE EXCEPTION 'promotion same-backend role/JWT/marker restoration failed'; END IF;
 IF b.bindings IS DISTINCT FROM pg_temp.promo13_bindings()
 THEN RAISE EXCEPTION 'promotion installed binding or ACL changed'; END IF;
 IF b.graph IS DISTINCT FROM pg_temp.promo13_graph()
 THEN RAISE EXCEPTION 'promotion rollback full graph differs'; END IF;
 SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) INTO now_seqs FROM pg_sequences;
 IF b.seqs IS DISTINCT FROM now_seqs THEN RAISE EXCEPTION 'promotion unexpected named sequence consumption'; END IF;
 SELECT jsonb_object_agg(name,setting) INTO now_settings FROM pg_settings;
 IF b.settings IS DISTINCT FROM now_settings THEN RAISE EXCEPTION 'promotion session settings changed'; END IF;
 IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema()
  AND relname LIKE 'promo13_%' AND relname<>'promo13_baseline')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema()
  AND proname LIKE 'promo13_%' AND proname NOT IN ('promo13_bindings','promo13_graph'))
 THEN RAISE EXCEPTION 'promotion suite temp residue remains'; END IF;
 IF EXISTS (SELECT 1 FROM auth.users WHERE id::text LIKE 'a1300001-%')
 OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id::text LIKE 'a1300001-%')
 OR EXISTS (SELECT 1 FROM public.profiles_public WHERE user_id::text LIKE 'a1300001-%')
 OR EXISTS (SELECT 1 FROM public.listings WHERE id::text LIKE 'a1300002-%')
 OR EXISTS (SELECT 1 FROM public.billing_subscriptions WHERE id::text LIKE 'a1300004-%')
 OR EXISTS (SELECT 1 FROM public.addon_purchases WHERE id::text LIKE 'a1300003-%')
 OR EXISTS (SELECT 1 FROM public.listing_promotion_allocations WHERE listing_id::text LIKE 'a1300002-%')
 OR EXISTS (SELECT 1 FROM public.notifications WHERE user_id::text LIKE 'a1300001-%')
 OR (SELECT count(*) FROM pg_stat_activity WHERE datname='maiprop_t12q_20260930_source')<>0
 OR (SELECT count(*) FROM pg_prepared_xacts WHERE database IN (current_database(),'maiprop_t12q_20260930_source'))<>0
 THEN RAISE EXCEPTION 'promotion fixture/source residue remains'; END IF;
END $$;
SELECT 'PROMO13_POST',pg_backend_pid(),current_user,session_user,
 current_setting('maiprop.test_disposable_database',true),current_setting('session_replication_role'),
 auth.uid(),auth.jwt(),current_setting('request.jwt.claim.sub',true),
 current_setting('request.jwt.claims',true),current_setting('request.jwt.claim.role',true),
 pg_temp.promo13_bindings(),
 (SELECT jsonb_object_agg(schemaname||'.'||sequencename,to_jsonb(last_value)) FROM pg_sequences),
 encode(digest((SELECT jsonb_object_agg(name,setting) FROM pg_settings)::text,'sha256'),'hex'),
 encode(digest(pg_temp.promo13_graph()::text,'sha256'),'hex');
DROP TABLE promo13_baseline;
DROP FUNCTION pg_temp.promo13_bindings();
DROP FUNCTION pg_temp.promo13_graph();
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class WHERE relnamespace=pg_my_temp_schema() AND relname LIKE 'promo13_%')
 OR EXISTS (SELECT 1 FROM pg_proc WHERE pronamespace=pg_my_temp_schema() AND proname LIKE 'promo13_%')
 THEN RAISE EXCEPTION 'promotion cleanup left temp objects'; END IF; END $$;
SELECT 'PROMO13_SAME_BACKEND_CLEAN';
