-- Enforce Stripe runtime/livemode consistency for billing ledgers.
-- The July 2026 live add-on refund confirmed in Stripe used:
-- payment_intent=pi_3TpWcOGfOEgBOxtl0rbH7ZjF
-- checkout_session=cs_live_a1MyyfQxQaNAG88rkbPFxEgQ3gYcva6C7ozO62MvVF0AQKzhbLGOOL4BQy
-- This migration backfills any equivalent prefix-derived drift and prevents
-- future live/test Checkout Session rows from being stored under the wrong
-- runtime mode.

UPDATE public.addon_purchases
SET
  runtime_mode = 'live',
  livemode = TRUE
WHERE stripe_session_id LIKE 'cs_live_%'
  AND (
    runtime_mode <> 'live'
    OR livemode IS NOT TRUE
  );

UPDATE public.addon_purchases
SET
  runtime_mode = 'live',
  livemode = TRUE
WHERE stripe_payment_intent_id = 'pi_3TpWcOGfOEgBOxtl0rbH7ZjF'
  AND (
    runtime_mode <> 'live'
    OR livemode IS NOT TRUE
  );

UPDATE public.addon_purchases
SET
  runtime_mode = 'test',
  livemode = FALSE
WHERE stripe_session_id LIKE 'cs_test_%'
  AND (
    runtime_mode <> 'test'
    OR livemode IS NOT FALSE
  );

DO $$
BEGIN
  ALTER TABLE public.addon_purchases
    DROP CONSTRAINT IF EXISTS addon_purchases_stripe_session_runtime_consistent;

  ALTER TABLE public.addon_purchases
    ADD CONSTRAINT addon_purchases_stripe_session_runtime_consistent
    CHECK (
      stripe_session_id IS NULL
      OR (
        stripe_session_id LIKE 'cs_live_%'
        AND runtime_mode = 'live'
        AND livemode IS TRUE
      )
      OR (
        stripe_session_id LIKE 'cs_test_%'
        AND runtime_mode = 'test'
        AND livemode IS FALSE
      )
      OR (
        stripe_session_id NOT LIKE 'cs_live_%'
        AND stripe_session_id NOT LIKE 'cs_test_%'
      )
    );
END $$;
