-- One runtime-, audience-, product-, status-, and expiry-aware predicate now
-- backs subscription display, SQL enforcement, and AI quota resolution.

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

CREATE OR REPLACE FUNCTION private.has_current_billing_subscription_for_user(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM private.current_billing_subscription_for_user(p_user_id, NULL)
  )
$$;

CREATE OR REPLACE FUNCTION public.has_audience_scoped_pro_entitlement(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT private.has_current_billing_subscription_for_user(p_user_id)
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
        SELECT profile.force_pro_access
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
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ai_quotas_for_user(
  _user_id uuid,
  p_buckets text[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_buckets text[];
  v_runtime_mode text;
  v_is_admin boolean := false;
  v_is_pro boolean := false;
  v_month_start timestamptz;
  v_result jsonb;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'user id is required' USING ERRCODE = '22023';
  END IF;

  IF p_buckets IS NULL
     OR cardinality(p_buckets) = 0
     OR cardinality(p_buckets) > 12
     OR EXISTS (
       SELECT 1
       FROM unnest(p_buckets) AS requested(bucket)
       WHERE bucket IS NULL OR bucket !~ '^[a-z0-9-]{2,64}$'
     ) THEN
    RAISE EXCEPTION 'invalid AI quota buckets' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(deduplicated.bucket ORDER BY deduplicated.first_position)
  INTO v_buckets
  FROM (
    SELECT requested.bucket, min(requested.position) AS first_position
    FROM unnest(p_buckets) WITH ORDINALITY AS requested(bucket, position)
    GROUP BY requested.bucket
  ) AS deduplicated;

  v_runtime_mode := public.current_billing_runtime_mode();
  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_is_admin := public.has_platform_admin(_user_id);
  v_is_pro := public.is_pro(_user_id);

  WITH requested AS (
    SELECT bucket, position
    FROM unnest(v_buckets) WITH ORDINALITY AS value(bucket, position)
  ),
  limits_by_bucket AS (
    SELECT
      requested.bucket,
      requested.position,
      CASE
        WHEN v_is_admin THEN 999999
        WHEN v_is_pro THEN COALESCE(limits.pro_monthly, 0)
        ELSE COALESCE(limits.free_monthly, 0)
      END::integer AS base_limit
    FROM requested
    LEFT JOIN public.ai_usage_limits AS limits
      ON limits.bucket = requested.bucket
  ),
  usage_by_bucket AS (
    SELECT calls.bucket, count(*)::integer AS used
    FROM public.usage_ai_calls AS calls
    WHERE calls.user_id = _user_id
      AND calls.bucket = ANY (v_buckets)
      AND calls.created_at >= v_month_start
    GROUP BY calls.bucket
  ),
  credits_by_bucket AS (
    SELECT
      public.addon_credit_bucket(purchases.addon_key) AS bucket,
      GREATEST(
        COALESCE(sum(
          purchases.credits_granted
          - purchases.credits_consumed
          - purchases.credits_refunded
        ), 0),
        0
      )::integer AS available
    FROM public.addon_purchases AS purchases
    WHERE purchases.user_id = _user_id
      AND purchases.runtime_mode = v_runtime_mode
      AND purchases.livemode = (v_runtime_mode = 'live')
      AND purchases.status IN ('paid', 'active', 'refunded')
      AND public.addon_credit_bucket(purchases.addon_key) = ANY (v_buckets)
    GROUP BY public.addon_credit_bucket(purchases.addon_key)
  ),
  quota_rows AS (
    SELECT
      limits.bucket,
      limits.position,
      COALESCE(usage.used, 0)::integer AS used,
      CASE
        WHEN limits.base_limit >= 999999 THEN limits.base_limit
        ELSE limits.base_limit
          + COALESCE(credits.available, 0)
          + GREATEST(COALESCE(usage.used, 0) - limits.base_limit, 0)
      END::integer AS effective_limit
    FROM limits_by_bucket AS limits
    LEFT JOIN usage_by_bucket AS usage ON usage.bucket = limits.bucket
    LEFT JOIN credits_by_bucket AS credits ON credits.bucket = limits.bucket
  )
  SELECT jsonb_object_agg(
    quota.bucket,
    jsonb_build_object(
      'allowed', quota.used < quota.effective_limit,
      'reason', CASE
        WHEN quota.used >= quota.effective_limit
             AND quota.effective_limit = 0
          THEN 'plan_does_not_include_feature'
        WHEN quota.used >= quota.effective_limit
          THEN 'monthly_limit_reached'
        ELSE NULL
      END,
      'used', quota.used,
      'limit', quota.effective_limit
    )
    ORDER BY quota.position
  )
  INTO v_result
  FROM quota_rows AS quota;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION private.current_billing_subscription_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.current_billing_subscription_for_user(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION private.has_current_billing_subscription_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_current_billing_subscription_for_user(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_pro(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_subscription_state_for_service(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.check_ai_quotas_for_user(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quotas_for_user(uuid, text[]) TO service_role;

COMMENT ON FUNCTION private.current_billing_subscription_for_user(uuid, text) IS
  'Canonical current billing row scoped to runtime, livemode, audience, active pricing product, status and expiry.';
COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical service-side Pro predicate shared by quotas, listings, promotions and reports.';
