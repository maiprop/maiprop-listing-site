-- Add a service-role-only quota status RPC for the ai-quota-status Edge
-- Function. This preserves the existing quota UX while removing browser-role
-- execution from the legacy caller-context check_ai_quota(text) RPC.

CREATE OR REPLACE FUNCTION public.check_ai_quota_for_user(
  _user_id UUID,
  p_bucket TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  v_limit := public.get_ai_call_monthly_limit(_user_id, p_bucket);

  SELECT COUNT(*) INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = _user_id
    AND bucket = p_bucket
    AND date_trunc('month', created_at AT TIME ZONE 'UTC')
      = date_trunc('month', now() AT TIME ZONE 'UTC');

  RETURN jsonb_build_object(
    'allowed', (v_count < v_limit),
    'reason', CASE
      WHEN v_count >= v_limit AND v_limit = 0 THEN 'plan_does_not_include_feature'
      WHEN v_count >= v_limit THEN 'monthly_limit_reached'
      ELSE NULL
    END,
    'used', v_count,
    'limit', v_limit
  );
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_quota_for_user(UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota_for_user(UUID, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.check_ai_quota_for_user(UUID, TEXT) IS
  'Service-role-only AI quota status lookup. The ai-quota-status Edge Function verifies the caller JWT and passes the verified user id explicitly.';

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.check_ai_quota_for_user(uuid,text)');
BEGIN
  IF fn IS NULL THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) was not created';
  END IF;

  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.check_ai_quota_for_user(uuid,text) must remain service-callable';
  END IF;
END $$;
