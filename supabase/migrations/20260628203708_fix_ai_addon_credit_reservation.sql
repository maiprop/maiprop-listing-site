-- Fix AI add-on credit reservations.
--
-- reserve_ai_quota_for_user() used to consume an add-on credit before inserting
-- usage_ai_calls. The usage_ai_calls BEFORE INSERT trigger also enforces quota
-- and consumes an add-on credit when base quota is exhausted, so the reservation
-- path double-spent the same credit and then failed with
-- ai_call_monthly_limit_reached. Let the trigger do the atomic consumption and
-- report whether the attempted reservation needed a paid credit.

CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user(
  _user_id uuid,
  p_bucket text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := _user_id;
  v_base_limit integer;
  v_available_credits integer;
  v_effective_limit integer;
  v_count integer;
  v_month_start timestamptz;
  v_reservation_id uuid;
  v_consumed_credit boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  IF p_bucket IS NULL OR length(trim(p_bucket)) = 0 OR length(p_bucket) > 120 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_bucket',
      'used', 0,
      'limit', 0
    );
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || p_bucket || ':' || v_month_start::date::text, 0)
  );

  v_base_limit := public.get_ai_call_monthly_base_limit(v_uid, p_bucket);
  v_available_credits := public.get_available_addon_credits(v_uid, p_bucket);
  v_effective_limit := v_base_limit + v_available_credits;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = v_uid
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  IF v_effective_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'plan_does_not_include_feature',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  IF v_count >= v_effective_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
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
    'allowed', true,
    'reason', NULL,
    'used', v_count + 1,
    'limit', v_effective_limit,
    'reservation_id', v_reservation_id,
    'addon_credit_consumed', v_consumed_credit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_ai_quota_for_user(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_for_user(uuid, text)
  TO service_role;
