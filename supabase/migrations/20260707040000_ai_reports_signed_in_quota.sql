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

-- Normalize legacy admin-pricing rows from "user" to the canonical
-- checkout/subscription audience "participant".
UPDATE public.pricing_configs
SET
  audience = 'participant',
  updated_at = now()
WHERE audience = 'user';

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.has_platform_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.pro_product_ids pp
        ON pp.product_id = p.subscription_product_id
      WHERE p.user_id = p_user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.investor_subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trial')
    )
$$;

REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;
COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical Pro-status reader. Returns true only for platform admins, validated Pro product IDs, or active/trial investor subscriptions.';

-- Role labels alone must not grant paid operational quotas. Users may
-- self-select public roles like developer during onboarding, so paid limits
-- are tied to public.is_pro(user_id) and admin override instead.

CREATE OR REPLACE FUNCTION public.get_valuation_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  v_is_pro BOOLEAN;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  v_role := public.authoritative_role(p_user_id);
  v_is_pro := public.is_pro(p_user_id);

  IF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 0 END;
  END IF;

  IF v_role IN (
    'agent'::public.user_role,
    'professional'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_report_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  v_is_pro BOOLEAN;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  v_role := public.authoritative_role(p_user_id);
  v_is_pro := public.is_pro(p_user_id);

  IF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN v_is_pro THEN 3 ELSE 0 END;
  END IF;

  IF v_role IN (
    'agent'::public.user_role,
    'professional'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_priority_ad_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
  v_is_pro BOOLEAN;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  v_role := public.authoritative_role(p_user_id);
  v_is_pro := public.is_pro(p_user_id);

  IF v_role = 'seller'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 1 ELSE 0 END;
  END IF;

  IF v_role IN (
    'agent'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;

  RETURN 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_valuation_monthly_limit(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_report_monthly_limit(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_priority_ad_monthly_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_valuation_monthly_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_report_monthly_limit(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_valuation_monthly_limit(UUID) IS
  'Returns monthly valuation quota. Public roles require paid entitlement; platform admins are unlimited.';

COMMENT ON FUNCTION public.get_report_monthly_limit(UUID) IS
  'Returns monthly report quota. Public roles require paid entitlement; platform admins are unlimited.';

COMMENT ON FUNCTION public.get_priority_ad_monthly_limit(UUID) IS
  'Returns monthly priority-ad quota. Public roles require paid entitlement; platform admins are unlimited.';
