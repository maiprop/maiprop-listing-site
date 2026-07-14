BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(31);

SELECT ok(
  NOT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)'::regprocedure
  ),
  'public admin promotion RPC is SECURITY INVOKER'
);

SELECT ok(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'private.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)'::regprocedure
  ),
  'private admin promotion implementation is SECURITY DEFINER'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'service role can call the public admin wrapper'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'authenticated browser role cannot call the admin wrapper'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'private.admin_set_listing_promotion(uuid,text,boolean,timestamp with time zone,uuid)',
    'EXECUTE'
  ),
  'service role can call the private admin implementation'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'private.sync_listing_promotion_projection(uuid)',
    'EXECUTE'
  ),
  'service role can call private projection sync'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

INSERT INTO public.profiles (user_id, role, is_platform_admin)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'admin', true),
  ('10000000-0000-4000-8000-000000000002', 'seller', false);

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
  );

UPDATE public.addon_purchases
SET status = 'paid', credits_refunded = 1, refund_status = 'partial_refund'
WHERE id = '40000000-0000-4000-8000-000000000003';

SET LOCAL session_replication_role = origin;

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
