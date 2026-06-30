-- Follow-up for billing advisor drift that can remain on databases where the
-- earlier advisor-fix migration already ran before the final billing shape.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.stripe_webhook_events') IS NOT NULL THEN
    ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "stripe_webhook_events_no_client_access"
      ON public.stripe_webhook_events;

    CREATE POLICY "stripe_webhook_events_no_client_access"
      ON public.stripe_webhook_events
      AS PERMISSIVE
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false);

    COMMENT ON POLICY "stripe_webhook_events_no_client_access"
      ON public.stripe_webhook_events IS
      'Explicit deny-all for browser roles. Stripe webhook audit writes use service-role execution; browser reads/writes remain blocked.';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.billing_customers_stripe_customer_id_key') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_billing_customers_stripe_customer_id;
  END IF;

  IF to_regclass('public.billing_subscriptions_stripe_subscription_id_key') IS NOT NULL THEN
    DROP INDEX IF EXISTS public.idx_billing_subscriptions_stripe_subscription_id;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.stripe_webhook_events') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_policy
       WHERE polrelid = 'public.stripe_webhook_events'::regclass
         AND polname = 'stripe_webhook_events_no_client_access'
         AND polpermissive IS TRUE
     ) THEN
    RAISE EXCEPTION 'stripe_webhook_events deny policy must exist as a permissive deny-all policy';
  END IF;

  IF to_regclass('public.billing_customers_stripe_customer_id_key') IS NOT NULL
     AND to_regclass('public.idx_billing_customers_stripe_customer_id') IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate billing_customers Stripe customer index still exists';
  END IF;

  IF to_regclass('public.billing_subscriptions_stripe_subscription_id_key') IS NOT NULL
     AND to_regclass('public.idx_billing_subscriptions_stripe_subscription_id') IS NOT NULL THEN
    RAISE EXCEPTION 'duplicate billing_subscriptions Stripe subscription index still exists';
  END IF;
END $$;

COMMIT;
