BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(64);

SELECT ok(
  COALESCE((
    SELECT NOT prosecdef
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'public.admin_set_listing_promotions(uuid,boolean,timestamp with time zone,boolean,uuid)'
    )
  ), false),
  'public atomic admin promotion RPC is SECURITY INVOKER'
);

SELECT ok(
  COALESCE((
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = to_regprocedure(
      'private.admin_set_listing_promotions(uuid,boolean,timestamp with time zone,boolean,uuid)'
    )
  ), false),
  'private atomic admin promotion implementation is SECURITY DEFINER'
);

SELECT ok(
  COALESCE(has_function_privilege(
    'service_role',
    to_regprocedure(
      'public.admin_set_listing_promotions(uuid,boolean,timestamp with time zone,boolean,uuid)'
    ),
    'EXECUTE'
  ), false),
  'service role can call the public atomic admin wrapper'
);

SELECT ok(
  NOT COALESCE(has_function_privilege(
    'authenticated',
    to_regprocedure(
      'public.admin_set_listing_promotions(uuid,boolean,timestamp with time zone,boolean,uuid)'
    ),
    'EXECUTE'
  ), false),
  'authenticated browser role cannot call the atomic admin wrapper'
);

SELECT ok(
  COALESCE(has_function_privilege(
    'service_role',
    to_regprocedure(
      'private.admin_set_listing_promotions(uuid,boolean,timestamp with time zone,boolean,uuid)'
    ),
    'EXECUTE'
  ), false),
  'service role can call the private atomic admin implementation'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'private.sync_listing_promotion_projection(uuid)',
    'EXECUTE'
  ),
  'service role can call private projection sync'
);

SELECT ok(
  to_regprocedure(
    'public.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)'
  ) IS NULL,
  'the non-atomic singular public admin RPC is removed'
);

SELECT ok(
  to_regprocedure(
    'private.repair_legacy_priority_promotions(timestamp with time zone)'
  ) IS NOT NULL,
  'legacy Priority repair remains available for deterministic verification'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.listings'::regclass
      AND conname = 'listings_priority_placement_boolean_check'
      AND convalidated
  ),
  'Priority projection is constrained to the boolean 0/1 domain'
);

SELECT ok(
  to_regclass('public.idx_listing_promotion_addon_purchase_id') IS NOT NULL,
  'promotion allocation add-on foreign key is indexed'
);

SELECT ok(
  to_regclass('public.idx_listing_promotion_billing_subscription_id') IS NOT NULL,
  'promotion allocation subscription foreign key is indexed'
);

SELECT ok(
  to_regclass('public.idx_listing_promotion_created_by') IS NOT NULL,
  'promotion allocation creator foreign key is indexed'
);

SELECT ok(
  to_regclass('public.idx_listings_priority_catalogue') IS NOT NULL,
  'Priority catalogue sort has a partial index'
);

