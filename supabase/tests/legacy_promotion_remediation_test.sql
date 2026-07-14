BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(19);

SELECT has_table(
  'private',
  'legacy_listing_promotion_quarantine',
  'legacy projection evidence is retained in a private quarantine table'
);

SELECT ok(
  to_regprocedure(
    'private.remediate_legacy_listing_promotions(timestamp with time zone)'
  ) IS NOT NULL,
  'the idempotent legacy promotion remediator exists'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002'),
  ('c1000000-0000-4000-8000-000000000003'),
  ('c1000000-0000-4000-8000-000000000004'),
  ('c1000000-0000-4000-8000-000000000005');

INSERT INTO public.profiles (
  user_id,
  role,
  is_platform_admin,
  subscription_product_id
)
VALUES
  ('c1000000-0000-4000-8000-000000000001', 'admin', true, NULL),
  ('c1000000-0000-4000-8000-000000000002', 'seller', false, NULL),
  ('c1000000-0000-4000-8000-000000000003', 'agent', false, 'prod_legacy_agent'),
  ('c1000000-0000-4000-8000-000000000004', 'agent', false, NULL),
  ('c1000000-0000-4000-8000-000000000005', 'seller', false, NULL);

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
VALUES (
  'c2000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000003',
  'cus_legacy_agent',
  'sub_legacy_agent',
  'prod_legacy_agent',
  'price_legacy_agent',
  'agent_basic',
  'agent',
  'active',
  now() - interval '1 day',
  now() + interval '90 days',
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live'
);

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
  'c4000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000004',
  'priority_placement',
  'listings',
  'agent',
  'credit',
  'payment',
  'paid',
  'cs_legacy_priority',
  1,
  0,
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
  status,
  is_featured,
  featured_until,
  priority_placement,
  priority_until
)
VALUES
  (
    'c3000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'Unsupported legacy Priority',
    'Athens',
    100000,
    80,
    'apartment',
    'sale',
    'active',
    false,
    NULL,
    1,
    NULL
  ),
  (
    'c3000000-0000-4000-8000-000000000002',
    'c1000000-0000-4000-8000-000000000003',
    'Plan-backed legacy Priority',
    'Athens',
    110000,
    85,
    'apartment',
    'sale',
    'active',
    false,
    NULL,
    1,
    NULL
  ),
  (
    'c3000000-0000-4000-8000-000000000003',
    'c1000000-0000-4000-8000-000000000004',
    'Add-on-backed legacy Priority',
    'Athens',
    120000,
    90,
    'apartment',
    'sale',
    'active',
    false,
    NULL,
    1,
    NULL
  ),
  (
    'c3000000-0000-4000-8000-000000000004',
    'c1000000-0000-4000-8000-000000000005',
    'Audit-backed legacy Priority',
    'Athens',
    130000,
    95,
    'apartment',
    'sale',
    'active',
    false,
    NULL,
    1,
    NULL
  ),
  (
    'c3000000-0000-4000-8000-000000000005',
    'c1000000-0000-4000-8000-000000000002',
    'Unsupported legacy Spotlight',
    'Athens',
    140000,
    100,
    'apartment',
    'sale',
    'active',
    true,
    now() + interval '30 days',
    0,
    NULL
  );

SET LOCAL session_replication_role = origin;

INSERT INTO public.admin_audit_log (
  actor_id,
  target_id,
  entity,
  action,
  new_data,
  reason
)
VALUES (
  'c1000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000004',
  'listing_promotion',
  'ENABLE',
  jsonb_build_object(
    'promotion_type',
    'priority',
    'enabled',
    true,
    'ends_at',
    now() + interval '45 days'
  ),
  'verified legacy admin grant'
);

INSERT INTO public.listing_promotion_allocations (
  listing_id,
  owner_id,
  promotion_type,
  source_type,
  request_key,
  starts_at,
  ends_at,
  created_by
)
VALUES (
  'c3000000-0000-4000-8000-000000000005',
  'c1000000-0000-4000-8000-000000000002',
  'spotlight',
  'admin',
  'legacy-admin-spotlight:c3000000-0000-4000-8000-000000000005',
  now(),
  now() + interval '30 days',
  'c1000000-0000-4000-8000-000000000002'
);

