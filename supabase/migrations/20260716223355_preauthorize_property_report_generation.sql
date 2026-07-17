-- Reject ineligible report requests before the Edge Function contacts the
-- external OS provider. Final usage insertion/add-on consumption remains in
-- charge_property_report_fetch_for_user after a report is successfully
-- generated, so failed provider calls do not consume customer allowance.

CREATE OR REPLACE FUNCTION public.authorize_property_report_generation(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_is_pro boolean := false;
  v_base_limit integer := 0;
  v_count integer := 0;
  v_available_credits integer := 0;
  v_month_start timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'report_user_id_required' USING ERRCODE = '22023';
  END IF;

  v_month_start :=
    pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'UTC')
      AT TIME ZONE 'UTC';
  v_role := private.authoritative_role(p_user_id);
  v_is_pro := public.is_pro(p_user_id);

  IF v_role = 'admin'::public.user_role THEN
    v_base_limit := 999;
  ELSIF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    v_base_limit := CASE WHEN v_is_pro THEN 3 ELSE 0 END;
  ELSIF v_role IN (
    'agent'::public.user_role,
    'professional'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    v_base_limit := CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;

  SELECT pg_catalog.count(*)::integer
  INTO v_count
  FROM public.usage_property_reports AS usage
  WHERE usage.user_id = p_user_id
    AND usage.created_at >= v_month_start;

  IF v_base_limit >= 999 OR v_count < v_base_limit THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', true,
      'source', 'included',
      'remaining_base', CASE
        WHEN v_base_limit >= 999 THEN NULL
        ELSE GREATEST(v_base_limit - v_count, 0)
      END
    );
  END IF;

  v_available_credits := public.get_available_addon_credits(
    p_user_id,
    'property-report'
  );

  IF v_available_credits > 0 THEN
    RETURN pg_catalog.jsonb_build_object(
      'allowed', true,
      'source', 'addon',
      'available_addon_credits', v_available_credits
    );
  END IF;

  IF v_base_limit = 0 THEN
    RAISE EXCEPTION 'report_not_allowed'
      USING HINT = 'Upgrade to Pro or buy a property-report add-on';
  END IF;

  RAISE EXCEPTION 'report_monthly_limit_reached'
    USING HINT = 'Monthly property-report allowance used; buy an add-on to continue';
END;
$$;

REVOKE ALL ON FUNCTION public.authorize_property_report_generation(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_property_report_generation(uuid)
  TO service_role;

COMMENT ON FUNCTION public.authorize_property_report_generation(uuid) IS
  'Service-only preflight that blocks ineligible report generation before external provider work; successful reports are charged by charge_property_report_fetch_for_user.';

DO $$
BEGIN
  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.authorize_property_report_generation(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'property-report authorization RPC remains browser-executable';
  END IF;
END
$$;
