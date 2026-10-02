-- D2 subscription lifecycle: actual roles, normal triggers, synthetic rollback.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgtap') THEN
    CREATE EXTENSION pgtap;
  END IF;
END $$;
SELECT plan(129);
SELECT is(current_setting('session_replication_role'), 'origin', 'lifecycle uses normal triggers');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton), 'role switch rollout remains closed');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users(id,email) VALUES
 ('d2150001-0000-4000-8000-000000000001','d2-lapse-seller@example.test'),
 ('d2150001-0000-4000-8000-000000000002','d2-lapse-buyer@example.test'),
 ('d2150001-0000-4000-8000-000000000003','d2-investor-status@example.test'),
 ('d2150001-0000-4000-8000-000000000004','d2-investor-trial@example.test'),
 ('d2150001-0000-4000-8000-000000000005','d2-investor-actor@example.test'),
 ('d2150001-0000-4000-8000-000000000006','d2-opposite-runtime@example.test');
SET LOCAL ROLE service_role;
SELECT is(current_user, 'service_role', 'fixture onboarding uses actual service role');
SELECT is(auth.uid(), NULL::uuid, 'fixture service role has no subject');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000001','seller','seller');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000002','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000003','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000004','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000005','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000006','buyer','buyer');
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);
INSERT INTO public.pricing_configs(key,label,audience,module,unit,amount,is_active,metadata)
VALUES('d2_lifecycle_monthly','D2 lifecycle monthly','participant','user_subscription','monthly',1,true,
 '{"stripe_product_id":"prod_d2_lifecycle","stripe_price_id_monthly":"price_d2_lifecycle"}'::jsonb);
INSERT INTO public.billing_subscriptions
 (user_id,stripe_customer_id,stripe_subscription_id,stripe_product_id,stripe_price_id,plan_key,audience,
  status,billing_cycle,current_period_end,runtime_mode,livemode,state_source,state_observed_at)
VALUES('d2150001-0000-4000-8000-000000000001','cus_d2_lifecycle','sub_d2_lifecycle',
 'prod_d2_lifecycle','price_d2_lifecycle','d2_lifecycle_monthly','participant','active','monthly',
 now()+interval '30 days',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live',
 'webhook_canonical',now());
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000001'),true,'seller starts with current participant access');
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','terminal billing update uses actual service role');
UPDATE public.billing_subscriptions SET status='canceled',state_observed_at=now()+interval '1 second'
WHERE stripe_subscription_id='sub_d2_lifecycle';
RESET ROLE;
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000001'),false,'terminal participant state removes seller Pro access');
SELECT is(public.get_listing_limit('seller',false),2,'free seller listing limit is two');
INSERT INTO public.listings(id,owner_id,title,city,price,sqm,property_type,listing_type,status,
 is_featured,priority_placement,created_at,updated_at)
SELECT ('d2150002-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'd2150001-0000-4000-8000-000000000001','D2 seller listing '||n,'Athens',100000,80,
 'apartment','sale',CASE WHEN n=5 THEN 'paused' ELSE 'active' END::public.listing_status,
 n=1,CASE WHEN n=2 THEN 1 ELSE 0 END,
 '2026-09-01T00:00:00Z'::timestamptz+n*interval '1 day',
 '2026-09-01T00:00:00Z'::timestamptz+n*interval '1 day'
FROM generate_series(1,5) n;
INSERT INTO public.saved_searches(id,user_id,name,filters,email_alerts,created_at,updated_at)
SELECT ('d2150003-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'd2150001-0000-4000-8000-000000000002','D2 search '||n,jsonb_build_object('n',n),n<4,
 '2026-09-01T00:00:00Z'::timestamptz+n*interval '1 day',
 '2026-09-01T00:00:00Z'::timestamptz+n*interval '1 day'
FROM generate_series(1,4) n;
INSERT INTO public.auction_alerts(id,user_id,city,active,created_at)
SELECT ('d2150004-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'd2150001-0000-4000-8000-000000000002','Athens',n<4,
 '2026-09-01T00:00:00Z'::timestamptz+n*interval '1 day'
FROM generate_series(1,4) n;
SELECT is(public.get_search_alert_limit('d2150001-0000-4000-8000-000000000002'),1,'free buyer search alert cap is one');
SELECT is(public.get_auction_alert_limit('d2150001-0000-4000-8000-000000000002'),1,'free buyer auction alert cap is one');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
 AND tgname IN ('profiles_guard_admin_and_role_trg','trg_guard_sensitive_profile_columns')
 AND tgenabled='O'),2::bigint,'both installed profile role and sensitive guards start enabled');
CREATE TEMP VIEW d2_lifecycle_state AS SELECT jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles p WHERE p.user_id::text LIKE 'd2150001-%'),
 'profiles_public',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles_public p WHERE p.user_id::text LIKE 'd2150001-%'),
 'listings',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.listings l WHERE l.owner_id='d2150001-0000-4000-8000-000000000001'),
 'searches',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.saved_searches s WHERE s.user_id='d2150001-0000-4000-8000-000000000002'),
 'alerts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.auction_alerts a WHERE a.user_id='d2150001-0000-4000-8000-000000000002'),
 'billing',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.billing_subscriptions b WHERE b.user_id::text LIKE 'd2150001-%'),
 'investor',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.investor_subscriptions i WHERE i.user_id::text LIKE 'd2150001-%'),
 'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.notifications n WHERE n.user_id::text LIKE 'd2150001-%')) AS state;
