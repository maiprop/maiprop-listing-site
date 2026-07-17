-- Re-establish the paid property-report boundary inside the only RPC used by
-- the report Edge Function. Client-side gates remain presentational; this
-- function owns monthly allowance and paid add-on consumption.

CREATE OR REPLACE FUNCTION public.charge_property_report_fetch_for_user(
  p_user_id uuid,
  p_listing_id uuid,
  p_cache_generated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_id uuid;
  v_usage_id uuid;
  v_role public.user_role;
  v_is_pro boolean := false;
  v_base_limit integer := 0;
  v_count integer := 0;
  v_available_credits integer := 0;
  v_credit_consumed boolean := false;
  v_month_start timestamptz;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'report_user_id_required' USING ERRCODE = '22023';
  END IF;

  IF (p_listing_id IS NULL) <> (p_cache_generated_at IS NULL) THEN
    RAISE EXCEPTION 'report_cache_identity_incomplete'
      USING
        ERRCODE = '22023',
        HINT = 'Listing ID and cache generation time must be supplied together';
  END IF;

  -- A cached database report is charged once per generated report, including
  -- concurrent requests. External OS reports have no stable UUID/cache key and
  -- are intentionally charged on every successful generation.
  IF p_listing_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_user_id::text || ':property-report:' || p_listing_id::text || ':' ||
        p_cache_generated_at::text,
        0
      )
    );

    SELECT usage.id
    INTO v_existing_id
    FROM public.usage_property_reports AS usage
    WHERE usage.user_id = p_user_id
      AND usage.listing_id = p_listing_id
      AND usage.created_at >= p_cache_generated_at
    ORDER BY usage.created_at, usage.id
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN pg_catalog.jsonb_build_object(
        'charged', false,
        'alreadyPaid', true,
        'usage_id', v_existing_id,
        'addon_credit_consumed', false
      );
    END IF;
  END IF;

  v_month_start :=
    pg_catalog.date_trunc('month', pg_catalog.now() AT TIME ZONE 'UTC')
      AT TIME ZONE 'UTC';

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_user_id::text || ':property-report-month:' || v_month_start::date::text,
      0
    )
  );

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

  IF v_base_limit < 999 AND v_count >= v_base_limit THEN
    v_available_credits := public.get_available_addon_credits(
      p_user_id,
      'property-report'
    );

    IF v_available_credits <= 0 THEN
      IF v_base_limit = 0 THEN
        RAISE EXCEPTION 'report_not_allowed'
          USING HINT = 'Upgrade to Pro or buy a property-report add-on';
      END IF;

      RAISE EXCEPTION 'report_monthly_limit_reached'
        USING HINT = 'Monthly property-report allowance used; buy an add-on to continue';
    END IF;

    v_credit_consumed := public.consume_addon_credit_for_user(
      p_user_id,
      'property-report'
    );
    IF NOT v_credit_consumed THEN
      RAISE EXCEPTION 'report_monthly_limit_reached'
        USING HINT = 'Property-report add-on credit is no longer available';
    END IF;
  END IF;

  INSERT INTO public.usage_property_reports (user_id, listing_id)
  VALUES (p_user_id, p_listing_id)
  RETURNING id INTO v_usage_id;

  RETURN pg_catalog.jsonb_build_object(
    'charged', true,
    'alreadyPaid', false,
    'usage_id', v_usage_id,
    'addon_credit_consumed', v_credit_consumed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_property_report_fetch_for_user(
  uuid,
  uuid,
  timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_property_report_fetch_for_user(
  uuid,
  uuid,
  timestamptz
) TO service_role;

COMMENT ON FUNCTION public.charge_property_report_fetch_for_user(
  uuid,
  uuid,
  timestamptz
) IS
  'Service-owned, idempotent property-report billing boundary. Enforces role plan limits and consumes one paid add-on credit per report beyond the base allowance.';

-- Viewing limits apply to a user's outbound booking requests. A seller can
-- still host unlimited viewing requests on their own listings. Agent-hosted
-- limits remain the existing 3 Free / 10 Pro contract.
CREATE OR REPLACE FUNCTION public.get_viewing_limit(
  p_user_id uuid,
  p_is_requester boolean
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := private.authoritative_role(p_user_id);

  IF p_is_requester
     AND v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 1 END;
  END IF;

  IF NOT p_is_requester AND v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 3 END;
  END IF;

  IF NOT p_is_requester AND v_role = 'seller'::public.user_role THEN
    RETURN 999;
  END IF;

  IF v_role IS NULL THEN
    RETURN 0;
  END IF;

  RETURN 999;
END;
$$;

REVOKE ALL ON FUNCTION public.get_viewing_limit(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_viewing_limit(uuid, boolean)
  TO service_role;

COMMENT ON FUNCTION public.get_viewing_limit(uuid, boolean) IS
  'Service-only viewing allowance: buyer/seller requests are 1 Free or 10 Pro, seller-hosted viewings are unlimited, and agent-hosted viewings are 3 Free or 10 Pro.';

DO $$
BEGIN
  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.charge_property_report_fetch_for_user(uuid,uuid,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'property-report billing RPC remains browser-executable';
  END IF;

  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.get_viewing_limit(uuid,boolean)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'arbitrary-user viewing helper remains browser-executable';
  END IF;
END
$$;