SELECT ok(
  to_regclass('public.idx_listings_spotlight_catalogue') IS NOT NULL,
  'active Spotlight homepage query has a partial index'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003'),
  ('10000000-0000-4000-8000-000000000004'),
  ('10000000-0000-4000-8000-000000000005'),
  ('10000000-0000-4000-8000-000000000006'),
  ('10000000-0000-4000-8000-000000000007');

INSERT INTO public.profiles (
  user_id,
  role,
  is_platform_admin,
  subscription_product_id
)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'admin', true, NULL),
  ('10000000-0000-4000-8000-000000000002', 'seller', false, NULL),
  ('10000000-0000-4000-8000-000000000003', 'seller', false, 'prod_seller_pro'),
  ('10000000-0000-4000-8000-000000000004', 'agent', false, 'prod_agent_pro'),
  ('10000000-0000-4000-8000-000000000005', 'developer', false, 'prod_developer_pro'),
  ('10000000-0000-4000-8000-000000000006', 'seller', false, 'prod_seller_trial'),
  ('10000000-0000-4000-8000-000000000007', 'seller', false, NULL);

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
  (
    '21000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'cus_seller_pro',
    'sub_seller_pro',
    'prod_seller_pro',
    'price_seller_pro',
    'pro',
    'participant',
    'active',
    now() - interval '1 day',
    now() + interval '90 days',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  ),
  (
    '21000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000004',
    'cus_agent_pro',
    'sub_agent_pro',
    'prod_agent_pro',
    'price_agent_pro',
    'agent_basic',
    'agent',
    'active',
    now() - interval '1 day',
    now() + interval '90 days',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  ),
  (
    '21000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000005',
    'cus_developer_pro',
    'sub_developer_pro',
    'prod_developer_pro',
    'price_developer_pro',
    'developer_pro',
    'developer',
    'active',
    now() - interval '1 day',
    now() + interval '90 days',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  ),
  (
    '21000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000006',
    'cus_seller_trial',
    'sub_seller_trial',
    'prod_seller_trial',
    'price_seller_trial',
    'pro',
    'participant',
    'trialing',
    now() - interval '1 day',
    now() + interval '14 days',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  ),
  (
    '21000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000007',
    'cus_legacy_null_product',
    'sub_legacy_null_product',
    'prod_unbound_seller_pro',
    'price_unbound_seller_pro',
    'pro',
    'participant',
    'active',
    now() - interval '1 day',
    now() + interval '90 days',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  );

INSERT INTO public.projects (id, owner_id, name)
VALUES (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Promotion fixture project'
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
  project_id
)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Canonical project listing',
    'Athens',
    100000,
    80,
    'apartment',
    'new_build',
    'active',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Promotion fixture two',
    'Athens',
    110000,
    85,
    'apartment',
    'sale',
    'active',
    NULL
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Promotion bundle fixture',
    'Athens',
    120000,
    90,
    'apartment',
    'sale',
    'active',
    NULL
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'Idempotency conflict fixture',
    'Athens',
    140000,
    100,
    'apartment',
    'sale',
    'active',
    NULL
  ),
  (
    '30000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    'Expired renewal fixture',
    'Athens',
    150000,
    105,
    'apartment',
    'sale',
    'active',
    NULL
  ),
  (
    '30000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000002',
    'Refunded credit fixture',
    'Athens',
    160000,
    110,
    'apartment',
    'sale',
    'active',
    NULL
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
  project_id,
  is_featured,
  featured_until,
  priority_placement,
  priority_until
)
VALUES
  (
    '30000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000003',
    'No rollover fixture',
    'Athens',
    170000,
    115,
    'apartment',
    'sale',
    'active',
    NULL,
    false,
    NULL,
    0,
    NULL
  ),
  (
    '30000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000002',
    'Atomic admin fixture',
    'Athens',
    180000,
    120,
    'apartment',
    'sale',
    'active',
    NULL,
    false,
    NULL,
    0,
    NULL
  ),
  (
    '30000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000002',
    'Legacy Priority fixture',
    'Athens',
    190000,
    125,
    'apartment',
    'sale',
    'active',
    NULL,
    false,
    '2000-01-01T00:00:00Z',
    1,
    NULL
  );

SELECT throws_ok(
  $$
    INSERT INTO public.billing_subscriptions (
      user_id,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      runtime_mode,
      livemode
    ) VALUES (
      '10000000-0000-4000-8000-000000000001',
      'cus_runtime_mismatch',
      'sub_runtime_mismatch',
      'active',
      'live',
      false
    )
  $$,
  '23514',
  NULL,
  'billing subscriptions reject runtime/livemode mismatches'
);

SELECT throws_ok(
  $$
    INSERT INTO public.addon_purchases (
      user_id,
      addon_key,
      module,
      audience,
      unit,
      checkout_mode,
      stripe_session_id,
      runtime_mode,
      livemode
    ) VALUES (
      '10000000-0000-4000-8000-000000000001',
      'featured_listing',
      'listings',
      'developer',
      'credit',
      'payment',
      'fixture_runtime_mismatch',
      'live',
      false
    )
  $$,
  '23514',
  NULL,
  'promotion add-ons reject runtime/livemode mismatches'
);

