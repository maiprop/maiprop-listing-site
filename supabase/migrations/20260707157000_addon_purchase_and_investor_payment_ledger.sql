-- Durable payment ledgers for add-on fulfillment and custom annual investor
-- payment link activation. Stripe webhook writes these rows with the service role.

ALTER TABLE public.investor_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_session_id text,
  ADD COLUMN IF NOT EXISTS activated_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_investor_subscriptions_stripe_session_id
  ON public.investor_subscriptions (stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.addon_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  addon_key text NOT NULL,
  module text NOT NULL,
  audience text NOT NULL,
  unit text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  checkout_mode text NOT NULL CHECK (checkout_mode IN ('payment', 'subscription')),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'active', 'cancelled', 'refunded')),
  stripe_session_id text NOT NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_session_id)
);

ALTER TABLE public.addon_purchases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.addon_purchases FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.addon_purchases FROM authenticated;
GRANT SELECT ON public.addon_purchases TO authenticated;

DROP POLICY IF EXISTS "addon_purchases_select" ON public.addon_purchases;
CREATE POLICY "addon_purchases_select"
  ON public.addon_purchases
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "addon_purchases_no_browser_insert" ON public.addon_purchases;
CREATE POLICY "addon_purchases_no_browser_insert"
  ON public.addon_purchases
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.touch_addon_purchases_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_addon_purchases_updated_at ON public.addon_purchases;
CREATE TRIGGER trg_touch_addon_purchases_updated_at
  BEFORE UPDATE ON public.addon_purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_addon_purchases_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'addon_purchases'
  ) THEN
    RAISE EXCEPTION 'addon_purchases ledger must exist';
  END IF;
END $$;