-- Build expected full-state snapshots by changing only one named member.
CREATE FUNCTION pg_temp.d2_patch_member(p_state jsonb,p_array text,p_key text,p_value text,p_delta jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_set(p_state,ARRAY[p_array],
    (SELECT jsonb_agg(CASE WHEN member->>p_key=p_value THEN member||p_delta ELSE member END ORDER BY ordinal)
     FROM jsonb_array_elements(p_state->p_array) WITH ORDINALITY AS members(member,ordinal)))
$$;
-- The generated notice ID/time come from the inserted row; its payload and total count are asserted separately.
CREATE FUNCTION pg_temp.d2_append_notice(p_state jsonb,p_notice jsonb)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_set(p_state,'{notifications}',
    (SELECT jsonb_agg(member ORDER BY member->>'id') FROM (
       SELECT member FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_state->'notifications')='array'
         THEN p_state->'notifications' ELSE '[]'::jsonb END) AS prior(member)
       UNION ALL SELECT p_notice) AS expected(member)))
$$;
CREATE TEMP TABLE d2_lifecycle_before AS SELECT state FROM d2_lifecycle_state;
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'force-Pro setup uses service without subject');
UPDATE public.profiles SET force_pro_access=true WHERE user_id='d2150001-0000-4000-8000-000000000001';
SELECT is((SELECT force_pro_access FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000001'),
 true,'admitted service update enables seller Pro override');
RESET ROLE;
CREATE TEMP TABLE d2_force_pro_before AS SELECT state FROM d2_lifecycle_state;
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000001'),
 '{"skipped":true,"reason":"alternate_entitlement_active"}'::jsonb,
 'force-Pro override skips lapse with four active listings');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_force_pro_before),
 'force-Pro skip preserves all over-limit rows and notifications');
SET LOCAL ROLE service_role;
UPDATE public.profiles SET force_pro_access=false WHERE user_id='d2150001-0000-4000-8000-000000000001';
RESET ROLE;
DROP TABLE d2_lifecycle_before;
CREATE TEMP TABLE d2_lifecycle_before AS SELECT state FROM d2_lifecycle_state;
CREATE TEMP TABLE d2_listing_before AS
 SELECT id,to_jsonb(l) AS row FROM public.listings l
 WHERE owner_id='d2150001-0000-4000-8000-000000000001';
CREATE TEMP TABLE d2_search_before AS
 SELECT id,to_jsonb(s) AS row FROM public.saved_searches s
 WHERE user_id='d2150001-0000-4000-8000-000000000002';
CREATE TEMP TABLE d2_auction_before AS
 SELECT id,to_jsonb(a) AS row FROM public.auction_alerts a
 WHERE user_id='d2150001-0000-4000-8000-000000000002';
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000099'),
 '{"skipped":true,"reason":"profile_not_found"}'::jsonb,'missing profile is skipped');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_lifecycle_before),'missing profile call changes no persisted state');
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','lapse RPC uses actual service role');
SELECT is(auth.uid(),NULL::uuid,'lapse RPC has no subject');
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000001'),
 '{"skipped":false,"paused_listings":2,"disabled_search_alerts":0,"disabled_auction_alerts":0}'::jsonb,
 'seller lapse pauses exactly two excess listings');
RESET ROLE;
SELECT is((SELECT string_agg(right(id::text,1)||':'||status::text,',' ORDER BY id) FROM public.listings
 WHERE owner_id='d2150001-0000-4000-8000-000000000001'),
 '1:active,2:active,3:paused,4:paused,5:paused','seller keeps ranked top two and all five listing rows');
