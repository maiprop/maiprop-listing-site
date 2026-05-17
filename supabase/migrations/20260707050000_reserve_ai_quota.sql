-- Reserve AI quota before provider work starts.
--
-- The previous edge-helper flow checked quota before the provider call and
-- inserted usage afterwards. That left a race window where concurrent calls
-- could all pass the preflight and then burn provider credits. This RPC is the
-- single atomic operation used by edge functions: lock user+bucket+month,
-- re-count, insert one usage row, and return the reservation result.

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(p_bucket TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
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

  -- Serialize reservations for the same user/bucket/month. The lock is scoped
  -- to this transaction and does not block unrelated users or buckets.
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

REVOKE ALL ON FUNCTION public.reserve_ai_quota(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.reserve_ai_quota(TEXT) IS
  'Atomically reserves one monthly AI quota unit for auth.uid() before edge functions call paid AI providers.';

-- Privacy hardening for an existing dashboard helper. The earlier version
-- accepted any p_user_id and was granted to authenticated, allowing users to
-- infer another agent's monthly data-input activity. Keep the same signature
-- but require self-or-platform-admin for end-user calls. service_role keeps the
-- operational path for edge functions and back office jobs.

CREATE OR REPLACE FUNCTION public.get_agent_monthly_input_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_target UUID := COALESCE(p_user_id, v_caller);
  v_count INTEGER;
BEGIN
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF v_caller IS NOT NULL
     AND v_caller IS DISTINCT FROM v_target
     AND NOT public.has_platform_admin(v_caller) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_count
  FROM public.agent_data_inputs
  WHERE user_id = v_target
    AND date_trunc('month', created_at AT TIME ZONE 'UTC')
      = date_trunc('month', now() AT TIME ZONE 'UTC');

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_monthly_input_count(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_agent_monthly_input_count(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_agent_monthly_input_count(UUID) IS
  'Returns monthly agent data-input count for self or platform admin; service_role may pass an explicit user id.';
