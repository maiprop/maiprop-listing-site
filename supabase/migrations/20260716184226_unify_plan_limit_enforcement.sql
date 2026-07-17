-- Remove the 2026-05 legacy hard caps. The monthly triggers introduced in
-- 20260623150000 are the single server-side enforcement path and resolve
-- limits through the current durable entitlement contract.
DROP TRIGGER IF EXISTS trg_check_valuation_limit ON public.usage_ai_valuations;
DROP TRIGGER IF EXISTS trg_check_report_limit ON public.usage_property_reports;
DROP TRIGGER IF EXISTS trg_check_priority_ad_limit ON public.usage_priority_ads;

DROP FUNCTION IF EXISTS public.check_valuation_limit();
DROP FUNCTION IF EXISTS public.check_report_limit();
DROP FUNCTION IF EXISTS public.check_priority_ad_limit();

CREATE OR REPLACE FUNCTION public.get_priority_ad_monthly_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  IF NOT public.is_pro(p_user_id) THEN
    RETURN 0;
  END IF;

  v_role := public.authoritative_role(p_user_id);
  RETURN CASE v_role::text
    WHEN 'agent' THEN 10
    WHEN 'developer' THEN 1
    WHEN 'seller' THEN 0
    ELSE 0
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_priority_ad_monthly_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(uuid)
  TO service_role;

COMMENT ON FUNCTION public.get_priority_ad_monthly_limit(uuid) IS
  'Returns the role-scoped monthly Priority allowance: Agent Pro 10, Developer Pro 1, all other non-admin audiences 0.';

CREATE OR REPLACE FUNCTION private.get_listing_promotion_plan_allowance(
  p_user_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF p_promotion_type NOT IN ('spotlight', 'priority') THEN
    RETURN 0;
  END IF;

  v_role := private.authoritative_role(p_user_id);
  IF v_role = 'admin'::public.user_role THEN
    RETURN 999;
  END IF;

  IF NOT public.is_pro(p_user_id) THEN
    RETURN 0;
  END IF;

  IF p_promotion_type = 'spotlight' THEN
    RETURN CASE v_role::text
      WHEN 'seller' THEN 1
      WHEN 'developer' THEN 1
      ELSE 0
    END;
  END IF;

  RETURN CASE v_role::text
    WHEN 'agent' THEN 10
    WHEN 'developer' THEN 1
    ELSE 0
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)
  TO service_role;

COMMENT ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text) IS
  'Resolves included listing promotions from authoritative role plus current durable Pro state; profile product mirrors are not trusted.';