SELECT throws_ok(
  $$
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
      project_id
    ) VALUES (
      '30000000-0000-4000-8000-000000000004',
      '10000000-0000-4000-8000-000000000001',
      'Duplicate project listing',
      'Athens',
      130000,
      95,
      'apartment',
      'new_build',
      'active',
      '20000000-0000-4000-8000-000000000001'
    )
  $$,
  '23505',
  NULL,
  'a project cannot have a second canonical listing'
);

INSERT INTO public.addon_purchases (
  id,
  user_id,
  addon_key,
  module,
  audience,
  unit,
  quantity,
  checkout_mode,
  stripe_session_id,
  credits_granted,
  credits_consumed,
  runtime_mode,
  livemode
)
VALUES
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'featured_listing',
    'listings',
    'developer',
    'credit',
    2,
    'payment',
    'fixture_partial_refund',
    2,
    2,
    'test',
    false
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'featured_priority_bundle',
    'listings',
    'developer',
    'credit',
    1,
    'payment',
    'fixture_bundle_refund',
    1,
    1,
    'test',
    false
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'featured_listing',
    'listings',
    'seller',
    'credit',
    1,
    'payment',
    'fixture_unavailable_refunded_credit',
    1,
    0,
    'test',
    false
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'featured_listing',
    'listings',
    'participant',
    'credit',
    1,
    'payment',
    'fixture_admin_provenance',
    1,
    1,
    'test',
    false
  );

UPDATE public.addon_purchases
SET status = 'paid', credits_refunded = 1, refund_status = 'partial_refund'
WHERE id = '40000000-0000-4000-8000-000000000003';

SET LOCAL session_replication_role = origin;

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000003',
    'spotlight'
  ),
  1,
  'Seller Pro receives one Spotlight per calendar month'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000003',
    'priority'
  ),
  0,
  'Seller Pro receives no included Priority placements'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000004',
    'spotlight'
  ),
  0,
  'Agent Pro receives no included Spotlight placements'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000004',
    'priority'
  ),
  10,
  'Agent Pro receives ten Priority placements per calendar month'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000005',
    'spotlight'
  ),
  1,
  'Developer Pro receives one Spotlight per calendar month'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000005',
    'priority'
  ),
  1,
  'Developer Pro receives one Priority placement per calendar month'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000006',
    'spotlight'
  ),
  0,
  'trial subscriptions receive no Spotlight allowance'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000006',
    'priority'
  ),
  0,
  'trial subscriptions receive no Priority allowance'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000007',
    'spotlight'
  ),
  0,
  'an unbound legacy subscription product receives no Spotlight fallback'
);

SELECT is(
  private.get_listing_promotion_plan_allowance(
    '10000000-0000-4000-8000-000000000007',
    'priority'
  ),
  0,
  'an unbound legacy subscription product receives no Priority fallback'
);

INSERT INTO public.listing_promotion_allocations (
  listing_id,
  owner_id,
  promotion_type,
  source_type,
  status,
  billing_subscription_id,
  request_key,
  plan_cycle_start,
  starts_at,
  ends_at,
  created_by
)
VALUES (
  '30000000-0000-4000-8000-000000000008',
  '10000000-0000-4000-8000-000000000003',
  'spotlight',
  'plan',
  'expired',
  '21000000-0000-4000-8000-000000000003',
  'previous-cycle-spotlight',
  (date_trunc('month', now() AT TIME ZONE 'UTC')::date - interval '1 month')::date,
  date_trunc('month', now()) - interval '1 month',
  date_trunc('month', now()),
  '10000000-0000-4000-8000-000000000003'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

SELECT is(
  (
    SELECT ROW(
      (balance->'spotlight'->>'included')::integer,
      (balance->'spotlight'->>'used')::integer,
      (balance->'spotlight'->>'remaining')::integer
    )::text
    FROM (SELECT public.get_listing_promotion_balance() AS balance) balances
  ),
  '(1,0,1)',
  'unused or consumed credits from a previous calendar month do not roll over'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    SELECT private.repair_legacy_priority_promotions(
      '2099-01-01T00:00:00Z'::timestamptz
    )
  $$,
  'legacy Priority compatibility repair quarantines unsupported state'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = '30000000-0000-4000-8000-000000000010'
      AND promotion_type = 'priority'
      AND status = 'active'
  ),
  0,
  'legacy Priority receives no allocation without trusted evidence'
);

