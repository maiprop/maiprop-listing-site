-- Stripe add-on refunds are accumulated from immutable event identities.
-- The public purchase row remains the operational balance projection, while
-- this private ledger is the auditable, replay-safe source for refund totals.

ALTER TABLE public.addon_purchases
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS stripe_invoice_id text,
  ADD COLUMN IF NOT EXISTS stripe_amount_total bigint,
  ADD COLUMN IF NOT EXISTS stripe_currency text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.addon_purchases'::regclass
      AND conname = 'addon_purchases_stripe_amount_total_positive'
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_stripe_amount_total_positive
      CHECK (stripe_amount_total IS NULL OR stripe_amount_total > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.addon_purchases'::regclass
      AND conname = 'addon_purchases_stripe_currency_normalized'
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_stripe_currency_normalized
      CHECK (
        stripe_currency IS NULL
        OR stripe_currency ~ '^[a-z]{3}$'
      );
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_addon_purchases_runtime_payment_intent
  ON public.addon_purchases (runtime_mode, stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_addon_purchases_runtime_charge
  ON public.addon_purchases (runtime_mode, stripe_charge_id)
  WHERE stripe_charge_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_addon_purchases_runtime_invoice
  ON public.addon_purchases (runtime_mode, stripe_invoice_id)
  WHERE stripe_invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS private.addon_refund_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_id uuid NOT NULL
    REFERENCES public.addon_purchases(id) ON DELETE CASCADE,
  stripe_refund_id text NOT NULL,
  refunded_amount bigint NOT NULL CHECK (refunded_amount > 0),
  total_amount bigint NOT NULL CHECK (total_amount > 0),
  status text NOT NULL CHECK (
    status IN ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')
  ),
  runtime_mode text NOT NULL CHECK (runtime_mode IN ('test', 'live')),
  livemode boolean NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  UNIQUE (runtime_mode, stripe_refund_id),
  CHECK (
    (runtime_mode = 'live' AND livemode = true)
    OR (runtime_mode = 'test' AND livemode = false)
  )
);

CREATE INDEX IF NOT EXISTS idx_addon_refund_events_purchase_status
  ON private.addon_refund_events (purchase_id, status);

REVOKE ALL ON TABLE private.addon_refund_events
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_addon_refund_event(
  p_purchase_id uuid,
  p_stripe_refund_id text,
  p_refunded_amount bigint,
  p_total_amount bigint,
  p_status text,
  p_runtime_mode text,
  p_livemode boolean,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_purchase public.addon_purchases%ROWTYPE;
  v_existing private.addon_refund_events%ROWTYPE;
  v_status text := lower(btrim(COALESCE(p_status, '')));
  v_successful_amount bigint := 0;
  v_credits_refunded integer := 0;
  v_refund_status text := 'none';
BEGIN
  IF p_purchase_id IS NULL OR NULLIF(btrim(p_stripe_refund_id), '') IS NULL THEN
    RAISE EXCEPTION 'addon_refund_identity_required' USING ERRCODE = '22023';
  END IF;

  IF p_refunded_amount IS NULL OR p_refunded_amount <= 0
     OR p_total_amount IS NULL OR p_total_amount <= 0
     OR p_refunded_amount > p_total_amount THEN
    RAISE EXCEPTION 'addon_refund_amount_invalid' USING ERRCODE = '22023';
  END IF;

  IF v_status NOT IN (
    'pending', 'requires_action', 'succeeded', 'failed', 'canceled'
  ) THEN
    RAISE EXCEPTION 'addon_refund_status_invalid' USING ERRCODE = '22023';
  END IF;

  IF p_runtime_mode <> public.current_billing_runtime_mode()
     OR p_livemode <> (p_runtime_mode = 'live') THEN
    RAISE EXCEPTION 'addon_refund_runtime_mismatch' USING ERRCODE = '22023';
  END IF;

  -- Activation also takes these locks before touching a purchase row. Lock
  -- all listings consumed by this purchase in UUID order so a refund cannot
  -- deadlock with concurrent activation or expiry.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('listing_promotion:' || candidate.listing_id::text, 0)
  )
  FROM (
    SELECT DISTINCT allocation.listing_id
    FROM public.listing_promotion_allocations AS allocation
    WHERE allocation.addon_purchase_id = p_purchase_id
    ORDER BY allocation.listing_id
  ) AS candidate;

  SELECT purchase.*
  INTO v_purchase
  FROM public.addon_purchases AS purchase
  WHERE purchase.id = p_purchase_id
  FOR UPDATE;

  IF v_purchase.id IS NULL THEN
    RAISE EXCEPTION 'addon_purchase_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_purchase.runtime_mode <> p_runtime_mode
     OR v_purchase.livemode <> p_livemode THEN
    RAISE EXCEPTION 'addon_refund_runtime_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_purchase.stripe_amount_total IS NOT NULL
     AND v_purchase.stripe_amount_total <> p_total_amount THEN
    RAISE EXCEPTION 'addon_refund_total_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_purchase.stripe_charge_id IS NOT NULL
     AND NULLIF(p_metadata ->> 'charge_id', '') IS NOT NULL
     AND v_purchase.stripe_charge_id <> p_metadata ->> 'charge_id' THEN
    RAISE EXCEPTION 'addon_refund_charge_mismatch' USING ERRCODE = '22023';
  END IF;

  IF v_purchase.stripe_invoice_id IS NOT NULL
     AND NULLIF(p_metadata ->> 'invoice_id', '') IS NOT NULL
     AND v_purchase.stripe_invoice_id <> p_metadata ->> 'invoice_id' THEN
    RAISE EXCEPTION 'addon_refund_invoice_mismatch' USING ERRCODE = '22023';
  END IF;

  SELECT refund_event.*
  INTO v_existing
  FROM private.addon_refund_events AS refund_event
  WHERE refund_event.runtime_mode = p_runtime_mode
    AND refund_event.stripe_refund_id = p_stripe_refund_id
  FOR UPDATE;

  IF v_existing.id IS NOT NULL THEN
    IF v_existing.purchase_id <> p_purchase_id
       OR v_existing.refunded_amount <> p_refunded_amount
       OR v_existing.total_amount <> p_total_amount
       OR v_existing.livemode <> p_livemode THEN
      RAISE EXCEPTION 'addon_refund_event_identity_mismatch'
        USING ERRCODE = '22023';
    END IF;

    UPDATE private.addon_refund_events
    SET
      status = CASE
        WHEN status = 'succeeded' THEN status
        ELSE v_status
      END,
      metadata = metadata || COALESCE(p_metadata, '{}'::jsonb),
      updated_at = transaction_timestamp()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO private.addon_refund_events (
      purchase_id,
      stripe_refund_id,
      refunded_amount,
      total_amount,
      status,
      runtime_mode,
      livemode,
      metadata
    ) VALUES (
      p_purchase_id,
      p_stripe_refund_id,
      p_refunded_amount,
      p_total_amount,
      v_status,
      p_runtime_mode,
      p_livemode,
      COALESCE(p_metadata, '{}'::jsonb)
    );
  END IF;

  SELECT LEAST(
    p_total_amount,
    COALESCE(sum(refund_event.refunded_amount), 0)::bigint
  )
  INTO v_successful_amount
  FROM private.addon_refund_events AS refund_event
  WHERE refund_event.purchase_id = p_purchase_id
    AND refund_event.status = 'succeeded';

  IF v_successful_amount > 0 THEN
    v_credits_refunded := LEAST(
      v_purchase.credits_granted,
      (
        (v_purchase.credits_granted::bigint * v_successful_amount)
        + p_total_amount - 1
      ) / p_total_amount
    )::integer;
  END IF;

  v_credits_refunded := GREATEST(
    v_purchase.credits_refunded,
    v_credits_refunded
  );

  v_refund_status := CASE
    WHEN v_credits_refunded >= v_purchase.credits_granted
      AND v_purchase.credits_granted > 0 THEN 'refunded'
    WHEN v_credits_refunded > 0 THEN 'partial_refund'
    WHEN EXISTS (
      SELECT 1
      FROM private.addon_refund_events AS refund_event
      WHERE refund_event.purchase_id = p_purchase_id
        AND refund_event.status = 'failed'
    ) THEN 'failed'
    ELSE 'none'
  END;

  UPDATE public.addon_purchases
  SET
    stripe_amount_total = COALESCE(stripe_amount_total, p_total_amount),
    stripe_charge_id = COALESCE(
      stripe_charge_id,
      NULLIF(p_metadata ->> 'charge_id', '')
    ),
    stripe_invoice_id = COALESCE(
      stripe_invoice_id,
      NULLIF(p_metadata ->> 'invoice_id', '')
    ),
    stripe_currency = COALESCE(
      stripe_currency,
      lower(NULLIF(p_metadata ->> 'currency', ''))
    ),
    credits_refunded = v_credits_refunded,
    refund_status = v_refund_status,
    status = CASE
      WHEN v_refund_status = 'refunded' THEN 'refunded'
      ELSE status
    END,
    last_refund_id = CASE
      WHEN v_status = 'succeeded' THEN p_stripe_refund_id
      ELSE last_refund_id
    END,
    refunded_at = CASE
      WHEN v_status = 'succeeded' THEN transaction_timestamp()
      ELSE refunded_at
    END,
    updated_at = transaction_timestamp()
  WHERE id = p_purchase_id;

  RETURN jsonb_build_object(
    'purchase_id', p_purchase_id,
    'refund_id', p_stripe_refund_id,
    'successful_refunded_amount', v_successful_amount,
    'credits_refunded', v_credits_refunded,
    'refund_status', v_refund_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_addon_refund_event(
  uuid, text, bigint, bigint, text, text, boolean, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_addon_refund_event(
  uuid, text, bigint, bigint, text, text, boolean, jsonb
) TO service_role;

COMMENT ON FUNCTION public.reconcile_addon_refund_event(
  uuid, text, bigint, bigint, text, text, boolean, jsonb
) IS
  'Server-only, replay-safe projection of immutable Stripe refund events into add-on credit balances.';
