BEGIN;

-- A Stripe Checkout session that expires before creating a subscription has
-- not consumed the customer's one-time Pro trial. Keep that state distinct
-- from a trial that started and later expired.
ALTER TABLE public.subscription_trial_claims
  DROP CONSTRAINT IF EXISTS subscription_trial_claims_status_check;

ALTER TABLE public.subscription_trial_claims
  ADD CONSTRAINT subscription_trial_claims_status_check
  CHECK (
    status IN (
      'checkout_started',
      'checkout_created',
      'checkout_abandoned',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'expired'
    )
  ) NOT VALID;

UPDATE public.subscription_trial_claims
SET status = 'checkout_abandoned',
    updated_at = now(),
    metadata = metadata || jsonb_build_object(
      'checkout_expired_at',
      COALESCE(
        metadata ->> 'checkout_expired_at',
        (claimed_at + interval '24 hours')::text
      )
    )
WHERE stripe_subscription_id IS NULL
  AND (
    (
      status = 'expired'
      AND metadata ? 'checkout_expired_at'
    )
    OR (
      status IN ('checkout_started', 'checkout_created')
      AND runtime_mode = 'test'
      AND livemode = false
      AND claimed_at <= now() - interval '24 hours'
    )
  );

ALTER TABLE public.subscription_trial_claims
  VALIDATE CONSTRAINT subscription_trial_claims_status_check;

-- Every state except a Stripe-confirmed abandoned checkout consumes or
-- reserves the one trial for this account/runtime. This single invariant
-- prevents a canceled or expired trial from coexisting with a new reservation.
DROP INDEX IF EXISTS public.idx_subscription_trial_claims_one_open_per_user_runtime;
DROP INDEX IF EXISTS public.idx_subscription_trial_claims_one_started_per_user_runtime;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.subscription_trial_claims
    WHERE status <> 'checkout_abandoned'
    GROUP BY user_id, runtime_mode
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'subscription trial ledger contains multiple non-abandoned claims for one account/runtime';
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subscription_trial_claims_one_non_abandoned_per_user_runtime
  ON public.subscription_trial_claims (user_id, runtime_mode)
  WHERE status <> 'checkout_abandoned';

COMMIT;