SELECT is((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.listings l
 WHERE l.owner_id='d2150001-0000-4000-8000-000000000001'),
 (SELECT jsonb_agg(CASE WHEN right(id::text,1) IN ('3','4')
   THEN row || jsonb_build_object('status','paused','updated_at',now())
   ELSE row END ORDER BY id) FROM d2_listing_before),
 'first seller lapse preserves every listing field except intended status and timestamp');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000001'
 AND title='Subscription access updated' AND type='billing' AND link='/dashboard/billing' AND read=false
 AND body='2 listing(s) were paused to match your current plan.'),1::bigint,'seller gets exact one listing notice');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000001'),
 1::bigint,'seller has no extra nonmatching notice');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_append_notice(
   pg_temp.d2_patch_member(
     pg_temp.d2_patch_member((SELECT state FROM d2_lifecycle_before),'listings','id',
       'd2150002-0000-4000-8000-000000000003',jsonb_build_object('status','paused','updated_at',now())),
     'listings','id','d2150002-0000-4000-8000-000000000004',
       jsonb_build_object('status','paused','updated_at',now())),
   (SELECT to_jsonb(n) FROM public.notifications n
    WHERE n.user_id='d2150001-0000-4000-8000-000000000001')),
 'first seller lapse equals exact full-state delta and one notice');
CREATE TEMP TABLE d2_seller_after AS SELECT state FROM d2_lifecycle_state;
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000001'),
 '{"skipped":false,"paused_listings":0,"disabled_search_alerts":0,"disabled_auction_alerts":0}'::jsonb,
 'repeated seller lapse changes zero rows');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_seller_after),'repeat leaves full seller and other scoped state unchanged');
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000002'),
 '{"skipped":false,"paused_listings":0,"disabled_search_alerts":2,"disabled_auction_alerts":2}'::jsonb,
 'buyer lapse disables exactly two of each paid alert');
RESET ROLE;
SELECT is((SELECT string_agg(right(id::text,1)||':'||email_alerts::text,',' ORDER BY id) FROM public.saved_searches
 WHERE user_id='d2150001-0000-4000-8000-000000000002'),
 '1:false,2:false,3:true,4:false','buyer keeps highest ranked search alert and all four searches');
SELECT is((SELECT string_agg(right(id::text,1)||':'||active::text,',' ORDER BY id) FROM public.auction_alerts
 WHERE user_id='d2150001-0000-4000-8000-000000000002'),
 '1:false,2:false,3:true,4:false','buyer keeps highest ranked auction alert and all four alerts');
SELECT is((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.saved_searches s
 WHERE s.user_id='d2150001-0000-4000-8000-000000000002'),
 (SELECT jsonb_agg(CASE WHEN right(id::text,1) IN ('1','2')
   THEN row || jsonb_build_object('email_alerts',false,'updated_at',now())
   ELSE row END ORDER BY id) FROM d2_search_before),
 'first buyer lapse preserves every saved-search field except intended alert and timestamp');
SELECT is((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.auction_alerts a
 WHERE a.user_id='d2150001-0000-4000-8000-000000000002'),
 (SELECT jsonb_agg(CASE WHEN right(id::text,1) IN ('1','2')
   THEN row || jsonb_build_object('active',false)
   ELSE row END ORDER BY id) FROM d2_auction_before),
 'first buyer lapse preserves every auction-alert field except intended active flag');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000002'
 AND title='Subscription access updated' AND type='billing' AND link='/dashboard/billing' AND read=false
 AND body='2 saved-search email alert(s) were turned off. 2 auction alert(s) were turned off.'),
 1::bigint,'buyer gets exact one combined notice');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000002'),
 1::bigint,'buyer has no extra nonmatching notice');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_append_notice(
   pg_temp.d2_patch_member(pg_temp.d2_patch_member(
     pg_temp.d2_patch_member(pg_temp.d2_patch_member((SELECT state FROM d2_seller_after),
       'searches','id','d2150003-0000-4000-8000-000000000001',
       jsonb_build_object('email_alerts',false,'updated_at',now())),
       'searches','id','d2150003-0000-4000-8000-000000000002',
       jsonb_build_object('email_alerts',false,'updated_at',now())),
       'alerts','id','d2150004-0000-4000-8000-000000000001',jsonb_build_object('active',false)),
       'alerts','id','d2150004-0000-4000-8000-000000000002',jsonb_build_object('active',false)),
   (SELECT to_jsonb(n) FROM public.notifications n
    WHERE n.user_id='d2150001-0000-4000-8000-000000000002')),
 'first buyer lapse preserves prior seller notice and equals exact full-state delta');
