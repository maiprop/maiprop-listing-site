-- Phase 1: add a service-role AI quota reservation RPC with an explicit
-- verified user id. Edge Functions authenticate the caller first, then call
-- this RPC through a service-role client.

CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user(
  _user_id UUID,
  p_bucket TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := _user_id;
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ;
  v_reservation_id UUID;
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
    hashtextextended(v_uid::TEXT || ':' || p_bucket || ':' || v_month_start::DATE::TEXT, 0)
  );

  v_limit := public.get_ai_call_monthly_limit(v_uid, p_bucket);

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = v_uid
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  IF v_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'plan_does_not_include_feature',
      'used', v_count,
      'limit', v_limit
    );
  END IF;

  IF v_count >= v_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_reached',
      'used', v_count,
      'limit', v_limit
    );
  END IF;

  INSERT INTO public.usage_ai_calls (user_id, bucket)
  VALUES (v_uid, p_bucket)
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', NULL,
    'used', v_count + 1,
    'limit', v_limit,
    'reservation_id', v_reservation_id
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_ai_quota_for_user(UUID, TEXT) IS
  'Service-role AI quota reservation RPC. Edge Functions verify the caller JWT and pass the verified user id explicitly.';

REVOKE ALL ON FUNCTION public.reserve_ai_quota_for_user(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_for_user(UUID, TEXT)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reserve_ai_quota_for_user(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_ai_quota_for_user(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service AI quota reservation RPC must not be browser-executable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.reserve_ai_quota_for_user(uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service AI quota reservation RPC must remain service-callable';
  END IF;
END $$;
