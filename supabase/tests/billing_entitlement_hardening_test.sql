BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users (id)
VALUES ('92000000-0000-4000-8000-000000000001');
INSERT INTO public.profiles (user_id, role)
VALUES ('92000000-0000-4000-8000-000000000001', 'buyer');
SET LOCAL session_replication_role = origin;

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_subscriptions'
      AND column_name = 'stripe_event_created_at'
  ),
  'durable subscription rows record the Stripe event creation time'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'billing_subscriptions'
      AND column_name = 'state_observed_at'
  ),
  'durable subscription rows record when canonical state was observed'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.billing_subscriptions'::regclass
      AND conname = 'billing_subscriptions_active_period_bounded'
      AND convalidated
  ),
  'active and past-due durable rows require a bounded period'
);

SELECT throws_ok(
  $$
    INSERT INTO public.billing_subscriptions (
      user_id, stripe_customer_id, stripe_subscription_id, status,
      runtime_mode, livemode
    ) VALUES (
      '92000000-0000-4000-8000-000000000001', 'cus_missing_period',
      'sub_missing_period', 'active', 'test', false
    )
  $$,
  '23514',
  NULL,
  'an active durable subscription without current_period_end is rejected'
);

SELECT ok(
  to_regprocedure('private.repair_billing_subscription_canonical_fields()') IS NOT NULL,
  'canonical legacy billing repair function exists'
);

SELECT ok(
  to_regprocedure('private.guard_billing_subscription_state_order()') IS NOT NULL,
  'database state-order guard exists'
);

SELECT throws_ok(
  $$
    DELETE FROM private.billing_runtime_config WHERE singleton;
    SELECT public.current_billing_runtime_mode();
  $$,
  NULL,
  NULL,
  'missing billing runtime configuration fails closed'
);

SELECT ok(
  to_regclass('public.idx_billing_subscriptions_entitlement_lookup') IS NOT NULL,
  'durable entitlement lookup has a runtime/audience/status index'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.billing_subscriptions'::regclass
      AND conname = 'billing_subscriptions_active_canonical'
      AND convalidated
  ),
  'active durable rows require canonical plan, audience, product and price'
);

INSERT INTO public.pricing_configs (
  key, label, audience, module, unit, amount, is_active, metadata
) VALUES (
  'billing_hardening_test_plan',
  'Billing hardening test plan',
  'buyer',
  'user_subscription',
  'monthly',
  1,
  true,
  jsonb_build_object(
    'stripe_product_id', 'prod_billing_hardening',
    'stripe_price_id_monthly', 'price_billing_hardening_monthly'
  )
)
ON CONFLICT (key) DO UPDATE SET
  audience = EXCLUDED.audience,
  module = EXCLUDED.module,
  is_active = true,
  metadata = EXCLUDED.metadata;

INSERT INTO public.billing_subscriptions (
  user_id, stripe_customer_id, stripe_subscription_id, status,
  billing_cycle, runtime_mode, livemode, metadata
) VALUES (
  '92000000-0000-4000-8000-000000000001',
  'cus_legacy_canonical',
  'sub_legacy_canonical',
  'canceled',
  'monthly',
  'test',
  false,
  '{"plan_key":"billing_hardening_test_plan"}'::jsonb
);

SELECT private.repair_billing_subscription_canonical_fields();

SELECT is(
  (
    SELECT concat_ws('|', plan_key, audience, stripe_product_id, stripe_price_id)
    FROM public.billing_subscriptions
    WHERE stripe_subscription_id = 'sub_legacy_canonical'
  ),
  'billing_hardening_test_plan|participant|prod_billing_hardening|price_billing_hardening_monthly',
  'legacy metadata is repaired to canonical pricing fields'
);

INSERT INTO public.billing_subscriptions (
  user_id, stripe_customer_id, stripe_subscription_id,
  stripe_product_id, stripe_price_id, plan_key, audience,
  status, billing_cycle, current_period_end, runtime_mode, livemode,
  state_source, state_observed_at, stripe_event_id, stripe_event_created_at
) VALUES (
  '92000000-0000-4000-8000-000000000001',
  'cus_ordered_state',
  'sub_ordered_state',
  'prod_billing_hardening',
  'price_billing_hardening_monthly',
  'billing_hardening_test_plan',
  'participant',
  'canceled',
  'monthly',
  NULL,
  'test',
  false,
  'webhook_canonical',
  '2026-07-14T12:00:02Z',
  'evt_terminal_newer',
  '2026-07-14T12:00:02Z'
);

INSERT INTO public.billing_subscriptions (
  user_id, stripe_customer_id, stripe_subscription_id,
  stripe_product_id, stripe_price_id, plan_key, audience,
  status, billing_cycle, current_period_end, runtime_mode, livemode,
  state_source, state_observed_at, stripe_event_id, stripe_event_created_at
) VALUES (
  '92000000-0000-4000-8000-000000000001',
  'cus_ordered_state',
  'sub_ordered_state',
  'prod_billing_hardening',
  'price_billing_hardening_monthly',
  'billing_hardening_test_plan',
  'participant',
  'active',
  'monthly',
  '2099-01-01T00:00:00Z',
  'test',
  false,
  'webhook_canonical',
  '2026-07-14T12:00:03Z',
  'evt_active_older',
  '2026-07-14T12:00:01Z'
)
ON CONFLICT (stripe_subscription_id) DO UPDATE SET
  status = EXCLUDED.status,
  current_period_end = EXCLUDED.current_period_end,
  state_source = EXCLUDED.state_source,
  state_observed_at = EXCLUDED.state_observed_at,
  stripe_event_id = EXCLUDED.stripe_event_id,
  stripe_event_created_at = EXCLUDED.stripe_event_created_at;

SELECT is(
  (
    SELECT status
    FROM public.billing_subscriptions
    WHERE stripe_subscription_id = 'sub_ordered_state'
  ),
  'canceled',
  'a stale active event cannot overwrite a newer terminal state'
);

UPDATE public.billing_subscriptions
SET
  state_source = 'reconciliation',
  state_observed_at = '2026-07-14T12:00:04Z'
WHERE stripe_subscription_id = 'sub_ordered_state';

SELECT is(
  (
    SELECT stripe_event_id
    FROM public.billing_subscriptions
    WHERE stripe_subscription_id = 'sub_ordered_state'
  ),
  'evt_terminal_newer',
  'canonical reconciliation preserves the latest Stripe event watermark'
);

SELECT * FROM finish();
ROLLBACK;