CREATE TEMP TABLE d2_buyer_after AS SELECT state FROM d2_lifecycle_state;
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000002'),
 '{"skipped":false,"paused_listings":0,"disabled_search_alerts":0,"disabled_auction_alerts":0}'::jsonb,
 'repeated buyer lapse changes zero rows');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_buyer_after),'repeat preserves all buyer rows and notices');
SET LOCAL ROLE anon;
SELECT throws_ok($q$SELECT public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000001')$q$,
 '42501',NULL,'anon cannot invoke lapse controls');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_buyer_after),'anon denial preserves full state');
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$SELECT public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000001')$q$,
 '42501',NULL,'authenticated cannot invoke lapse controls');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_buyer_after),'authenticated denial preserves full state');

SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','opposite-runtime investor setup uses actual service role');
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d2150001-0000-4000-8000-000000000006','private','active',now()+interval '30 days',
 CASE public.current_billing_runtime_mode() WHEN 'live' THEN 'test' ELSE 'live' END,
 public.current_billing_runtime_mode()<>'live');
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles
 WHERE user_id='d2150001-0000-4000-8000-000000000006'),
 'investor|investor','opposite-runtime row still maps approved investor role');
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000006'),false,
 'opposite-runtime investor row grants no current entitlement');
CREATE TEMP TABLE d2_opposite_before AS SELECT state FROM d2_lifecycle_state;
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000006'),
 '{"skipped":false,"paused_listings":0,"disabled_search_alerts":0,"disabled_auction_alerts":0}'::jsonb,
 'opposite-runtime investor is not an alternate-entitlement skip');
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_opposite_before),
 'opposite-runtime no-op lapse preserves all scoped rows and notices');

-- Pending payment does not activate role or send an UPDATE-only status notice.
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','investor setup uses actual service role');
INSERT INTO public.billing_subscriptions
 (user_id,stripe_customer_id,stripe_subscription_id,stripe_product_id,stripe_price_id,plan_key,audience,
  status,billing_cycle,runtime_mode,livemode,state_source,state_observed_at)
VALUES('d2150001-0000-4000-8000-000000000003','cus_d2_investor_terminal','sub_d2_investor_terminal',
 'prod_d2_lifecycle','price_d2_lifecycle','d2_lifecycle_monthly','participant','canceled','monthly',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live','webhook_canonical',now());
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d2150001-0000-4000-8000-000000000003','private','pending_payment',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d2150001-0000-4000-8000-000000000004','institutional','pending_payment',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'buyer|buyer','pending investor row leaves buyer role unchanged');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 0::bigint,'pending insert sends no investor status notice');
CREATE TEMP TABLE d2_pending_before AS SELECT state FROM d2_lifecycle_state;
CREATE TEMP TABLE d2_pending_profile_before AS SELECT ctid AS row_ctid,to_jsonb(p) AS row FROM public.profiles p
 WHERE user_id='d2150001-0000-4000-8000-000000000004';
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','pending tier update uses actual service role');
UPDATE public.investor_subscriptions SET tier='developer'
 WHERE user_id='d2150001-0000-4000-8000-000000000004';
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member((SELECT state FROM d2_pending_before),'investor','user_id',
   'd2150001-0000-4000-8000-000000000004',jsonb_build_object('tier','developer','updated_at',now())),
 'pending tier update equals exact full-state delta');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s
 WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT (SELECT value FROM jsonb_array_elements(state->'investor') value
          WHERE value->>'user_id'='d2150001-0000-4000-8000-000000000004')
         || jsonb_build_object('tier','developer','updated_at',now()) FROM d2_pending_before),
 'pending tier update changes only subscription tier and timestamp');
SELECT is((SELECT ctid::text||'|'||to_jsonb(p)::text FROM public.profiles p
 WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT row_ctid::text||'|'||row::text FROM d2_pending_profile_before),
 'pending tier update does not write profile tuple');
