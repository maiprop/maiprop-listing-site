CREATE OR REPLACE FUNCTION public.resolve_subscription_state_for_service(
  p_user_id uuid,
  p_required_stripe_subscription_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_runtime_mode text := public.current_billing_runtime_mode();
  v_audience text;
  v_billing public.billing_subscriptions%ROWTYPE;
  v_investor public.investor_subscriptions%ROWTYPE;
BEGIN
  SELECT public.profile_pricing_audience(
    profile.role,
    profile.participant_type::text
  )
  INTO v_audience
  FROM public.profiles AS profile
  WHERE profile.user_id = p_user_id;

  IF v_audience IS NULL THEN
    RETURN jsonb_build_object(
      'subscribed', false,
      'product_id', NULL,
      'subscription_end', NULL,
      'source', 'database'
    );
  END IF;

  SELECT subscription.*
  INTO v_billing
  FROM public.billing_subscriptions AS subscription
  WHERE subscription.user_id = p_user_id
    AND subscription.runtime_mode = v_runtime_mode
    AND subscription.livemode = (v_runtime_mode = 'live')
    AND subscription.audience = v_audience
    AND subscription.status IN ('active', 'trialing', 'past_due')
    AND (
      p_required_stripe_subscription_id IS NULL
      OR subscription.stripe_subscription_id = p_required_stripe_subscription_id
    )
    AND CASE
      WHEN subscription.status = 'trialing' THEN
        COALESCE(subscription.trial_end, subscription.current_period_end) > now()
      ELSE subscription.current_period_end > now()
    END
  ORDER BY subscription.updated_at DESC, subscription.id DESC
  LIMIT 1;

  IF v_billing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'subscribed', true,
      'product_id', v_billing.stripe_product_id,
      'subscription_end', CASE
        WHEN v_billing.status = 'trialing' THEN
          COALESCE(v_billing.trial_end, v_billing.current_period_end)
        ELSE v_billing.current_period_end
      END,
      'source', 'billing_state',
      'plan_key', v_billing.plan_key,
      'audience', v_billing.audience,
      'billing_cycle', v_billing.billing_cycle,
      'status', v_billing.status
    );
  END IF;

  IF v_audience IN ('investor', 'institutional') THEN
    SELECT subscription.*
    INTO v_investor
    FROM public.investor_subscriptions AS subscription
    WHERE subscription.user_id = p_user_id
      AND subscription.runtime_mode = v_runtime_mode
      AND subscription.livemode = (v_runtime_mode = 'live')
      AND subscription.status IN ('active', 'trial')
      AND (subscription.expires_at IS NULL OR subscription.expires_at > now())
    ORDER BY subscription.updated_at DESC, subscription.id DESC
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'subscribed', v_investor.id IS NOT NULL,
    'product_id', NULL,
    'subscription_end', CASE
      WHEN v_investor.id IS NOT NULL THEN v_investor.expires_at
      ELSE NULL
    END,
    'source', CASE
      WHEN v_investor.id IS NOT NULL THEN 'investor'
      ELSE 'database'
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)
  TO service_role;

COMMENT ON FUNCTION public.resolve_subscription_state_for_service(uuid, text) IS
  'Service-role-only, runtime-scoped subscription resolver used by check-subscription to avoid three separate Data API calls.';
