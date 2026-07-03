-- Complete Stripe billing hardening:
-- - refund-aware add-on credit accounting
-- - runtime/livemode separation on compatibility ledgers
-- - retry-safe trial reservations for abandoned Checkout sessions

ALTER TABLE public.addon_purchases
  ADD COLUMN IF NOT EXISTS credits_refunded integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS last_refund_id text,
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS runtime_mode text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addon_purchases_credits_refunded_nonnegative'
      AND conrelid = 'public.addon_purchases'::regclass
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_credits_refunded_nonnegative
      CHECK (credits_refunded >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addon_purchases_refund_status_valid'
      AND conrelid = 'public.addon_purchases'::regclass
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_refund_status_valid
      CHECK (refund_status IN ('none', 'partial_refund', 'refunded', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'addon_purchases_runtime_mode_valid'
      AND conrelid = 'public.addon_purchases'::regclass
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_runtime_mode_valid
      CHECK (runtime_mode IN ('test', 'live'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_addon_purchases_payment_intent
  ON public.addon_purchases (stripe_payment_intent_id)
  WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_addon_purchases_runtime_credit_lookup
  ON public.addon_purchases (user_id, runtime_mode, status, addon_key, created_at)
  WHERE credits_granted - credits_consumed - credits_refunded <> 0;

ALTER TABLE public.investor_subscriptions
  ADD COLUMN IF NOT EXISTS runtime_mode text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'investor_subscriptions_runtime_mode_valid'
      AND conrelid = 'public.investor_subscriptions'::regclass
  ) THEN
    ALTER TABLE public.investor_subscriptions
      ADD CONSTRAINT investor_subscriptions_runtime_mode_valid
      CHECK (runtime_mode IN ('test', 'live'));
  END IF;
END $$;

ALTER TABLE public.subscription_trial_claims
  ADD COLUMN IF NOT EXISTS runtime_mode text NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false;

-- Preserve known Stripe mode on existing compatibility rows. Manual investor
-- access in the live production project has no Stripe session yet, so keep it
-- visible to live billing reads instead of defaulting it into test mode.
UPDATE public.addon_purchases
SET
  runtime_mode = CASE
    WHEN stripe_session_id LIKE 'cs_live_%' THEN 'live'
    WHEN stripe_session_id LIKE 'cs_test_%' THEN 'test'
    ELSE runtime_mode
  END,
  livemode = CASE
    WHEN stripe_session_id LIKE 'cs_live_%' THEN true
    WHEN stripe_session_id LIKE 'cs_test_%' THEN false
    ELSE livemode
  END;

UPDATE public.investor_subscriptions
SET
  runtime_mode = CASE
    WHEN stripe_session_id LIKE 'cs_live_%' THEN 'live'
    WHEN stripe_session_id LIKE 'cs_test_%' THEN 'test'
    WHEN stripe_session_id IS NULL
      AND stripe_customer_id IS NULL
      AND status IN ('active', 'trial', 'pending_payment') THEN 'live'
    ELSE runtime_mode
  END,
  livemode = CASE
    WHEN stripe_session_id LIKE 'cs_live_%' THEN true
    WHEN stripe_session_id LIKE 'cs_test_%' THEN false
    WHEN stripe_session_id IS NULL
      AND stripe_customer_id IS NULL
      AND status IN ('active', 'trial', 'pending_payment') THEN true
    ELSE livemode
  END;

UPDATE public.subscription_trial_claims
SET
  runtime_mode = CASE
    WHEN stripe_checkout_session_id LIKE 'cs_live_%' THEN 'live'
    WHEN stripe_checkout_session_id LIKE 'cs_test_%' THEN 'test'
    ELSE runtime_mode
  END,
  livemode = CASE
    WHEN stripe_checkout_session_id LIKE 'cs_live_%' THEN true
    WHEN stripe_checkout_session_id LIKE 'cs_test_%' THEN false
    ELSE livemode
  END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscription_trial_claims_runtime_mode_valid'
      AND conrelid = 'public.subscription_trial_claims'::regclass
  ) THEN
    ALTER TABLE public.subscription_trial_claims
      ADD CONSTRAINT subscription_trial_claims_runtime_mode_valid
      CHECK (runtime_mode IN ('test', 'live'));
  END IF;
END $$;

ALTER TABLE public.subscription_trial_claims
  DROP CONSTRAINT IF EXISTS subscription_trial_claims_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_trial_claims_one_open_per_user_runtime
  ON public.subscription_trial_claims (user_id, runtime_mode)
  WHERE status IN ('checkout_started', 'checkout_created');

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_trial_claims_one_started_per_user_runtime
  ON public.subscription_trial_claims (user_id, runtime_mode)
  WHERE status IN ('trialing', 'active', 'past_due', 'canceled', 'expired');

CREATE INDEX IF NOT EXISTS idx_subscription_trial_claims_session_runtime
  ON public.subscription_trial_claims (stripe_checkout_session_id, runtime_mode)
  WHERE stripe_checkout_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_addon_credit_balance(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(credits_granted - credits_consumed - credits_refunded), 0)::integer
  FROM public.addon_purchases
  WHERE user_id = p_user_id
    AND status IN ('paid', 'active', 'refunded')
    AND public.addon_credit_bucket(addon_key) = p_bucket
$$;

CREATE OR REPLACE FUNCTION public.get_available_addon_credits(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(public.get_addon_credit_balance(p_user_id, p_bucket), 0)
$$;

CREATE OR REPLACE FUNCTION public.consume_addon_credit_for_user(
  p_user_id uuid,
  p_bucket text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid;
  v_balance integer;
BEGIN
  v_balance := public.get_addon_credit_balance(p_user_id, p_bucket);
  IF v_balance <= 0 THEN
    RETURN false;
  END IF;

  SELECT id
  INTO v_purchase_id
  FROM public.addon_purchases
  WHERE user_id = p_user_id
    AND status IN ('paid', 'active')
    AND credits_granted - credits_consumed - credits_refunded > 0
    AND public.addon_credit_bucket(addon_key) = p_bucket
  ORDER BY created_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_purchase_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.addon_purchases
  SET credits_consumed = credits_consumed + 1
  WHERE id = v_purchase_id
    AND credits_granted - credits_consumed - credits_refunded > 0;

  RETURN FOUND;
END;
$$;

ALTER TABLE public.addon_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investor_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_trial_claims ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.addon_purchases FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.addon_purchases FROM authenticated;
GRANT SELECT ON TABLE public.addon_purchases TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addon_purchases TO service_role;

REVOKE ALL ON FUNCTION public.get_addon_credit_balance(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_available_addon_credits(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_addon_credit_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_addon_credit_balance(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_addon_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_addon_credit_for_user(uuid, text) TO service_role;

COMMENT ON COLUMN public.addon_purchases.credits_refunded IS
  'Number of delivered add-on credits reversed by Stripe refunds. May exceed unused credits, creating a negative add-on balance.';
COMMENT ON COLUMN public.addon_purchases.refund_status IS
  'Stripe refund state for the purchase: none, partial_refund, refunded, or failed.';
COMMENT ON COLUMN public.addon_purchases.runtime_mode IS
  'Stripe runtime that created the row: test or live. Primary isolation remains separate Supabase projects.';
COMMENT ON FUNCTION public.get_addon_credit_balance(uuid, text) IS
  'Returns signed add-on balance after consumption and refunds; negative values represent refunded consumed credits owed by the user.';
COMMENT ON FUNCTION public.get_available_addon_credits(uuid, text) IS
  'Returns nonnegative add-on credits available for quota math while signed debt is enforced by consume_addon_credit_for_user.';