SELECT is((SELECT tier FROM public.investor_subscriptions
 WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 'developer','pending tier update persists the requested tier');
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET tier='institutional'
 WHERE user_id='d2150001-0000-4000-8000-000000000004';
RESET ROLE;
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member((SELECT state FROM d2_pending_before),'investor','user_id',
   'd2150001-0000-4000-8000-000000000004',jsonb_build_object('updated_at',now())),
 'restored pending tier equals exact full-state delta');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s
 WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT value || jsonb_build_object('updated_at',now())
  FROM d2_pending_before, jsonb_array_elements(state->'investor') value
  WHERE value->>'user_id'='d2150001-0000-4000-8000-000000000004'),
 'restored pending tier preserves complete subscription content');
CREATE TEMP TABLE d2_activation_before AS SELECT
 (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS profile_row,
 (SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS public_row,
 (SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003') AS subscription_row,
 (SELECT state FROM d2_lifecycle_state) AS state;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'payment activation runs as service without subject');
UPDATE public.investor_subscriptions SET status='active' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'investor|investor','activation promotes role and participant type');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_row || jsonb_build_object('role','investor','participant_type','investor','updated_at',now())
  FROM d2_activation_before),'activation changes exactly intended profile fields');
SELECT is((SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT public_row || jsonb_build_object('role','investor','owner_participant_type',NULL)
  FROM d2_activation_before),'activation updates exact public profile projection');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT subscription_row || jsonb_build_object('status','active','updated_at',now())
  FROM d2_activation_before),'activation changes only subscription status and timestamp');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'
 AND title='Investor access active' AND body='Your investor access is active.' AND type='subscription'
 AND link='/investor-dashboard' AND read=false),1::bigint,'service activation sends exact access notice');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'activation creates no extra nonmatching notice');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_append_notice(
   pg_temp.d2_patch_member(pg_temp.d2_patch_member(
     pg_temp.d2_patch_member((SELECT state FROM d2_activation_before),'profiles','user_id',
       'd2150001-0000-4000-8000-000000000003',
       jsonb_build_object('role','investor','participant_type','investor','updated_at',now())),
     'profiles_public','user_id','d2150001-0000-4000-8000-000000000003',
       jsonb_build_object('role','investor','owner_participant_type',NULL)),
     'investor','user_id','d2150001-0000-4000-8000-000000000003',
       jsonb_build_object('status','active','updated_at',now())),
   (SELECT to_jsonb(n) FROM public.notifications n
    WHERE n.user_id='d2150001-0000-4000-8000-000000000003')),
 'activation equals exact full-state delta with prior rows preserved');
CREATE TEMP TABLE d2_trial_before AS SELECT
 (SELECT ctid FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS profile_ctid,
 (SELECT state FROM d2_lifecycle_state) AS state;
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','trial and tier transitions use actual service role');
UPDATE public.investor_subscriptions SET status='trial' WHERE user_id='d2150001-0000-4000-8000-000000000003';
UPDATE public.investor_subscriptions SET status='trial' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'active to trial and same-status repeat send no notice');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member((SELECT state FROM d2_trial_before),'investor','user_id',
   'd2150001-0000-4000-8000-000000000003',jsonb_build_object('status','trial','updated_at',now())),
 'active-to-trial and repeat equal exact full-state delta');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s
 WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT value || jsonb_build_object('status','trial','updated_at',now())
  FROM d2_trial_before, jsonb_array_elements(state->'investor') value
  WHERE value->>'user_id'='d2150001-0000-4000-8000-000000000003'),
 'trial and same-status repeat change only subscription status and timestamp');
SELECT is((SELECT ctid::text FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_ctid::text FROM d2_trial_before),
 'active-to-trial and repeat do not write profile tuple');
CREATE TEMP TABLE d2_tier_before AS SELECT
 (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS profile_row,
 (SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS public_row,
 (SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003') AS subscription_row,
 (SELECT state FROM d2_lifecycle_state) AS state;
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET tier='institutional' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'institutional|institutional','active tier change synchronizes institutional role');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_row || jsonb_build_object('role','institutional','participant_type','institutional','updated_at',now())
  FROM d2_tier_before),'institutional tier changes exactly intended profile fields');
