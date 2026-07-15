BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(12);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_reconcile_plan_promotion_subscription'
      AND tgrelid = 'public.billing_subscriptions'::regclass
      AND NOT tgisinternal
  ),
  'billing subscription changes trigger plan promotion reconciliation'
);

SELECT ok(
  COALESCE((
    SELECT prosecdef
      AND COALESCE(proconfig, ARRAY[]::text[]) @> ARRAY['search_path=""']
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'private.reconcile_plan_promotion_allocations(uuid)'
    )
  ), false),
  'plan reconciliation is a private SECURITY DEFINER with an empty search path'
);

SELECT ok(
  NOT COALESCE(
    has_function_privilege(
      'authenticated',
      to_regprocedure('private.reconcile_plan_promotion_allocations(uuid)'),
      'EXECUTE'
    ),
    false
  ),
  'authenticated users cannot execute plan reconciliation'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES ('d1000000-0000-4000-8000-000000000001');

INSERT INTO public.profiles (user_id, role, subscription_product_id)
VALUES (
  'd1000000-0000-4000-8000-000000000001',
  'seller',
  'prod_lifecycle_seller'
);

INSERT INTO public.billing_subscriptions (
  id,
  user_id,
  stripe_customer_id,
  stripe_subscription_id,
  stripe_product_id,
  stripe_price_id,
  plan_key,
  audience,
  status,
  current_period_start,
  current_period_end,
  runtime_mode,
  livemode
)
VALUES
  ('d2000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'cus_terminal', 'sub_terminal', 'prod_lifecycle_seller', 'price_terminal', 'pro', 'participant', 'active', now() - interval '1 day', now() + interval '30 days', public.current_billing_runtime_mode(), public.current_billing_runtime_mode() = 'live'),
  ('d2000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'cus_past_due', 'sub_past_due', 'prod_lifecycle_seller', 'price_past_due', 'pro', 'participant', 'active', now() - interval '1 day', now() + interval '30 days', public.current_billing_runtime_mode(), public.current_billing_runtime_mode() = 'live'),
  ('d2000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'cus_lapsed_update', 'sub_lapsed_update', 'prod_lifecycle_seller', 'price_lapsed_update', 'pro', 'participant', 'active', now() - interval '1 day', now() + interval '30 days', public.current_billing_runtime_mode(), public.current_billing_runtime_mode() = 'live'),
  ('d2000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'cus_lapsed_cron', 'sub_lapsed_cron', 'prod_lifecycle_seller', 'price_lapsed_cron', 'pro', 'participant', 'trialing', now() - interval '60 days', now() - interval '1 day', public.current_billing_runtime_mode(), public.current_billing_runtime_mode() = 'live'),
  ('d2000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'cus_refunded', 'sub_refunded', 'prod_lifecycle_seller', 'price_refunded', 'pro', 'participant', 'active', now() - interval '1 day', now() + interval '30 days', public.current_billing_runtime_mode(), public.current_billing_runtime_mode() = 'live');

INSERT INTO public.addon_purchases (
  id,
  user_id,
  addon_key,
  module,
  audience,
  unit,
  checkout_mode,
  status,
  stripe_session_id,
  credits_granted,
  credits_consumed,
  runtime_mode,
  livemode
)
VALUES (
  'd4000000-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000001',
  'priority_placement',
  'listings',
  'participant',
  'credit',
  'payment',
  'paid',
  'cs_preserved_addon',
  1,
  1,
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live'
);

INSERT INTO public.listings (
  id,
  owner_id,
  title,
  city,
  price,
  sqm,
  property_type,
  listing_type,
  status
)
VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'Terminal plus add-on', 'Athens', 100000, 80, 'apartment', 'sale', 'active'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'Past due grace', 'Athens', 110000, 85, 'apartment', 'sale', 'active'),
  ('d3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'Lapsed update', 'Athens', 120000, 90, 'apartment', 'sale', 'active'),
  ('d3000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'Lapsed cron', 'Athens', 130000, 95, 'apartment', 'sale', 'active'),
  ('d3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'Refunded subscription', 'Athens', 140000, 100, 'apartment', 'sale', 'active');

SET LOCAL session_replication_role = origin;

INSERT INTO public.listing_promotion_allocations (
  listing_id,
  owner_id,
  promotion_type,
  source_type,
  billing_subscription_id,
  addon_purchase_id,
  request_key,
  plan_cycle_start,
  starts_at,
  ends_at
)
VALUES
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'spotlight', 'plan', 'd2000000-0000-4000-8000-000000000001', NULL, 'terminal-plan', date_trunc('month', now() AT TIME ZONE 'UTC')::date, now(), now() + interval '30 days'),
  ('d3000000-0000-4000-8000-000000000001', 'd1000000-0000-4000-8000-000000000001', 'priority', 'addon', NULL, 'd4000000-0000-4000-8000-000000000001', 'preserved-addon', NULL, now(), now() + interval '30 days'),
  ('d3000000-0000-4000-8000-000000000002', 'd1000000-0000-4000-8000-000000000001', 'spotlight', 'plan', 'd2000000-0000-4000-8000-000000000002', NULL, 'past-due-plan', date_trunc('month', now() AT TIME ZONE 'UTC')::date, now(), now() + interval '30 days'),
  ('d3000000-0000-4000-8000-000000000003', 'd1000000-0000-4000-8000-000000000001', 'spotlight', 'plan', 'd2000000-0000-4000-8000-000000000003', NULL, 'lapsed-update-plan', date_trunc('month', now() AT TIME ZONE 'UTC')::date, now(), now() + interval '30 days'),
  ('d3000000-0000-4000-8000-000000000004', 'd1000000-0000-4000-8000-000000000001', 'spotlight', 'plan', 'd2000000-0000-4000-8000-000000000004', NULL, 'lapsed-cron-plan', date_trunc('month', now() AT TIME ZONE 'UTC')::date, now(), now() + interval '30 days'),
  ('d3000000-0000-4000-8000-000000000005', 'd1000000-0000-4000-8000-000000000001', 'spotlight', 'plan', 'd2000000-0000-4000-8000-000000000005', NULL, 'refunded-plan', date_trunc('month', now() AT TIME ZONE 'UTC')::date, now(), now() + interval '30 days');

UPDATE public.billing_subscriptions
SET status = 'canceled'
WHERE id = 'd2000000-0000-4000-8000-000000000001';

UPDATE public.billing_subscriptions
SET status = 'past_due'
WHERE id = 'd2000000-0000-4000-8000-000000000002';

UPDATE public.billing_subscriptions
SET status = 'trialing',
    current_period_end = now() - interval '1 second'
WHERE id = 'd2000000-0000-4000-8000-000000000003';

UPDATE public.billing_subscriptions
SET status = 'refunded'
WHERE id = 'd2000000-0000-4000-8000-000000000005';

SELECT public.expire_listing_promotions();

SELECT is(
  (
    SELECT ROW(status, revoke_reason)::text
    FROM public.listing_promotion_allocations
    WHERE request_key = 'terminal-plan'
  ),
  '(revoked,subscription_entitlement_terminal)',
  'terminal subscription state revokes its active plan allocation'
);

SELECT is(
  (
    SELECT ROW(status, revoke_reason)::text
    FROM public.listing_promotion_allocations
    WHERE request_key = 'refunded-plan'
  ),
  '(revoked,subscription_entitlement_terminal)',
  'refunded durable subscription state revokes its active plan allocation'
);

SELECT is(
  (
    SELECT ROW(status, revoke_reason)::text
    FROM public.listing_promotion_allocations
    WHERE request_key = 'lapsed-update-plan'
  ),
  '(revoked,subscription_entitlement_lapsed)',
  'a period-end update revokes a lapsed plan allocation'
);

SELECT is(
  (
    SELECT ROW(status, revoke_reason)::text
    FROM public.listing_promotion_allocations
    WHERE request_key = 'lapsed-cron-plan'
  ),
  '(revoked,subscription_entitlement_lapsed)',
  'the expiry service reconciles a time-lapsed plan allocation'
);

SELECT is(
  (
    SELECT status
    FROM public.listing_promotion_allocations
    WHERE request_key = 'past-due-plan'
  ),
  'active',
  'past_due payment recovery preserves provisioned plan access'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    'd1000000-0000-4000-8000-000000000001',
    'spotlight'
  ),
  0,
  'past_due payment recovery does not advertise a new promotion credit'
);

SELECT is(
  (
    SELECT status
    FROM public.listing_promotion_allocations
    WHERE request_key = 'preserved-addon'
  ),
  'active',
  'subscription revocation preserves a purchased add-on allocation'
);

SELECT is(
  (
    SELECT ROW(is_featured, priority_placement)::text
    FROM public.listings
    WHERE id = 'd3000000-0000-4000-8000-000000000001'
  ),
  '(f,1)',
  'projection sync removes the plan Spotlight and keeps add-on Priority'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations allocation
    JOIN public.billing_subscriptions subscription
      ON subscription.id = allocation.billing_subscription_id
    WHERE allocation.source_type = 'plan'
      AND allocation.status = 'active'
      AND (
        subscription.status IN (
          'canceled',
          'cancelled',
          'incomplete_expired',
          'paused',
          'unpaid',
          'expired',
          'refunded',
          'lapsed'
        )
        OR subscription.current_period_end <= now()
      )
  ),
  0,
  'no terminal or lapsed subscription retains an active plan allocation'
);

SELECT * FROM finish();
ROLLBACK;
