-- Live repair migration for paid-role quota hardening and participant pricing.
--
-- This file is intentionally timestamped at the current migration window so CI
-- chronology accepts it. On a clean replay, some later helpers may not exist
-- yet; the late migration 20260707040000_ai_reports_signed_in_quota.sql repeats
-- the final function definitions after those dependencies are present.

DO $$
BEGIN
  IF to_regclass('public.pricing_configs') IS NOT NULL THEN
    UPDATE public.pricing_configs
    SET
      audience = 'participant',
      updated_at = now()
    WHERE audience = 'user';
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.has_platform_admin(uuid)') IS NULL
    OR to_regprocedure('public.authoritative_role(uuid)') IS NULL
    OR to_regclass('public.profiles') IS NULL
    OR to_regclass('public.pro_product_ids') IS NULL
    OR to_regclass('public.investor_subscriptions') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
    RETURNS boolean
    LANGUAGE sql
    SECURITY DEFINER
    STABLE
    SET search_path = public
    AS $fn$
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
    $fn$;
  $sql$;

  REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;
  COMMENT ON FUNCTION public.is_pro(uuid) IS
    'Canonical Pro-status reader. Returns true only for platform admins, validated Pro product IDs, or active/trial investor subscriptions.';

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.get_valuation_monthly_limit(p_user_id UUID)
    RETURNS INTEGER
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
    $fn$;
  $sql$;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.get_report_monthly_limit(p_user_id UUID)
    RETURNS INTEGER
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
    $fn$;
  $sql$;

  EXECUTE $sql$
    CREATE OR REPLACE FUNCTION public.get_priority_ad_monthly_limit(p_user_id UUID)
    RETURNS INTEGER
    LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
    $fn$;
  $sql$;

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
END;
$$;
