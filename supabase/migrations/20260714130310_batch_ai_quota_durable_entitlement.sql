-- Resolve durable Pro entitlement once, then return every requested AI quota
-- from one service-role call. Browser clients continue to use ai-quota-status.
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
  v_audience text;
  v_force_pro boolean := false;
  v_is_admin boolean := false;
  v_has_durable_subscription boolean := false;
  v_has_investor_subscription boolean := false;
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

  SELECT
    public.profile_pricing_audience(p.role, p.participant_type::text),
    COALESCE(p.force_pro_access, false)
  INTO v_audience, v_force_pro
  FROM public.profiles p
  WHERE p.user_id = _user_id
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions bs
    JOIN public.pricing_configs pc
      ON pc.is_active = true
     AND pc.audience = v_audience
     AND pc.key = bs.plan_key
     AND pc.module IN (
       'user_subscription',
       'agent_subscription',
       'developer_subscription',
       'professional_subscription'
     )
     AND pc.metadata->>'stripe_product_id' = bs.stripe_product_id
    WHERE bs.user_id = _user_id
      AND bs.runtime_mode = v_runtime_mode
      AND bs.livemode = (v_runtime_mode = 'live')
      AND bs.audience = v_audience
      AND bs.status IN ('active', 'trialing', 'past_due')
      AND (
        (
          bs.status = 'trialing'
          AND (
            (bs.trial_end IS NOT NULL AND bs.trial_end > now())
            OR (
              bs.trial_end IS NULL
              AND bs.current_period_end IS NOT NULL
              AND bs.current_period_end > now()
            )
          )
        )
        OR (
          bs.status IN ('active', 'past_due')
          AND (
            bs.current_period_end IS NULL
            OR bs.current_period_end > now()
          )
        )
      )
  ) INTO v_has_durable_subscription;

  SELECT EXISTS (
    SELECT 1
    FROM public.investor_subscriptions ins
    WHERE ins.user_id = _user_id
      AND v_audience IN ('investor', 'institutional')
      AND ins.runtime_mode = v_runtime_mode
      AND ins.livemode = (v_runtime_mode = 'live')
      AND ins.status IN ('active', 'trial')
      AND (ins.expires_at IS NULL OR ins.expires_at > now())
  ) INTO v_has_investor_subscription;

  v_is_pro := v_is_admin
    OR v_force_pro
    OR v_has_durable_subscription
    OR v_has_investor_subscription;

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
    LEFT JOIN public.ai_usage_limits limits
      ON limits.bucket = requested.bucket
  ),
  usage_by_bucket AS (
    SELECT calls.bucket, count(*)::integer AS used
    FROM public.usage_ai_calls calls
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
    FROM public.addon_purchases purchases
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
    FROM limits_by_bucket limits
    LEFT JOIN usage_by_bucket usage ON usage.bucket = limits.bucket
    LEFT JOIN credits_by_bucket credits ON credits.bucket = limits.bucket
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
  FROM quota_rows quota;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_quotas_for_user(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quotas_for_user(uuid, text[]) TO service_role;

COMMENT ON FUNCTION public.check_ai_quotas_for_user(uuid, text[]) IS
  'Service-only batched AI quota status. Resolves admin, manual, investor, and webhook-backed runtime/audience entitlement once per request.';

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.check_ai_quotas_for_user(uuid,text[])',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.check_ai_quotas_for_user(uuid,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'check_ai_quotas_for_user must not be browser-callable';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.check_ai_quotas_for_user(uuid,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'check_ai_quotas_for_user must remain service-callable';
  END IF;
END $$;