SELECT lives_ok(
  $$
    SELECT private.repair_legacy_priority_promotions(transaction_timestamp())
  $$,
  'the compatibility repair entry point completes without laundering flags'
);

SELECT lives_ok(
  $$
    SELECT private.remediate_legacy_listing_promotions(transaction_timestamp())
  $$,
  'the generic evidence remediator handles both promotion projections'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = 'c3000000-0000-4000-8000-000000000001'
      AND promotion_type = 'priority'
      AND status = 'active'
  ),
  0,
  'an unsupported Priority flag does not become an entitlement'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = 'c3000000-0000-4000-8000-000000000005'
      AND promotion_type = 'spotlight'
      AND status = 'active'
  ),
  0,
  'an unsupported Spotlight flag does not remain an entitlement'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = 'c3000000-0000-4000-8000-000000000002'
      AND promotion_type = 'priority'
      AND source_type = 'plan'
      AND billing_subscription_id = 'c2000000-0000-4000-8000-000000000001'
      AND status = 'active'
      AND created_by IS NULL
  ),
  1,
  'verified plan evidence becomes a plan allocation with no invented actor'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = 'c3000000-0000-4000-8000-000000000003'
      AND promotion_type = 'priority'
      AND source_type = 'addon'
      AND addon_purchase_id = 'c4000000-0000-4000-8000-000000000001'
      AND status = 'active'
      AND created_by IS NULL
  ),
  1,
  'verified add-on evidence becomes an add-on allocation with no invented actor'
);

SELECT is(
  (
    SELECT credits_consumed
    FROM public.addon_purchases
    WHERE id = 'c4000000-0000-4000-8000-000000000001'
  ),
  1,
  'the migrated add-on allocation consumes exactly one paid credit'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = 'c3000000-0000-4000-8000-000000000004'
      AND promotion_type = 'priority'
      AND source_type = 'admin'
      AND status = 'active'
      AND created_by = 'c1000000-0000-4000-8000-000000000001'
  ),
  1,
  'verified audit evidence records the actual administrator actor'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations allocation
    WHERE allocation.status = 'active'
      AND allocation.source_type = 'admin'
      AND allocation.request_key LIKE 'legacy-%'
      AND allocation.created_by = allocation.owner_id
  ),
  0,
  'no listing owner is invented as a legacy administrator actor'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listings
    WHERE id IN (
      'c3000000-0000-4000-8000-000000000001',
      'c3000000-0000-4000-8000-000000000005'
    )
      AND is_featured = false
      AND featured_until IS NULL
      AND priority_placement = 0
      AND priority_until IS NULL
  ),
  2,
  'unsupported paid projections are cleared after quarantine'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listings
    WHERE id IN (
      'c3000000-0000-4000-8000-000000000002',
      'c3000000-0000-4000-8000-000000000003',
      'c3000000-0000-4000-8000-000000000004'
    )
      AND priority_placement = 1
      AND priority_until > now()
  ),
  3,
  'evidence-backed legacy Priority projections remain active'
);

SELECT lives_ok(
  $$
    SELECT private.remediate_legacy_listing_promotions(transaction_timestamp())
  $$,
  'replaying legacy remediation is idempotent'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id IN (
      'c3000000-0000-4000-8000-000000000002',
      'c3000000-0000-4000-8000-000000000003',
      'c3000000-0000-4000-8000-000000000004'
    )
      AND status = 'active'
  ),
  3,
  'idempotent remediation creates no duplicate active allocations'
);

SELECT is(
  (
    SELECT credits_consumed
    FROM public.addon_purchases
    WHERE id = 'c4000000-0000-4000-8000-000000000001'
  ),
  1,
  'idempotent remediation does not consume the add-on credit twice'
);

SELECT ok(
  NOT COALESCE(
    has_table_privilege(
      'authenticated',
      to_regclass('private.legacy_listing_promotion_quarantine'),
      'SELECT'
    ),
    false
  ),
  'authenticated users cannot read the private quarantine ledger'
);

SELECT ok(
  NOT COALESCE(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'private.remediate_legacy_listing_promotions(timestamp with time zone)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'authenticated users cannot execute legacy remediation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE request_key LIKE 'legacy-admin-%'
      AND created_by IS NOT NULL
      AND created_by = owner_id
  ),
  0,
  'quarantined legacy rows retain no fabricated owner actor'
);

SELECT * FROM finish();
ROLLBACK;
