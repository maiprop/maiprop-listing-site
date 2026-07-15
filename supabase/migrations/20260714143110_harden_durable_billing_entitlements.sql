-- Make durable billing state authoritative, ordered and fail-closed.

ALTER TABLE public.billing_subscriptions
  ADD COLUMN IF NOT EXISTS state_source text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS state_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS stripe_event_created_at timestamptz;

UPDATE public.billing_subscriptions
SET state_observed_at = COALESCE(updated_at, created_at, now())
WHERE state_observed_at IS NULL;

ALTER TABLE public.billing_subscriptions
  ALTER COLUMN state_observed_at SET DEFAULT now(),
  ALTER COLUMN state_observed_at SET NOT NULL;

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_state_source_check;
ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_state_source_check
  CHECK (state_source IN ('legacy', 'webhook_canonical', 'reconciliation'));

CREATE OR REPLACE FUNCTION private.repair_billing_subscription_canonical_fields()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  WITH candidates AS (
    SELECT
      bs.id,
      pc.key AS plan_key,
      CASE
        WHEN pc.audience IN ('buyer', 'seller', 'participant', 'pro', 'user')
          THEN 'participant'
        ELSE pc.audience
      END AS audience,
      pc.metadata ->> 'stripe_product_id' AS product_id,
      COALESCE(
        bs.stripe_price_id,
        CASE
          WHEN bs.billing_cycle = 'annual' THEN COALESCE(
            pc.metadata ->> 'stripe_price_id_annual',
            pc.metadata ->> 'stripe_annual_price_id',
            pc.metadata ->> 'stripe_price_id_yearly',
            pc.metadata ->> 'stripe_yearly_price_id'
          )
          ELSE COALESCE(
            pc.metadata ->> 'stripe_price_id_monthly',
            pc.metadata ->> 'stripe_monthly_price_id',
            pc.metadata ->> 'stripe_price_id'
          )
        END
      ) AS price_id,
      row_number() OVER (
        PARTITION BY bs.id
        ORDER BY pc.sort_order, pc.key
      ) AS candidate_rank
    FROM public.billing_subscriptions bs
    JOIN public.pricing_configs pc
      ON pc.is_active
     AND pc.module IN (
       'user_subscription',
       'agent_subscription',
       'developer_subscription',
       'professional_subscription'
     )
     AND (
       bs.stripe_product_id = pc.metadata ->> 'stripe_product_id'
       OR bs.stripe_price_id IN (
         pc.metadata ->> 'stripe_price_id',
         pc.metadata ->> 'stripe_price_id_monthly',
         pc.metadata ->> 'stripe_monthly_price_id',
         pc.metadata ->> 'stripe_price_id_annual',
         pc.metadata ->> 'stripe_annual_price_id',
         pc.metadata ->> 'stripe_price_id_yearly',
         pc.metadata ->> 'stripe_yearly_price_id'
       )
       OR COALESCE(bs.plan_key, bs.metadata ->> 'plan_key', bs.metadata ->> 'plan') = pc.key
     )
  ), canonical AS (
    SELECT * FROM candidates WHERE candidate_rank = 1
  )
  UPDATE public.billing_subscriptions bs
  SET
    plan_key = canonical.plan_key,
    audience = canonical.audience,
    stripe_product_id = COALESCE(bs.stripe_product_id, canonical.product_id),
    stripe_price_id = COALESCE(bs.stripe_price_id, canonical.price_id)
  FROM canonical
  WHERE bs.id = canonical.id
    AND (
      bs.plan_key IS NULL
      OR bs.audience IS NULL
      OR bs.stripe_product_id IS NULL
      OR bs.stripe_price_id IS NULL
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION private.repair_billing_subscription_canonical_fields()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.repair_billing_subscription_canonical_fields()
  TO service_role;

SELECT private.repair_billing_subscription_canonical_fields();

-- Existing unresolved rows must never continue to grant paid access.
UPDATE public.billing_subscriptions
SET
  status = 'incomplete',
  metadata = metadata || jsonb_build_object(
    'durable_state_repair', 'demoted_unbounded_or_noncanonical',
    'durable_state_repaired_at', now()
  )
WHERE status IN ('active', 'past_due')
  AND (
    current_period_end IS NULL
    OR plan_key IS NULL
    OR audience IS NULL
    OR stripe_product_id IS NULL
    OR stripe_price_id IS NULL
  );

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_active_period_bounded;
ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_active_period_bounded
  CHECK (
    status NOT IN ('active', 'past_due')
    OR current_period_end IS NOT NULL
  );

ALTER TABLE public.billing_subscriptions
  DROP CONSTRAINT IF EXISTS billing_subscriptions_active_canonical;
ALTER TABLE public.billing_subscriptions
  ADD CONSTRAINT billing_subscriptions_active_canonical
  CHECK (
    status NOT IN ('active', 'past_due')
    OR (
      plan_key IS NOT NULL
      AND audience IS NOT NULL
      AND stripe_product_id IS NOT NULL
      AND stripe_price_id IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION private.guard_billing_subscription_state_order()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public, private
AS $$
BEGIN
  IF OLD.stripe_event_created_at IS NOT NULL
     AND NEW.stripe_event_created_at IS NOT NULL
     AND NEW.stripe_event_created_at < OLD.stripe_event_created_at THEN
    RETURN OLD;
  END IF;

  IF NEW.state_observed_at < OLD.state_observed_at THEN
    RETURN OLD;
  END IF;

  -- Reconciliation has no Stripe event timestamp. Preserve the latest event
  -- watermark so a subsequently delivered stale event remains rejectable.
  IF NEW.stripe_event_created_at IS NULL THEN
    NEW.stripe_event_created_at := OLD.stripe_event_created_at;
    NEW.stripe_event_id := OLD.stripe_event_id;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_billing_subscription_state_order()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_00_guard_billing_subscription_state_order
  ON public.billing_subscriptions;
CREATE TRIGGER trg_00_guard_billing_subscription_state_order
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_billing_subscription_state_order();

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_entitlement_lookup
  ON public.billing_subscriptions (
    user_id,
    runtime_mode,
    livemode,
    audience,
    status,
    updated_at DESC,
    id
  )
  WHERE status IN ('active', 'trialing', 'past_due');

CREATE OR REPLACE FUNCTION public.current_billing_runtime_mode()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_runtime_mode text;
BEGIN
  SELECT runtime_mode
  INTO v_runtime_mode
  FROM private.billing_runtime_config
  WHERE singleton;

  IF v_runtime_mode IS NULL THEN
    RAISE EXCEPTION 'billing_runtime_mode_not_configured'
      USING ERRCODE = '55000';
  END IF;
  RETURN v_runtime_mode;
END;
$$;

REVOKE ALL ON FUNCTION public.current_billing_runtime_mode()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_billing_runtime_mode() TO service_role;

COMMENT ON COLUMN public.billing_subscriptions.stripe_event_created_at IS
  'Stripe event creation watermark used to reject out-of-order state updates.';
COMMENT ON COLUMN public.billing_subscriptions.state_observed_at IS
  'Time the canonical Stripe subscription state was observed by a trusted server path.';
