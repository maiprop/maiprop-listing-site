-- Serialize cache publication and billing by stable listing identity. Two
-- concurrent cache misses may both finish provider work, but only the first
-- publishes a generation; all callers receive and pay against that same row.

CREATE OR REPLACE FUNCTION public.store_property_report_cache_generation(
  p_listing_id uuid,
  p_lang text,
  p_html text,
  p_ai jsonb,
  p_features jsonb,
  p_file_name text,
  p_generated_at timestamptz,
  p_expires_at timestamptz
)
RETURNS public.property_report_cache
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cache public.property_report_cache%ROWTYPE;
BEGIN
  IF p_listing_id IS NULL
     OR p_lang NOT IN ('en', 'el')
     OR p_html IS NULL
     OR p_file_name IS NULL
     OR p_generated_at IS NULL
     OR p_expires_at <= p_generated_at THEN
    RAISE EXCEPTION 'invalid_property_report_cache_payload'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'property-report-cache:' || p_listing_id::text || ':valuation:' || p_lang,
      0
    )
  );

  SELECT cache.*
  INTO v_cache
  FROM public.property_report_cache AS cache
  WHERE cache.listing_id = p_listing_id
    AND cache.report_type = 'valuation'
    AND cache.lang = p_lang
    AND cache.expires_at > pg_catalog.now()
  LIMIT 1;

  IF v_cache.id IS NOT NULL THEN
    RETURN v_cache;
  END IF;

  INSERT INTO public.property_report_cache (
    listing_id,
    report_type,
    lang,
    source,
    html,
    ai,
    features,
    file_name,
    generated_at,
    expires_at,
    updated_at
  )
  VALUES (
    p_listing_id,
    'valuation',
    p_lang,
    'os',
    p_html,
    p_ai,
    COALESCE(p_features, '{}'::jsonb),
    p_file_name,
    p_generated_at,
    p_expires_at,
    pg_catalog.now()
  )
  ON CONFLICT (listing_id, report_type, lang)
  DO UPDATE SET
    source = EXCLUDED.source,
    html = EXCLUDED.html,
    ai = EXCLUDED.ai,
    features = EXCLUDED.features,
    file_name = EXCLUDED.file_name,
    generated_at = EXCLUDED.generated_at,
    expires_at = EXCLUDED.expires_at,
    updated_at = pg_catalog.now()
  RETURNING * INTO v_cache;

  RETURN v_cache;
END;
$$;

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

  IF p_listing_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        p_user_id::text || ':property-report:' || p_listing_id::text,
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

REVOKE ALL ON FUNCTION public.store_property_report_cache_generation(
  uuid, text, text, jsonb, jsonb, text, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_property_report_cache_generation(
  uuid, text, text, jsonb, jsonb, text, timestamptz, timestamptz
) TO service_role;

REVOKE ALL ON FUNCTION public.charge_property_report_fetch_for_user(
  uuid, uuid, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_property_report_fetch_for_user(
  uuid, uuid, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.store_property_report_cache_generation(
  uuid, text, text, jsonb, jsonb, text, timestamptz, timestamptz
) IS
  'Service-only cache publication boundary. Concurrent misses converge on one active report generation.';

DO $$
BEGIN
  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.store_property_report_cache_generation(uuid,text,text,jsonb,jsonb,text,timestamptz,timestamptz)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.charge_property_report_fetch_for_user(uuid,uuid,timestamptz)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'property-report cache or billing boundary remains browser-executable';
  END IF;
END
$$;
