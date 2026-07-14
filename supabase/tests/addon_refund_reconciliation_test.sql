BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(16);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES ('a1000000-0000-4000-8000-000000000001');

INSERT INTO public.profiles (user_id, role)
VALUES ('a1000000-0000-4000-8000-000000000001', 'buyer');

SET LOCAL session_replication_role = origin;

SELECT has_table(
  'private',
  'addon_refund_events',
  'immutable add-on refund event ledger exists'
);

SELECT has_column(
  'public',
  'addon_purchases',
  'stripe_amount_total',
  'add-on purchases retain the immutable Stripe checkout total'
);

SELECT has_column(
  'public',
  'addon_purchases',
  'stripe_currency',
  'add-on purchases retain the Stripe checkout currency'
);

SELECT has_column(
  'public',
  'addon_purchases',
  'stripe_charge_id',
  'add-on purchases retain the immutable Stripe charge reference'
);

SELECT has_column(
  'public',
  'addon_purchases',
  'stripe_invoice_id',
  'add-on purchases retain the immutable Stripe invoice reference'
);

SELECT ok(
  to_regprocedure(
    'public.reconcile_addon_refund_event(uuid,text,bigint,bigint,text,text,boolean,jsonb)'
  ) IS NOT NULL,
  'server-only add-on refund reconciliation function exists'
);

SELECT ok(
  NOT COALESCE(
    has_function_privilege(
      'authenticated',
      to_regprocedure(
        'public.reconcile_addon_refund_event(uuid,text,bigint,bigint,text,text,boolean,jsonb)'
      ),
      'EXECUTE'
    ),
    false
  ),
  'authenticated users cannot reconcile Stripe refunds'
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
  stripe_customer_id,
  stripe_payment_intent_id,
  stripe_charge_id,
  stripe_invoice_id,
  stripe_amount_total,
  stripe_currency,
  credits_granted,
  runtime_mode,
  livemode
)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'valuation_bundle',
  'ai_valuation',
  'participant',
  'credit',
  'payment',
  'paid',
  'cs_refund_reconciliation',
  'cus_refund_reconciliation',
  'pi_refund_reconciliation',
  'ch_refund_reconciliation',
  'in_refund_reconciliation',
  1000,
  'eur',
  10,
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live'
);

SELECT lives_ok(
  format(
    $$SELECT public.reconcile_addon_refund_event(
      %L::uuid, %L, 250, 1000, 'succeeded', %L,
      %L::boolean, '{}'::jsonb
    )$$,
    'a2000000-0000-4000-8000-000000000001',
    're_partial_one',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  ),
  'the first successful partial refund is reconciled'
);

SELECT is(
  (
    SELECT credits_refunded
    FROM public.addon_purchases
    WHERE id = 'a2000000-0000-4000-8000-000000000001'
  ),
  2,
  'partial refund credits round up conservatively'
);

SELECT public.reconcile_addon_refund_event(
  'a2000000-0000-4000-8000-000000000001',
  're_partial_one',
  250,
  1000,
  'succeeded',
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live',
  '{}'::jsonb
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM private.addon_refund_events
    WHERE stripe_refund_id = 're_partial_one'
  ),
  1,
  'replaying the same Stripe refund is idempotent'
);

SELECT public.reconcile_addon_refund_event(
  'a2000000-0000-4000-8000-000000000001',
  're_partial_two',
  250,
  1000,
  'succeeded',
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live',
  '{}'::jsonb
);

SELECT is(
  (
    SELECT credits_refunded
    FROM public.addon_purchases
    WHERE id = 'a2000000-0000-4000-8000-000000000001'
  ),
  3,
  'distinct partial refunds accumulate monotonically'
);

SELECT public.reconcile_addon_refund_event(
  'a2000000-0000-4000-8000-000000000001',
  're_partial_two',
  250,
  1000,
  'failed',
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live',
  '{}'::jsonb
);

SELECT is(
  (
    SELECT ROW(credits_refunded, refund_status)::text
    FROM public.addon_purchases
    WHERE id = 'a2000000-0000-4000-8000-000000000001'
  ),
  '(3,partial_refund)',
  'a later failure update cannot restore already-refunded credits'
);

SELECT public.reconcile_addon_refund_event(
  'a2000000-0000-4000-8000-000000000001',
  're_failed',
  100,
  1000,
  'failed',
  public.current_billing_runtime_mode(),
  public.current_billing_runtime_mode() = 'live',
  '{}'::jsonb
);

SELECT is(
  (
    SELECT credits_refunded
    FROM public.addon_purchases
    WHERE id = 'a2000000-0000-4000-8000-000000000001'
  ),
  3,
  'failed refund events do not consume credits'
);

SELECT throws_ok(
  format(
    $$SELECT public.reconcile_addon_refund_event(
      %L::uuid, 're_wrong_runtime', 100, 1000, 'succeeded', %L,
      %L::boolean, '{}'::jsonb
    )$$,
    'a2000000-0000-4000-8000-000000000001',
    CASE public.current_billing_runtime_mode()
      WHEN 'live' THEN 'test'
      ELSE 'live'
    END,
    public.current_billing_runtime_mode() <> 'live'
  ),
  '22023',
  'addon_refund_runtime_mismatch',
  'refund events cannot cross Stripe runtimes'
);

SELECT throws_ok(
  format(
    $$SELECT public.reconcile_addon_refund_event(
      %L::uuid, 're_partial_one', 251, 1000, 'succeeded', %L,
      %L::boolean, '{}'::jsonb
    )$$,
    'a2000000-0000-4000-8000-000000000001',
    public.current_billing_runtime_mode(),
    public.current_billing_runtime_mode() = 'live'
  ),
  '22023',
  'addon_refund_event_identity_mismatch',
  'an immutable Stripe refund id cannot be replayed with a different amount'
);

SELECT is(
  (
    SELECT sum(refunded_amount)::bigint
    FROM private.addon_refund_events
    WHERE purchase_id = 'a2000000-0000-4000-8000-000000000001'
      AND status = 'succeeded'
  ),
  500::bigint,
  'the durable ledger records only the two successful refund amounts'
);

SELECT * FROM finish();
ROLLBACK;
