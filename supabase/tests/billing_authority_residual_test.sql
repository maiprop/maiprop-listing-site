-- D2 billing authority: actual service role, normal triggers, synthetic rollback.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(37);
SELECT is(current_setting('session_replication_role'), 'origin', 'billing cases use normal triggers');
SELECT ok(
  (SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
   FROM private.role_switch_rollout_control WHERE singleton),
  'role switch runtime remains closed'
);
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','service_role',true);
INSERT INTO auth.users(id,email) VALUES
 ('d2130001-0000-4000-8000-000000000001','d2-billed@example.test'),
 ('d2130001-0000-4000-8000-000000000002','d2-expired@example.test'),
 ('d2130001-0000-4000-8000-000000000003','d2-switching@example.test'),
 ('d2130001-0000-4000-8000-000000000004','d2-investor@example.test');
SET LOCAL ROLE service_role;
SELECT is(current_user, 'service_role', 'billing calls use actual service role');
SELECT is(auth.uid(), NULL::uuid, 'billing service role has no subject');
SELECT is(auth.role(),'service_role','billing service claim retains service role');
SELECT public.complete_onboarding_role_for_user(('d2130001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'buyer'::public.user_role, 'buyer')
FROM generate_series(1,3) n;
RESET ROLE;
SELECT set_config('maiprop.onboarding_rpc_active','false',true);

INSERT INTO public.pricing_configs(key,label,audience,module,unit,amount,is_active,metadata)
VALUES ('d2_authority_monthly','D2 authority monthly','participant','user_subscription','monthly',1,true,
        '{"stripe_product_id":"prod_d2_authority","stripe_price_id_monthly":"price_d2_authority"}'::jsonb);
INSERT INTO public.billing_subscriptions
 (user_id,stripe_customer_id,stripe_subscription_id,stripe_product_id,stripe_price_id,plan_key,audience,
  status,billing_cycle,current_period_end,runtime_mode,livemode,state_source,state_observed_at,
  stripe_event_id,stripe_event_created_at)
SELECT ('d2130001-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
       'cus_d2_'||n,'sub_d2_'||n,'prod_d2_authority','price_d2_authority','d2_authority_monthly','participant',
       'active','monthly',CASE WHEN n=2 THEN now()-interval '1 day' ELSE now()+interval '30 days' END,
       public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live','webhook_canonical',
       '2026-10-03T12:00:02Z'::timestamptz,'evt_d2_'||n,'2026-10-03T12:00:02Z'::timestamptz
FROM generate_series(1,3) n;
INSERT INTO public.billing_subscriptions
 (user_id,stripe_customer_id,stripe_subscription_id,stripe_product_id,stripe_price_id,plan_key,audience,
  status,billing_cycle,current_period_end,runtime_mode,livemode,state_source,state_observed_at)
VALUES ('d2130001-0000-4000-8000-000000000002','cus_d2_opposite','sub_d2_opposite',
 'prod_d2_authority','price_d2_authority','d2_authority_monthly','participant','active','monthly',
 now()+interval '30 days',CASE public.current_billing_runtime_mode() WHEN 'live' THEN 'test' ELSE 'live' END,
 public.current_billing_runtime_mode()<>'live','reconciliation','2026-10-03T12:00:02Z');
INSERT INTO public.investor_subscriptions(user_id,tier,status,expires_at,runtime_mode,livemode)
VALUES ('d2130001-0000-4000-8000-000000000004','private','active',now()+interval '20 days',
        public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live');
SELECT is((SELECT role::text||'|'||participant_type FROM public.profiles
 WHERE user_id='d2130001-0000-4000-8000-000000000004'),'investor|investor',
 'paid investor subscription creates the matching profile role through its normal trigger');
-- The admitted one-argument legacy begin establishes real switching state.
SET LOCAL ROLE service_role;
SELECT lives_ok($q$SELECT public.begin_role_switch_for_user('d2130001-0000-4000-8000-000000000003')$q$,
 'legacy begin establishes switching state through the accepted service workflow');
RESET ROLE;
CREATE TEMP VIEW d2_resolver_state AS
 SELECT jsonb_build_object(
   'profiles',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.user_id) FROM public.profiles p WHERE p.user_id::text LIKE 'd2130001-%'),
   'billing',(SELECT jsonb_agg(to_jsonb(b) ORDER BY b.id) FROM public.billing_subscriptions b WHERE b.stripe_subscription_id LIKE 'sub_d2_%'),
   'investor',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.investor_subscriptions i WHERE i.user_id='d2130001-0000-4000-8000-000000000004')) AS state;
CREATE TEMP TABLE d2_resolver_before AS SELECT state FROM d2_resolver_state;
SET LOCAL ROLE service_role;
SELECT is(
 public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000001','sub_d2_1'),
 jsonb_build_object('subscribed',true,'product_id','prod_d2_authority','subscription_end',
   (SELECT current_period_end FROM public.billing_subscriptions WHERE stripe_subscription_id='sub_d2_1'),
   'source','billing_state','plan_key','d2_authority_monthly','audience','participant',
   'billing_cycle','monthly','status','active'),
 'canonical current subscription resolves exact product, audience, period and state'
);
SELECT is(
 public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000001','sub_wrong'),
 jsonb_build_object('subscribed',false,'product_id',NULL,'subscription_end',NULL,'source','database',
   'audience','participant','status',NULL),
 'mismatched required Stripe subscription is not entitled'
);
SELECT is(
 public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000002','sub_d2_2'),
 jsonb_build_object('subscribed',false,'product_id',NULL,'subscription_end',NULL,'source','database',
   'audience','participant','status',NULL),
 'expired current period is not entitled'
);
SELECT is(
 public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000002','sub_d2_opposite'),
 jsonb_build_object('subscribed',false,'product_id',NULL,'subscription_end',NULL,'source','database',
   'audience','participant','status',NULL),
 'active opposite-runtime subscription does not cross the billing boundary'
);
SELECT is(
 public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000003','sub_d2_3'),
 jsonb_build_object('subscribed',false,'product_id',NULL,'subscription_end',NULL,'source','database',
   'audience','participant'),
 'genuine role switch blocks a current participant subscription'
);
SELECT is(
 public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000004',NULL),
 jsonb_build_object('subscribed',true,'product_id',NULL,'subscription_end',
   (SELECT expires_at FROM public.investor_subscriptions WHERE user_id='d2130001-0000-4000-8000-000000000004'),
   'source','investor','audience','investor','status','active'),
 'investor subscription resolves independently of participant billing'
);
RESET ROLE;
SELECT is((SELECT state FROM d2_resolver_state),(SELECT state FROM d2_resolver_before),
 'resolver reads leave all synthetic profile and subscription rows unchanged');

-- An older observation with the same event watermark must return OLD through the normal trigger.
CREATE TEMP TABLE d2_billing_before AS SELECT to_jsonb(b) AS row
 FROM public.billing_subscriptions b WHERE stripe_subscription_id='sub_d2_1';
UPDATE public.billing_subscriptions SET status='canceled', state_observed_at='2026-10-03T12:00:01Z',
 stripe_event_id='evt_d2_same',stripe_event_created_at='2026-10-03T12:00:02Z'
WHERE stripe_subscription_id='sub_d2_1';
SELECT is((SELECT to_jsonb(b) FROM public.billing_subscriptions b WHERE stripe_subscription_id='sub_d2_1'),
 (SELECT row FROM d2_billing_before),'older observation cannot replace newer canonical state');

INSERT INTO public.addon_purchases
 (id,user_id,addon_key,module,audience,unit,quantity,checkout_mode,status,stripe_session_id,
  runtime_mode,livemode,stripe_amount_total,stripe_currency,stripe_charge_id,stripe_invoice_id)
VALUES
 ('d2130002-0000-4000-8000-000000000001','d2130001-0000-4000-8000-000000000001',
  'valuation_bundle','ai_valuation','participant','credit',10,'payment','paid','cs_d2_refund_current',
  public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live',1000,'eur','ch_d2','in_d2'),
 ('d2130002-0000-4000-8000-000000000002','d2130001-0000-4000-8000-000000000001',
  'valuation_bundle','ai_valuation','participant','credit',10,'payment','paid','cs_d2_refund_opposite',
  CASE public.current_billing_runtime_mode() WHEN 'live' THEN 'test' ELSE 'live' END,
  public.current_billing_runtime_mode()<>'live',1000,'eur','ch_d2_other','in_d2_other');
CREATE TEMP VIEW d2_refund_state AS SELECT jsonb_build_object(
 'purchases',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM public.addon_purchases p WHERE p.id::text LIKE 'd2130002-%'),
 'ledger',(SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM private.addon_refund_events e WHERE e.purchase_id::text LIKE 'd2130002-%')) AS state;
CREATE TEMP TABLE d2_refund_before AS SELECT state FROM d2_refund_state;
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event(NULL,'re_d2_identity',100,1000,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live')$q$,'22023','addon_refund_identity_required','refund identity required');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'identity denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_amount',0,1000,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live')$q$,'22023','addon_refund_amount_invalid','refund amount must be positive');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'amount denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_status',100,1000,'invalid',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live')$q$,'22023','addon_refund_status_invalid','refund status must be recognized');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'status denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000099','re_d2_missing',100,1000,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live')$q$,'P0002','addon_purchase_not_found','missing purchase rejected');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'missing purchase denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000002','re_d2_runtime',100,1000,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live')$q$,'22023','addon_refund_runtime_mismatch','purchase runtime mismatch rejected');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'purchase runtime denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_total',100,1100,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live')$q$,'22023','addon_refund_total_mismatch','immutable purchase total rejected');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'total denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_charge',100,1000,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live','{"charge_id":"ch_wrong"}'::jsonb)$q$,'22023','addon_refund_charge_mismatch','immutable charge rejected');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'charge denial leaves full purchase and ledger state unchanged');
SET LOCAL ROLE service_role;
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_invoice',100,1000,'succeeded',public.current_billing_runtime_mode(),public.current_billing_runtime_mode()='live','{"invoice_id":"in_wrong"}'::jsonb)$q$,'22023','addon_refund_invoice_mismatch','immutable invoice rejected');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'invoice denial leaves full purchase and ledger state unchanged');

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims','{"role":"anon"}',true),set_config('request.jwt.claim.role','anon',true);
SELECT throws_ok($q$SELECT public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000001',NULL)$q$,NULL::text,NULL::text,'anon cannot call resolver');
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_anon',100,1000,'succeeded','test',false)$q$,NULL::text,NULL::text,'anon cannot reconcile refunds');
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"d2130001-0000-4000-8000-000000000001"}',true),set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub','d2130001-0000-4000-8000-000000000001',true);
SELECT throws_ok($q$SELECT public.resolve_subscription_state_for_service('d2130001-0000-4000-8000-000000000001',NULL)$q$,NULL::text,NULL::text,'authenticated cannot call resolver');
SELECT throws_ok($q$SELECT public.reconcile_addon_refund_event('d2130002-0000-4000-8000-000000000001','re_d2_auth',100,1000,'succeeded','test',false)$q$,NULL::text,NULL::text,'authenticated cannot reconcile refunds');
RESET ROLE;
SELECT is((SELECT state FROM d2_refund_state),(SELECT state FROM d2_refund_before),'denied browser calls leave purchase and ledger unchanged');
SELECT ok((SELECT NOT strict_enrollment_enabled AND legacy_begin_enabled AND NOT reconciliation_enabled
 FROM private.role_switch_rollout_control WHERE singleton),'billing tests leave rollout controls closed');
SELECT * FROM finish();
ROLLBACK;
