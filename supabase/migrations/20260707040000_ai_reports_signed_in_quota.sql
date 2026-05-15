-- Make core property AI analysis available to every signed-in user.
-- Non-Pro users receive 5 calls/month per feature; Pro users keep a higher cap.
-- Admins remain unlimited. Role alone no longer bypasses the cap.

INSERT INTO public.ai_usage_limits (bucket, free_monthly, pro_monthly, description, is_pro_only)
VALUES
  ('property-valuation',   5, 100, 'AI market insights and valuation analysis', FALSE),
  ('neighbourhood-report', 5, 100, 'Neighbourhood deep-dive report',             FALSE),
  ('property-pois',        5, 100, 'AI-generated points of interest near a property', FALSE)
ON CONFLICT (bucket) DO UPDATE
SET
  free_monthly = EXCLUDED.free_monthly,
  pro_monthly = EXCLUDED.pro_monthly,
  is_pro_only = FALSE,
  description = EXCLUDED.description,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.get_ai_call_monthly_limit(
  p_user_id UUID,
  p_bucket  TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free INTEGER;
  v_pro INTEGER;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999999;
  END IF;

  SELECT free_monthly, pro_monthly INTO v_free, v_pro
    FROM public.ai_usage_limits
    WHERE bucket = p_bucket
    LIMIT 1;

  IF v_free IS NULL THEN
    RETURN 0;
  END IF;

  RETURN CASE WHEN public.is_pro(p_user_id) THEN v_pro ELSE v_free END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_ai_call_monthly_limit(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ai_call_monthly_limit(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_ai_call_monthly_limit(UUID, TEXT) IS
  'Returns per-user monthly AI quota. Signed-in non-Pro users get the free cap; Pro users get the pro cap; platform admins are unlimited.';