SELECT is((SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT public_row || jsonb_build_object('role','institutional','owner_participant_type',NULL)
  FROM d2_tier_before),'institutional tier changes exact public profile projection');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT subscription_row || jsonb_build_object('tier','institutional','updated_at',now())
  FROM d2_tier_before),'institutional tier changes only subscription tier and timestamp');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'tier-only update sends no status notice');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member(pg_temp.d2_patch_member(
   pg_temp.d2_patch_member((SELECT state FROM d2_tier_before),'profiles','user_id',
     'd2150001-0000-4000-8000-000000000003',
     jsonb_build_object('role','institutional','participant_type','institutional','updated_at',now())),
   'profiles_public','user_id','d2150001-0000-4000-8000-000000000003',
     jsonb_build_object('role','institutional','owner_participant_type',NULL)),
   'investor','user_id','d2150001-0000-4000-8000-000000000003',
     jsonb_build_object('tier','institutional','updated_at',now())),
 'institutional tier equals exact full-state delta');
TRUNCATE d2_tier_before;
INSERT INTO d2_tier_before SELECT
 (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT state FROM d2_lifecycle_state);
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET tier='developer' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'developer|developer','active developer tier synchronizes role independently of investor Pro');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_row || jsonb_build_object('role','developer','participant_type','developer','updated_at',now())
  FROM d2_tier_before),'developer tier changes exactly intended profile fields');
SELECT is((SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT public_row || jsonb_build_object('role','developer','owner_participant_type','agent')
  FROM d2_tier_before),'developer tier changes exact public profile projection');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT subscription_row || jsonb_build_object('tier','developer','updated_at',now())
  FROM d2_tier_before),'developer tier changes only subscription tier and timestamp');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member(pg_temp.d2_patch_member(
   pg_temp.d2_patch_member((SELECT state FROM d2_tier_before),'profiles','user_id',
     'd2150001-0000-4000-8000-000000000003',
     jsonb_build_object('role','developer','participant_type','developer','updated_at',now())),
   'profiles_public','user_id','d2150001-0000-4000-8000-000000000003',
     jsonb_build_object('role','developer','owner_participant_type','agent')),
   'investor','user_id','d2150001-0000-4000-8000-000000000003',
     jsonb_build_object('tier','developer','updated_at',now())),
 'developer tier equals exact full-state delta');
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000003'),false,
 'developer tier alone does not grant investor audience entitlement');
TRUNCATE d2_tier_before;
INSERT INTO d2_tier_before SELECT
 (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT state FROM d2_lifecycle_state);
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET tier='private' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_row || jsonb_build_object('role','investor','participant_type','investor','updated_at',now())
  FROM d2_tier_before),'return to private tier changes exactly intended profile fields');
SELECT is((SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT public_row || jsonb_build_object('role','investor','owner_participant_type',NULL)
  FROM d2_tier_before),'return to private tier changes exact public projection');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT subscription_row || jsonb_build_object('tier','private','updated_at',now())
  FROM d2_tier_before),'return to private tier changes only subscription tier and timestamp');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member(pg_temp.d2_patch_member(
   pg_temp.d2_patch_member((SELECT state FROM d2_tier_before),'profiles','user_id',
     'd2150001-0000-4000-8000-000000000003',
     jsonb_build_object('role','investor','participant_type','investor','updated_at',now())),
   'profiles_public','user_id','d2150001-0000-4000-8000-000000000003',
     jsonb_build_object('role','investor','owner_participant_type',NULL)),
   'investor','user_id','d2150001-0000-4000-8000-000000000003',
     jsonb_build_object('tier','private','updated_at',now())),
 'return to private tier equals exact full-state delta');
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000003'),true,
 'matching active investor audience grants independent entitlement');
SELECT is((SELECT status FROM public.billing_subscriptions
 WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'canceled','investor Pro is independent of terminal participant billing');
CREATE TEMP TABLE d2_investor_skip_before AS SELECT state FROM d2_lifecycle_state;
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000003'),
 '{"skipped":true,"reason":"alternate_entitlement_active"}'::jsonb,
 'independent investor entitlement skips lapse controls');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'alternate entitlement does not send lapse notice');