SELECT is(
  (
    SELECT ROW(
      is_featured,
      featured_until IS NULL,
      priority_placement,
      priority_until IS NULL
    )::text
    FROM public.listings
    WHERE id = '30000000-0000-4000-8000-000000000010'
  ),
  '(f,t,0,t)',
  'unsupported legacy Priority and unrelated Spotlight projections are cleared'
);

INSERT INTO public.listing_promotion_allocations (
  listing_id,
  owner_id,
  promotion_type,
  source_type,
  addon_purchase_id,
  request_key,
  ends_at
)
VALUES
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'spotlight',
    'addon',
    '40000000-0000-4000-8000-000000000001',
    'partial-credit-1',
    now() + interval '30 days'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'spotlight',
    'addon',
    '40000000-0000-4000-8000-000000000001',
    'partial-credit-2',
    now() + interval '30 days'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'spotlight',
    'addon',
    '40000000-0000-4000-8000-000000000002',
    'bundle-credit-1',
    now() + interval '30 days'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'priority',
    'addon',
    '40000000-0000-4000-8000-000000000002',
    'bundle-credit-1',
    now() + interval '30 days'
  ),
  (
    '30000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000002',
    'spotlight',
    'addon',
    '40000000-0000-4000-8000-000000000004',
    'admin-provenance-addon',
    now() + interval '30 days'
  );

UPDATE public.addon_purchases
SET credits_refunded = 1, refund_status = 'partial_refund'
WHERE id = '40000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE addon_purchase_id = '40000000-0000-4000-8000-000000000001'
      AND status = 'active'
  ),
  1,
  'a one-credit partial refund leaves exactly one allocation active'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE addon_purchase_id = '40000000-0000-4000-8000-000000000001'
      AND revoke_reason = 'stripe_refund'
  ),
  1,
  'a one-credit partial refund revokes exactly one consumed request'
);

SELECT is(
  (
    SELECT ROW(credits_consumed, credits_refunded)::text
    FROM public.addon_purchases
    WHERE id = '40000000-0000-4000-8000-000000000001'
  ),
  '(1,1)',
  'partial refund reconciles consumed and refunded accounting'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listings
    WHERE id IN (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )
      AND is_featured = false
      AND featured_until IS NULL
  ),
  1,
  'partial refund clears the revoked Spotlight listing projection'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listings
    WHERE id IN (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )
      AND is_featured = true
      AND featured_until IS NOT NULL
  ),
  1,
  'partial refund preserves the unrefunded Spotlight listing projection'
);

UPDATE public.addon_purchases
SET credits_refunded = 1, refund_status = 'partial_refund'
WHERE id = '40000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT ROW(
      credits_consumed,
      credits_refunded,
      (
        SELECT count(*)
        FROM public.listing_promotion_allocations
        WHERE addon_purchase_id = purchase.id
          AND revoke_reason = 'stripe_refund'
      )
    )::text
    FROM public.addon_purchases purchase
    WHERE id = '40000000-0000-4000-8000-000000000001'
  ),
  '(1,1,1)',
  'replaying the same partial refund is idempotent'
);

