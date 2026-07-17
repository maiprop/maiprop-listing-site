-- Developer, Investor and Institutional are paid/invitation-only audiences.
-- They may use purchased add-on credits, but must not inherit the general
-- Free audience's monthly AI allowance while no durable Pro grant exists.

CREATE OR REPLACE FUNCTION private.has_free_ai_access_for_user(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT public.profile_pricing_audience(
      profile.role,
      profile.participant_type
    ) NOT IN ('developer', 'investor', 'institutional')
    FROM public.profiles AS profile
    WHERE profile.user_id = p_user_id
    LIMIT 1
  ), false)
$$;

CREATE OR REPLACE FUNCTION public.get_ai_call_monthly_base_limit(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_free integer;
  v_pro integer;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999999;
  END IF;

  SELECT limits.free_monthly, limits.pro_monthly
  INTO v_free, v_pro
  FROM public.ai_usage_limits AS limits
  WHERE limits.bucket = p_bucket
  LIMIT 1;

  IF v_free IS NULL THEN
    RETURN 0;
  END IF;

  IF public.is_pro(p_user_id) THEN
    RETURN COALESCE(v_pro, 0);
  END IF;

  IF private.has_free_ai_access_for_user(p_user_id) THEN
    RETURN v_free;
  END IF;

  RETURN 0;
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
  v_has_free_ai_access boolean := false;
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
  v_has_free_ai_access := private.has_free_ai_access_for_user(_user_id);

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
        WHEN v_has_free_ai_access THEN COALESCE(limits.free_monthly, 0)
        ELSE 0
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

REVOKE ALL ON FUNCTION private.has_free_ai_access_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_free_ai_access_for_user(uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.get_ai_call_monthly_base_limit(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ai_call_monthly_base_limit(uuid, text)
  TO service_role;
REVOKE ALL ON FUNCTION public.check_ai_quotas_for_user(uuid, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quotas_for_user(uuid, text[])
  TO service_role;

COMMENT ON FUNCTION private.has_free_ai_access_for_user(uuid) IS
  'Service-only pricing predicate: excludes Pro-only Developer and invitation-only Investor audiences from unpaid core AI allowances.';

DO $$
BEGIN
  IF pg_catalog.has_function_privilege(
    'authenticated',
    'private.has_free_ai_access_for_user(uuid)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_ai_call_monthly_base_limit(uuid,text)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.check_ai_quotas_for_user(uuid,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated can execute Pro-only AI helper';
  END IF;
END
$$;