SELECT is((SELECT state FROM d2_lifecycle_state),(SELECT state FROM d2_investor_skip_before),
 'investor entitlement skip preserves complete scoped persisted state');
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','investor-mode setup uses actual service role');
SELECT is(auth.uid(),NULL::uuid,'investor-mode setup has no subject');
UPDATE public.profiles SET investor_mode=true WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT investor_mode FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 true,'admitted profile update enables investor mode');
CREATE TEMP TABLE d2_cancel_before AS SELECT
 (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS profile_row,
 (SELECT ctid FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS profile_ctid,
 (SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS public_row,
 (SELECT ctid FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS public_ctid,
 (SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003') AS subscription_row,
 (SELECT state FROM d2_lifecycle_state) AS state;
SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"d2150001-0000-4000-8000-000000000005"}',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),'d2150001-0000-4000-8000-000000000005'::uuid,'distinct actor claim is active for terminal notice');
SELECT is(current_user,'service_role','distinct-actor cancellation uses actual service role');
UPDATE public.investor_subscriptions SET status='cancelled' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT role::text||'|'||investor_mode::text FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'investor|false','cancellation disables investor mode without demoting role');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_row || jsonb_build_object('investor_mode',false,'updated_at',now()) FROM d2_cancel_before),
 'cancellation changes only investor mode and profile timestamp');
SELECT is((SELECT ctid::text||'|'||to_jsonb(p)::text FROM public.profiles_public p
 WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT public_ctid::text||'|'||public_row::text FROM d2_cancel_before),
 'cancellation does not write the public profile tuple');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT subscription_row || jsonb_build_object('status','cancelled','updated_at',now()) FROM d2_cancel_before),
 'cancellation changes only subscription status and timestamp');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'
 AND title='Investor access updated' AND body='Your investor subscription was cancelled and investor mode has been turned off.'
 AND type='subscription' AND link='/dashboard/billing' AND read=false),1::bigint,'cancellation sends exact status notice');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 2::bigint,'cancellation creates exactly one new notice overall');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_append_notice(
   pg_temp.d2_patch_member(pg_temp.d2_patch_member((SELECT state FROM d2_cancel_before),
     'profiles','user_id','d2150001-0000-4000-8000-000000000003',
       jsonb_build_object('investor_mode',false,'updated_at',now())),
     'investor','user_id','d2150001-0000-4000-8000-000000000003',
       jsonb_build_object('status','cancelled','updated_at',now())),
   (SELECT to_jsonb(n) FROM public.notifications n
    WHERE n.user_id='d2150001-0000-4000-8000-000000000003'
      AND n.title='Investor access updated')),
 'cancellation preserves activation notice and equals exact full-state delta');
CREATE TEMP TABLE d2_cancel_repeat_before AS SELECT
 (SELECT ctid FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003') AS profile_ctid,
 (SELECT state FROM d2_lifecycle_state) AS state;
SET LOCAL ROLE service_role;
SELECT is(current_user,'service_role','repeat cancellation uses actual service role');
UPDATE public.investor_subscriptions SET status='cancelled' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 2::bigint,'same cancelled status sends no duplicate notice');
SELECT is((SELECT role::text||'|'||investor_mode::text FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'investor|false','repeat cancellation preserves profile state');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member((SELECT state FROM d2_cancel_repeat_before),'investor','user_id',
   'd2150001-0000-4000-8000-000000000003',jsonb_build_object('updated_at',now())),
 'repeat cancellation preserves complete state except intended subscription timestamp');
SELECT is((SELECT ctid::text FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 (SELECT profile_ctid::text FROM d2_cancel_repeat_before),
 'repeat cancellation does not rewrite profile tuple');
CREATE TEMP TABLE d2_second_trial_before AS SELECT
 (SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000004') AS profile_row,
 (SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000004') AS public_row,
 (SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000004') AS subscription_row,
 (SELECT state FROM d2_lifecycle_state) AS state;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET status='trial' WHERE user_id='d2150001-0000-4000-8000-000000000004';
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 'institutional|institutional','pending to trial promotes institutional profile');
SELECT is((SELECT to_jsonb(p) FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT profile_row || jsonb_build_object('role','institutional','participant_type','institutional','updated_at',now())
  FROM d2_second_trial_before),'pending-to-trial changes exactly intended profile fields');
SELECT is((SELECT to_jsonb(p) FROM public.profiles_public p WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT public_row || jsonb_build_object('role','institutional','owner_participant_type',NULL)
  FROM d2_second_trial_before),'pending-to-trial changes exact public projection');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT subscription_row || jsonb_build_object('status','trial','updated_at',now())
  FROM d2_second_trial_before),'pending-to-trial changes only subscription status and timestamp');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 1::bigint,'service trial activation sends one access notice');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000004'
 AND title='Investor access active' AND body='Your investor access is active.' AND type='subscription'
 AND link='/investor-dashboard' AND read=false),1::bigint,'trial activation notice has exact payload');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_append_notice(
   pg_temp.d2_patch_member(pg_temp.d2_patch_member(
     pg_temp.d2_patch_member((SELECT state FROM d2_second_trial_before),'profiles','user_id',
       'd2150001-0000-4000-8000-000000000004',
       jsonb_build_object('role','institutional','participant_type','institutional','updated_at',now())),
     'profiles_public','user_id','d2150001-0000-4000-8000-000000000004',
       jsonb_build_object('role','institutional','owner_participant_type',NULL)),
     'investor','user_id','d2150001-0000-4000-8000-000000000004',
       jsonb_build_object('status','trial','updated_at',now())),
   (SELECT to_jsonb(n) FROM public.notifications n
    WHERE n.user_id='d2150001-0000-4000-8000-000000000004')),
 'pending-to-trial equals exact full-state delta and one notice');