UPDATE public.addon_purchases
SET credits_refunded = 2, refund_status = 'refunded', status = 'refunded'
WHERE id = '40000000-0000-4000-8000-000000000001';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE addon_purchase_id = '40000000-0000-4000-8000-000000000001'
      AND status = 'active'
  ),
  0,
  'a full refund leaves no consumed promotion active'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE addon_purchase_id = '40000000-0000-4000-8000-000000000001'
      AND revoke_reason = 'stripe_refund'
  ),
  2,
  'a full refund revokes both consumed single-credit requests'
);

SELECT is(
  (
    SELECT ROW(credits_consumed, credits_refunded)::text
    FROM public.addon_purchases
    WHERE id = '40000000-0000-4000-8000-000000000001'
  ),
  '(0,2)',
  'full refund accounting remains non-negative'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listings
    WHERE id IN (
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )
      AND is_featured = false
      AND featured_until IS NULL
  ),
  2,
  'full refund clears every linked Spotlight projection'
);

UPDATE public.addon_purchases
SET credits_refunded = 1, refund_status = 'refunded', status = 'refunded'
WHERE id = '40000000-0000-4000-8000-000000000002';

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE addon_purchase_id = '40000000-0000-4000-8000-000000000002'
      AND revoke_reason = 'stripe_refund'
  ),
  2,
  'one refunded bundle credit revokes both linked allocations'
);

SELECT is(
  (
    SELECT ROW(credits_consumed, credits_refunded)::text
    FROM public.addon_purchases
    WHERE id = '40000000-0000-4000-8000-000000000002'
  ),
  '(0,1)',
  'bundle refund decrements one consumed credit exactly once'
);

SELECT is(
  (
    SELECT ROW(
      is_featured,
      featured_until IS NULL,
      priority_placement,
      priority_until IS NULL
    )::text
    FROM public.listings
    WHERE id = '30000000-0000-4000-8000-000000000003'
  ),
  '(f,t,0,t)',
  'bundle refund clears both Spotlight and Priority projections'
);

SELECT lives_ok(
  $$
    SELECT public.admin_set_listing_promotions(
      '30000000-0000-4000-8000-000000000009',
      true,
      now() + interval '45 days',
      true,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'admin can atomically enable Spotlight and Priority'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = '30000000-0000-4000-8000-000000000009'
      AND promotion_type IN ('spotlight', 'priority')
      AND source_type = 'admin'
      AND billing_subscription_id IS NULL
      AND addon_purchase_id IS NULL
      AND plan_cycle_start IS NULL
  ),
  2,
  'admin grants overwrite paid provenance for both products'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = '30000000-0000-4000-8000-000000000009'
      AND promotion_type IN ('spotlight', 'priority')
      AND status = 'active'
      AND starts_at < ends_at
      AND revoked_at IS NULL
      AND revoke_reason IS NULL
      AND created_by = '10000000-0000-4000-8000-000000000001'
  ),
  2,
  'admin grants reset lifecycle and actor fields consistently'
);

SELECT is(
  (
    SELECT ROW(is_featured, priority_placement)::text
    FROM public.listings
    WHERE id = '30000000-0000-4000-8000-000000000009'
  ),
  '(t,1)',
  'atomic admin enable projects both products together'
);

SELECT lives_ok(
  $$
    SELECT public.admin_set_listing_promotions(
      '30000000-0000-4000-8000-000000000009',
      false,
      NULL,
      false,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  'admin can atomically remove Spotlight and Priority'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = '30000000-0000-4000-8000-000000000009'
      AND promotion_type IN ('spotlight', 'priority')
      AND status = 'revoked'
      AND revoked_at IS NOT NULL
      AND revoke_reason = 'admin_revoked'
  ),
  2,
  'atomic admin removal records lifecycle revocation for both products'
);

