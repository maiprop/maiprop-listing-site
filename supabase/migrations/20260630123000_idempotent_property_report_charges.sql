-- Make cached property-report delivery idempotent under concurrent fetches.
-- The usage_property_reports insert fires quota/credit triggers, so the
-- read-before-insert check must be serialized in Postgres.

CREATE OR REPLACE FUNCTION public.charge_property_report_fetch_for_user(
  p_user_id uuid,
  p_listing_id uuid,
  p_cache_generated_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_usage_id uuid;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'report_user_id_required';
  END IF;
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'report_listing_id_required';
  END IF;
  IF p_cache_generated_at IS NULL THEN
    RAISE EXCEPTION 'report_cache_generated_at_required';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      p_user_id::text || ':property-report:' || p_listing_id::text || ':' ||
      p_cache_generated_at::text,
      0
    )
  );

  SELECT id
  INTO v_existing_id
  FROM public.usage_property_reports
  WHERE user_id = p_user_id
    AND listing_id = p_listing_id
    AND created_at >= p_cache_generated_at
  ORDER BY created_at ASC, id ASC
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'charged', false,
      'alreadyPaid', true,
      'usage_id', v_existing_id
    );
  END IF;

  INSERT INTO public.usage_property_reports (user_id, listing_id)
  VALUES (p_user_id, p_listing_id)
  RETURNING id INTO v_usage_id;

  RETURN jsonb_build_object(
    'charged', true,
    'alreadyPaid', false,
    'usage_id', v_usage_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.charge_property_report_fetch_for_user(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_property_report_fetch_for_user(uuid, uuid, timestamptz)
  TO service_role;

COMMENT ON FUNCTION public.charge_property_report_fetch_for_user(uuid, uuid, timestamptz) IS
  'Atomically charges one property-report usage row for a cached report, returning alreadyPaid on concurrent/repeated fetches.';