CREATE TEMP TABLE d2_self_cancel_before AS SELECT
 (SELECT ctid FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000004') AS profile_ctid,
 (SELECT state FROM d2_lifecycle_state) AS state;
SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"d2150001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),'d2150001-0000-4000-8000-000000000004'::uuid,'self actor claim is active');
UPDATE public.investor_subscriptions SET status='cancelled' WHERE user_id='d2150001-0000-4000-8000-000000000004';
RESET ROLE;
SELECT is((SELECT status FROM public.investor_subscriptions WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 'cancelled','self actor terminal status transition persisted');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 1::bigint,'self actor suppresses terminal notification');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_patch_member((SELECT state FROM d2_self_cancel_before),'investor','user_id',
   'd2150001-0000-4000-8000-000000000004',jsonb_build_object('status','cancelled','updated_at',now())),
 'self actor terminal update equals exact full-state delta without a notice');
SELECT is((SELECT ctid::text FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT profile_ctid::text FROM d2_self_cancel_before),
 'self actor terminal update does not rewrite already-false profile');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s
 WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 (SELECT value || jsonb_build_object('status','cancelled','updated_at',now())
  FROM d2_self_cancel_before, jsonb_array_elements(state->'investor') value
  WHERE value->>'user_id'='d2150001-0000-4000-8000-000000000004'),
 'self actor terminal update changes only subscription status and timestamp');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d2150001-0000-4000-8000-000000000005','private','active',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SELECT is(auth.uid(),NULL::uuid,'later service status update has no subject');
RESET ROLE;
CREATE TEMP TABLE d2_expiry_before AS SELECT
 (SELECT ctid FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000005') AS profile_ctid,
 (SELECT state FROM d2_lifecycle_state) AS state;
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET status='expired' WHERE user_id='d2150001-0000-4000-8000-000000000005';
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000005'
 AND title='Investor access updated' AND body='Your investor subscription expired and investor mode has been turned off.'
 AND type='subscription' AND link='/dashboard/billing' AND read=false),1::bigint,
 'service without subject sends exact expiry notice');
SELECT is((SELECT role::text||'|'||investor_mode::text FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000005'),
 'investor|false','expiry preserves role and already-false investor mode');
SELECT is((SELECT to_jsonb(s) FROM public.investor_subscriptions s
 WHERE user_id='d2150001-0000-4000-8000-000000000005'),
 (SELECT value || jsonb_build_object('status','expired','updated_at',now())
  FROM d2_expiry_before, jsonb_array_elements(state->'investor') value
  WHERE value->>'user_id'='d2150001-0000-4000-8000-000000000005'),
 'expiry changes only subscription status and timestamp');
SELECT is((SELECT state FROM d2_lifecycle_state),
 pg_temp.d2_append_notice(
   pg_temp.d2_patch_member((SELECT state FROM d2_expiry_before),'investor','user_id',
     'd2150001-0000-4000-8000-000000000005',jsonb_build_object('status','expired','updated_at',now())),
   (SELECT to_jsonb(n) FROM public.notifications n
    WHERE n.user_id='d2150001-0000-4000-8000-000000000005')),
 'expiry equals exact full-state delta and one notice');
SELECT is((SELECT ctid::text FROM public.profiles p WHERE user_id='d2150001-0000-4000-8000-000000000005'),
 (SELECT profile_ctid::text FROM d2_expiry_before),
 'already-false investor mode avoids profile tuple rewrite on expiry');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000005'),
 1::bigint,'expiry creates exactly one notice overall');
SELECT is((SELECT count(*) FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
 AND tgname IN ('profiles_guard_admin_and_role_trg','trg_guard_sensitive_profile_columns')
 AND tgenabled='O'),2::bigint,
 'both installed profile role and sensitive guards remain enabled after normal sync');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton), 'role switch rollout remains closed after lifecycle');
SELECT * FROM finish();
ROLLBACK;