SELECT is(
  (
    SELECT ROW(
      is_featured,
      featured_until IS NULL,
      priority_placement,
      priority_until IS NULL
    )::text
    FROM public.listings
    WHERE id = '30000000-0000-4000-8000-000000000009'
  ),
  '(f,t,0,t)',
  'atomic admin removal clears both projections'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

SELECT throws_ok(
  $$
    SELECT public.activate_listing_promotion(
      '30000000-0000-4000-8000-000000000007',
      'spotlight',
      'refunded-credit-unavailable'
    )
  $$,
  '42501',
  'spotlight_entitlement_required',
  'a refunded add-on credit cannot be consumed by a later activation'
);

SELECT is(
  (
    SELECT credits_consumed
    FROM public.addon_purchases
    WHERE id = '40000000-0000-4000-8000-000000000003'
  ),
  0,
  'rejected activation leaves refunded-credit accounting unchanged'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

SELECT lives_ok(
  $$
    SELECT public.activate_listing_promotion(
      '30000000-0000-4000-8000-000000000001',
      'spotlight',
      'idempotency-fixture'
    )
  $$,
  'the first idempotent promotion request succeeds'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE owner_id = '10000000-0000-4000-8000-000000000001'
      AND request_key = 'idempotency-fixture'
  ),
  1,
  'the first request creates one Spotlight allocation'
);

SELECT ok(
  (
    public.activate_listing_promotion(
      '30000000-0000-4000-8000-000000000001',
      'spotlight',
      'idempotency-fixture'
    )
  ) ? 'allocations',
  'an exact retry returns the existing allocation set'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE owner_id = '10000000-0000-4000-8000-000000000001'
      AND request_key = 'idempotency-fixture'
  ),
  1,
  'an exact retry does not create another allocation'
);

SELECT throws_ok(
  $$
    SELECT public.activate_listing_promotion(
      '30000000-0000-4000-8000-000000000005',
      'spotlight',
      'idempotency-fixture'
    )
  $$,
  '23505',
  'promotion_request_key_conflict',
  'reusing a request key for another listing conflicts deterministically'
);

SELECT throws_ok(
  $$
    SELECT public.activate_listing_promotion(
      '30000000-0000-4000-8000-000000000001',
      'priority',
      'idempotency-fixture'
    )
  $$,
  '23505',
  'promotion_request_key_conflict',
  'reusing a request key for another operation conflicts deterministically'
);

INSERT INTO public.listing_promotion_allocations (
  listing_id,
  owner_id,
  promotion_type,
  source_type,
  request_key,
  starts_at,
  ends_at
)
VALUES (
  '30000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000001',
  'priority',
  'admin',
  'expired-renewal-old',
  now() - interval '31 days',
  now() - interval '1 day'
);

SELECT lives_ok(
  $$
    SELECT public.activate_listing_promotion(
      '30000000-0000-4000-8000-000000000006',
      'priority',
      'expired-renewal-new'
    )
  $$,
  'renewal succeeds without waiting for the expiry cron'
);

SELECT is(
  (
    SELECT status
    FROM public.listing_promotion_allocations
    WHERE request_key = 'expired-renewal-old'
  ),
  'expired',
  'renewal synchronously marks the elapsed allocation expired'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listing_promotion_allocations
    WHERE listing_id = '30000000-0000-4000-8000-000000000006'
      AND promotion_type = 'priority'
      AND status = 'active'
      AND request_key = 'expired-renewal-new'
  ),
  1,
  'renewal inserts the new active allocation'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    UPDATE public.listings
    SET title = 'Ordinary listing edit still works'
    WHERE id = '30000000-0000-4000-8000-000000000006'
  $$,
  'promotion projection guards preserve ordinary listing edits'
);
RESET ROLE;

SELECT is(
  (
    SELECT title
    FROM public.listings
    WHERE id = '30000000-0000-4000-8000-000000000006'
  ),
  'Ordinary listing edit still works',
  'ordinary listing edits persist normally'
);

SELECT * FROM finish();
ROLLBACK;
