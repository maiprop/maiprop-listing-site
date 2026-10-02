-- D2 subscription lifecycle: actual roles, normal triggers, synthetic rollback.
BEGIN;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgtap') THEN
    CREATE EXTENSION pgtap;
  END IF;
END $$;
SELECT plan(57);
SELECT is(current_setting('session_replication_role'), 'origin', 'lifecycle uses normal triggers');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton), 'role switch rollout remains closed');
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
INSERT INTO auth.users(id,email) VALUES
 ('d2150001-0000-4000-8000-000000000001','d2-lapse-seller@example.test'),
 ('d2150001-0000-4000-8000-000000000002','d2-lapse-buyer@example.test'),
 ('d2150001-0000-4000-8000-000000000003','d2-investor-status@example.test'),
 ('d2150001-0000-4000-8000-000000000004','d2-investor-trial@example.test'),
 ('d2150001-0000-4000-8000-000000000005','d2-investor-actor@example.test');
SET LOCAL ROLE service_role;
SELECT is(current_user, 'service_role', 'fixture onboarding uses actual service role');
SELECT is(auth.uid(), NULL::uuid, 'fixture service role has no subject');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000001','seller','seller');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000002','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000003','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000004','buyer','buyer');
SELECT public.complete_onboarding_role_for_user('d2150001-0000-4000-8000-000000000005','buyer','buyer');
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
UPDATE public.billing_subscriptions SET status='canceled',state_observed_at=now()+interval '1 second'
WHERE stripe_subscription_id='sub_d2_lifecycle';
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
CREATE TEMP VIEW d2_lifecycle_state AS SELECT jsonb_build_object(
 'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles p WHERE p.user_id::text LIKE 'd2150001-%'),
 'profiles_public',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles_public p WHERE p.user_id::text LIKE 'd2150001-%'),
 'listings',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.listings l WHERE l.owner_id='d2150001-0000-4000-8000-000000000001'),
 'searches',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM public.saved_searches s WHERE s.user_id='d2150001-0000-4000-8000-000000000002'),
 'alerts',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.auction_alerts a WHERE a.user_id='d2150001-0000-4000-8000-000000000002'),
 'billing',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.billing_subscriptions b WHERE b.user_id='d2150001-0000-4000-8000-000000000001'),
 'investor',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.investor_subscriptions i WHERE i.user_id::text LIKE 'd2150001-%'),
 'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY n.id) FROM public.notifications n WHERE n.user_id::text LIKE 'd2150001-%')) AS state;
CREATE TEMP TABLE d2_lifecycle_before AS SELECT state FROM d2_lifecycle_state;
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
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000001'
 AND title='Subscription access updated' AND type='billing' AND link='/dashboard/billing'
 AND body='2 listing(s) were paused to match your current plan.'),1::bigint,'seller gets exact one listing notice');
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
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000002'
 AND title='Subscription access updated' AND type='billing' AND link='/dashboard/billing'
 AND body='2 saved-search email alert(s) were turned off. 2 auction alert(s) were turned off.'),
 1::bigint,'buyer gets exact one combined notice');
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

-- Pending payment does not activate role or send an UPDATE-only status notice.
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d2150001-0000-4000-8000-000000000003','private','pending_payment',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live'),
 ('d2150001-0000-4000-8000-000000000004','institutional','pending_payment',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'buyer|buyer','pending investor row leaves buyer role unchanged');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 0::bigint,'pending insert sends no investor status notice');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'payment activation runs as service without subject');
UPDATE public.investor_subscriptions SET status='active' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'investor|investor','activation promotes role and participant type');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'
 AND title='Investor access active' AND body='Your investor access is active.' AND type='subscription'
 AND link='/investor-dashboard'),1::bigint,'service activation sends exact access notice');
UPDATE public.investor_subscriptions SET status='trial' WHERE user_id='d2150001-0000-4000-8000-000000000003';
UPDATE public.investor_subscriptions SET status='trial' WHERE user_id='d2150001-0000-4000-8000-000000000003';
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'active to trial and same-status repeat send no notice');
UPDATE public.investor_subscriptions SET tier='institutional' WHERE user_id='d2150001-0000-4000-8000-000000000003';
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'institutional|institutional','active tier change synchronizes institutional role');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'tier-only update sends no status notice');
UPDATE public.investor_subscriptions SET tier='developer' WHERE user_id='d2150001-0000-4000-8000-000000000003';
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'developer|developer','active developer tier synchronizes role independently of investor Pro');
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000003'),false,
 'developer tier alone does not grant investor audience entitlement');
