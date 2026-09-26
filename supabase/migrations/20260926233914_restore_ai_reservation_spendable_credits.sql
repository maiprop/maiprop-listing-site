-- Keep consumed overage in the established monthly ceiling while spending remaining credits.
-- CREATE OR REPLACE preserves the existing owner and service-only ACL.
CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user(
  _user_id UUID,
  p_bucket TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid UUID := _user_id;
  v_base_limit INTEGER;
  v_effective_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ;
  v_reservation_id UUID;
  v_consumed_credit BOOLEAN := FALSE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  IF p_bucket IS NULL OR length(trim(p_bucket)) = 0 OR length(p_bucket) > 120 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'invalid_bucket',
      'used', 0,
      'limit', 0
    );
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_uid::TEXT || ':' || p_bucket || ':' || v_month_start::DATE::TEXT, 0)
  );

  v_base_limit := public.get_ai_call_monthly_base_limit(v_uid, p_bucket);
  v_effective_limit := public.get_ai_call_monthly_limit(v_uid, p_bucket);

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = v_uid
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  IF v_effective_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'plan_does_not_include_feature',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  IF v_count >= v_effective_limit THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'reason', 'monthly_limit_reached',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  v_consumed_credit := v_base_limit < 999999 AND v_count >= v_base_limit;

  INSERT INTO public.usage_ai_calls (user_id, bucket)
  VALUES (v_uid, p_bucket)
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', TRUE,
    'reason', NULL,
    'used', v_count + 1,
    'limit', v_effective_limit,
    'reservation_id', v_reservation_id,
    'addon_credit_consumed', v_consumed_credit
  );
END;
$function$;
