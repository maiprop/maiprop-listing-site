CREATE TABLE IF NOT EXISTS public.subscription_trial_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_key text NOT NULL CHECK (plan_key ~ '^[a-z][a-z0-9_]*$'),
  pricing_audience text NOT NULL CHECK (
    pricing_audience IN ('participant', 'agent', 'developer', 'professional')
  ),
  stripe_customer_id text,
  stripe_checkout_session_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  status text NOT NULL DEFAULT 'checkout_started' CHECK (
    status IN (
      'checkout_started',
      'checkout_created',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    )
  ),
  trial_days integer NOT NULL DEFAULT 7 CHECK (trial_days = 7),
  claimed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id)
);

ALTER TABLE public.subscription_trial_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_trial_claims_select_own" ON public.subscription_trial_claims;
CREATE POLICY "subscription_trial_claims_select_own"
  ON public.subscription_trial_claims
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.subscription_trial_claims FROM anon, authenticated;
GRANT SELECT ON TABLE public.subscription_trial_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscription_trial_claims TO service_role;

CREATE INDEX IF NOT EXISTS idx_subscription_trial_claims_user_id
  ON public.subscription_trial_claims (user_id);

CREATE INDEX IF NOT EXISTS idx_subscription_trial_claims_status
  ON public.subscription_trial_claims (status);

CREATE INDEX IF NOT EXISTS idx_subscription_trial_claims_customer_id
  ON public.subscription_trial_claims (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