UPDATE public.investor_subscriptions SET tier='private' WHERE user_id='d2150001-0000-4000-8000-000000000003';
SELECT is(public.is_pro('d2150001-0000-4000-8000-000000000003'),true,
 'matching active investor audience grants independent entitlement');
SET LOCAL ROLE service_role;
SELECT is(public.apply_subscription_lapse_controls('d2150001-0000-4000-8000-000000000003'),
 '{"skipped":true,"reason":"alternate_entitlement_active"}'::jsonb,
 'independent investor entitlement skips lapse controls');
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 1::bigint,'alternate entitlement does not send lapse notice');
UPDATE public.profiles SET investor_mode=true WHERE user_id='d2150001-0000-4000-8000-000000000003';
SELECT is((SELECT investor_mode FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 true,'admitted profile update enables investor mode');
SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"d2150001-0000-4000-8000-000000000005"}',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),'d2150001-0000-4000-8000-000000000005'::uuid,'distinct actor claim is active for terminal notice');
UPDATE public.investor_subscriptions SET status='cancelled' WHERE user_id='d2150001-0000-4000-8000-000000000003';
RESET ROLE;
SELECT is((SELECT role::text||'|'||investor_mode::text FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'investor|false','cancellation disables investor mode without demoting role');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'
 AND title='Investor access updated' AND body='Your investor subscription was cancelled and investor mode has been turned off.'
 AND type='subscription' AND link='/dashboard/billing'),1::bigint,'cancellation sends exact status notice');
UPDATE public.investor_subscriptions SET status='cancelled' WHERE user_id='d2150001-0000-4000-8000-000000000003';
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 2::bigint,'same cancelled status sends no duplicate notice');
SELECT is((SELECT role::text||'|'||investor_mode::text FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000003'),
 'investor|false','repeat cancellation preserves profile state');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
UPDATE public.investor_subscriptions SET status='trial' WHERE user_id='d2150001-0000-4000-8000-000000000004';
RESET ROLE;
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 'institutional|institutional','pending to trial promotes institutional profile');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 1::bigint,'service trial activation sends one access notice');
SELECT set_config('request.jwt.claims','{"role":"service_role","sub":"d2150001-0000-4000-8000-000000000004"}',true);
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),'d2150001-0000-4000-8000-000000000004'::uuid,'self actor claim is active');
UPDATE public.investor_subscriptions SET status='cancelled' WHERE user_id='d2150001-0000-4000-8000-000000000004';
RESET ROLE;
SELECT is((SELECT status FROM public.investor_subscriptions WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 'cancelled','self actor terminal status transition persisted');
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000004'),
 1::bigint,'self actor suppresses terminal notification');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d2150001-0000-4000-8000-000000000005','private','active',now()+interval '30 days',
 public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SET LOCAL ROLE service_role;
SELECT is(auth.uid(),NULL::uuid,'later service status update has no subject');
UPDATE public.investor_subscriptions SET status='expired' WHERE user_id='d2150001-0000-4000-8000-000000000005';
RESET ROLE;
SELECT is((SELECT count(*) FROM public.notifications WHERE user_id='d2150001-0000-4000-8000-000000000005'
 AND title='Investor access updated' AND body='Your investor subscription expired and investor mode has been turned off.'
 AND type='subscription' AND link='/dashboard/billing'),1::bigint,
 'service without subject sends exact expiry notice');
SELECT is((SELECT role::text||'|'||investor_mode::text FROM public.profiles WHERE user_id='d2150001-0000-4000-8000-000000000005'),
 'investor|false','expiry preserves role and already-false investor mode');
SELECT ok((SELECT bool_and(tgenabled='O') FROM pg_trigger WHERE tgrelid='public.profiles'::regclass
 AND tgname IN ('profiles_guard_admin_and_role_trg','profiles_guard_admin_and_role')),
 'profile role guards remain enabled after normal sync');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton), 'role switch rollout remains closed after lifecycle');
SELECT * FROM finish();
ROLLBACK;
