-- Paid developer project mutations and all Pro checks must use the same
-- durable, runtime-scoped entitlement contract. A role switch is an
-- authorization transition, so paid access fails closed until it completes.

CREATE OR REPLACE FUNCTION private.current_billing_subscription_for_user(
  p_user_id uuid,
  p_required_stripe_subscription_id text DEFAULT NULL
)
RETURNS SETOF public.billing_subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT subscription.*
  FROM public.billing_subscriptions AS subscription
  JOIN public.profiles AS profile
    ON profile.user_id = subscription.user_id
  JOIN public.pricing_configs AS pricing
    ON pricing.is_active = true
   AND pricing.audience = public.profile_pricing_audience(
     profile.role,
     profile.participant_type::text
   )
   AND pricing.key = subscription.plan_key
   AND pricing.module IN (
     'user_subscription',
     'agent_subscription',
     'developer_subscription',
     'professional_subscription'
   )
   AND pricing.metadata->>'stripe_product_id' = subscription.stripe_product_id
  WHERE subscription.user_id = p_user_id
    AND profile.role_switch_in_progress_at IS NULL
    AND subscription.runtime_mode = public.current_billing_runtime_mode()
    AND subscription.livemode = (public.current_billing_runtime_mode() = 'live')
    AND subscription.audience = public.profile_pricing_audience(
      profile.role,
      profile.participant_type::text
    )
    AND subscription.status IN ('active', 'trialing', 'past_due')
    AND (
      p_required_stripe_subscription_id IS NULL
      OR subscription.stripe_subscription_id = p_required_stripe_subscription_id
    )
    AND CASE
      WHEN subscription.status = 'trialing' THEN
        COALESCE(subscription.trial_end, subscription.current_period_end) IS NOT NULL
        AND COALESCE(subscription.trial_end, subscription.current_period_end) > now()
      ELSE
        subscription.current_period_end IS NOT NULL
        AND subscription.current_period_end > now()
    END
  ORDER BY subscription.updated_at DESC, subscription.id DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.has_investor_subscription_for_user(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.investor_subscriptions AS subscription
    JOIN public.profiles AS profile
      ON profile.user_id = subscription.user_id
    WHERE subscription.user_id = p_user_id
      AND profile.role_switch_in_progress_at IS NULL
      AND public.profile_pricing_audience(
        profile.role,
        profile.participant_type::text
      ) IN ('investor', 'institutional')
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND subscription.livemode = (
        public.current_billing_runtime_mode() = 'live'
      )
      AND subscription.status IN ('active', 'trial')
      AND (
        subscription.expires_at IS NULL
        OR subscription.expires_at > now()
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.has_developer_listing_access(
  _user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(
    private.has_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles AS profile
      WHERE profile.user_id = _user_id
        AND profile.role = 'developer'::public.user_role
        AND profile.role_switch_in_progress_at IS NULL
        AND (
          profile.force_pro_access
          OR private.has_current_billing_subscription_for_user(_user_id)
        )
    ),
    FALSE
  )
$$;

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT
    public.has_platform_admin(p_user_id)
    OR COALESCE(
      (
        SELECT
          profile.role_switch_in_progress_at IS NULL
          AND profile.force_pro_access
        FROM public.profiles AS profile
        WHERE profile.user_id = p_user_id
        LIMIT 1
      ),
      FALSE
    )
    OR private.has_current_billing_subscription_for_user(p_user_id)
    OR private.has_investor_subscription_for_user(p_user_id)
$$;

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
  v_role_switch_in_progress_at timestamptz;
  v_billing public.billing_subscriptions%ROWTYPE;
  v_investor public.investor_subscriptions%ROWTYPE;
BEGIN
  SELECT
    public.profile_pricing_audience(
      profile.role,
      profile.participant_type::text
    ),
    profile.role_switch_in_progress_at
  INTO v_audience, v_role_switch_in_progress_at
  FROM public.profiles AS profile
  WHERE profile.user_id = p_user_id;

  IF v_audience IS NULL OR v_role_switch_in_progress_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'subscribed', false,
      'product_id', NULL,
      'subscription_end', NULL,
      'source', 'database',
      'audience', v_audience
    );
  END IF;

  SELECT subscription.*
  INTO v_billing
  FROM private.current_billing_subscription_for_user(
    p_user_id,
    p_required_stripe_subscription_id
  ) AS subscription;

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
    END,
    'audience', v_audience,
    'status', CASE
      WHEN v_investor.id IS NOT NULL THEN v_investor.status
      ELSE NULL
    END
  );
END;
$$;

REVOKE ALL ON FUNCTION private.current_billing_subscription_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_billing_subscription_for_user(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION private.has_investor_subscription_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_investor_subscription_for_user(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION private.has_developer_listing_access(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_developer_listing_access(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)
  TO service_role;

COMMENT ON FUNCTION private.has_developer_listing_access(uuid) IS
  'Allows platform admins or active Developer Pro owners to manage new-build projects and inventory; role transitions fail closed.';
