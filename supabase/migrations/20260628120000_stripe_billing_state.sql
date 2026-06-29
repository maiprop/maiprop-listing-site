-- Durable Stripe billing state for test-mode-first full billing integration.
-- Stripe remains the source of truth; these tables store the latest verified
-- webhook state so UI/RLS checks do not depend on synchronous Stripe reads.

CREATE TABLE IF NOT EXISTS public.billing_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  email text,
  runtime_mode text NOT NULL DEFAULT 'test' CHECK (runtime_mode IN ('test', 'live')),
  livemode boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_customer_id),
  UNIQUE (user_id, runtime_mode)
);

CREATE TABLE IF NOT EXISTS public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text NOT NULL,
  stripe_product_id text,
  stripe_price_id text,
  plan_key text,
  audience text,
  status text NOT NULL,
  billing_cycle text CHECK (billing_cycle IN ('monthly', 'annual')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  trial_start timestamptz,
  trial_end timestamptz,
  runtime_mode text NOT NULL DEFAULT 'test' CHECK (runtime_mode IN ('test', 'live')),
  livemode boolean NOT NULL DEFAULT false,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_subscription_id)
);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  api_version text,
  runtime_mode text NOT NULL DEFAULT 'test' CHECK (runtime_mode IN ('test', 'live')),
  livemode boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'failed', 'skipped')),
  processed_at timestamptz,
  error text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_billing_customers_user_id
  ON public.billing_customers (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_customers_stripe_customer_id
  ON public.billing_customers (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_user_status
  ON public.billing_subscriptions (user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_subscriptions_stripe_subscription_id
  ON public.billing_subscriptions (stripe_subscription_id);

CREATE INDEX IF NOT EXISTS idx_billing_subscriptions_customer_id
  ON public.billing_subscriptions (stripe_customer_id);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status
  ON public.stripe_webhook_events (status, created_at DESC);

ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.billing_customers FROM anon, authenticated;
REVOKE ALL ON public.billing_subscriptions FROM anon, authenticated;
REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_customers FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_subscriptions FROM authenticated;

GRANT SELECT ON public.billing_customers TO authenticated;
GRANT SELECT ON public.billing_subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_customers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.billing_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_webhook_events TO service_role;

DROP POLICY IF EXISTS billing_customers_select_own ON public.billing_customers;
CREATE POLICY billing_customers_select_own
  ON public.billing_customers
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS billing_customers_no_browser_insert ON public.billing_customers;
CREATE POLICY billing_customers_no_browser_insert
  ON public.billing_customers
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS billing_customers_no_browser_update ON public.billing_customers;
CREATE POLICY billing_customers_no_browser_update
  ON public.billing_customers
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS billing_subscriptions_select_own ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_select_own
  ON public.billing_subscriptions
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS billing_subscriptions_no_browser_insert ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_no_browser_insert
  ON public.billing_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS billing_subscriptions_no_browser_update ON public.billing_subscriptions;
CREATE POLICY billing_subscriptions_no_browser_update
  ON public.billing_subscriptions
  FOR UPDATE
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.touch_stripe_billing_state_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_billing_customers_updated_at ON public.billing_customers;
CREATE TRIGGER trg_touch_billing_customers_updated_at
  BEFORE UPDATE ON public.billing_customers
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_stripe_billing_state_updated_at();

DROP TRIGGER IF EXISTS trg_touch_billing_subscriptions_updated_at ON public.billing_subscriptions;
CREATE TRIGGER trg_touch_billing_subscriptions_updated_at
  BEFORE UPDATE ON public.billing_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_stripe_billing_state_updated_at();

DROP TRIGGER IF EXISTS trg_touch_stripe_webhook_events_updated_at ON public.stripe_webhook_events;
CREATE TRIGGER trg_touch_stripe_webhook_events_updated_at
  BEFORE UPDATE ON public.stripe_webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_stripe_billing_state_updated_at();

COMMENT ON TABLE public.billing_customers IS
  'Latest verified Stripe customer mapping per user and Stripe runtime mode. Written only by service-role Edge Functions.';

COMMENT ON TABLE public.billing_subscriptions IS
  'Latest verified Stripe subscription state from signed webhooks or explicit reconciliation. Written only by service-role Edge Functions.';

COMMENT ON TABLE public.stripe_webhook_events IS
  'Idempotency and audit ledger for signed Stripe webhook events. Not exposed to browser roles.';
