-- =============================================================================
-- 20260628215500_fix_live_supabase_advisor_drift.sql
-- =============================================================================
-- Close live Supabase advisor drift seen by release safety on 2026-06-28:
--
-- 1. rls_enabled_no_policy on public.stripe_webhook_events
--    This table stores webhook processing/audit rows and must remain
--    service-role only. Add an explicit deny-all policy for browser roles so
--    the intent is visible to Postgres/Supabase Advisor instead of relying on
--    "RLS enabled with no policies" semantics.
--
-- 2. authenticated_security_definer_function_executable on legacy/base plan
--    limit helpers. Current app and Edge source do not call these base helpers
--    from the browser; service functions own quota enforcement. Remove
--    anon/authenticated execution and leave service_role execution available.
--
-- 3. duplicate_index on billing Stripe IDs. The *_key unique constraint
--    indexes already support equality lookups and uniqueness, so drop only the
--    redundant plain secondary indexes when the matching unique index exists.
-- =============================================================================

DO $$
BEGIN
  IF to_regclass('public.stripe_webhook_events') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY';

    EXECUTE 'DROP POLICY IF EXISTS "stripe_webhook_events_no_client_access" ON public.stripe_webhook_events';

    EXECUTE $policy$
      CREATE POLICY "stripe_webhook_events_no_client_access"
        ON public.stripe_webhook_events
        AS RESTRICTIVE
        FOR ALL
        TO public
        USING (false)
        WITH CHECK (false)
    $policy$;

    EXECUTE $comment$
      COMMENT ON POLICY "stripe_webhook_events_no_client_access"
        ON public.stripe_webhook_events IS
        'Explicit deny-all for browser roles. Stripe webhook audit writes use service-role execution; browser reads/writes remain blocked.'
    $comment$;
  END IF;
END $$;

DO $$
DECLARE
  function_signature TEXT;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_ai_call_monthly_base_limit(uuid,text)',
    'public.get_report_monthly_base_limit(uuid)'
  ]
  LOOP
    IF to_regprocedure(function_signature) IS NOT NULL THEN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated',
        function_signature
      );
      EXECUTE format(
        'GRANT EXECUTE ON FUNCTION %s TO service_role',
        function_signature
      );
      EXECUTE format(
        'COMMENT ON FUNCTION %s IS %L',
        function_signature,
        'Service-role-only quota base helper. Browser quota access must use Edge/service boundaries.'
      );
    END IF;
  END LOOP;
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
