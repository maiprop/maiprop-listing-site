-- Repair the initial lease functions for databases where the first migration
-- was already applied. COALESCE is SQL syntax and cannot be schema-qualified.

CREATE OR REPLACE FUNCTION public.claim_property_report_generation(
  p_listing_id uuid,
  p_lang text,
  p_holder uuid,
  p_lease_seconds integer DEFAULT 45
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed boolean := false;
BEGIN
  IF p_listing_id IS NULL
     OR p_lang NOT IN ('en', 'el')
     OR p_holder IS NULL
     OR p_lease_seconds < 5
     OR p_lease_seconds > 120 THEN
    RAISE EXCEPTION 'invalid_property_report_generation_lease'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO private.property_report_generation_leases AS leases (
    listing_id,
    report_type,
    lang,
    holder,
    lease_until,
    updated_at
  )
  VALUES (
    p_listing_id,
    'valuation',
    p_lang,
    p_holder,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds),
    pg_catalog.now()
  )
  ON CONFLICT (listing_id, report_type, lang)
  DO UPDATE SET
    holder = EXCLUDED.holder,
    lease_until = EXCLUDED.lease_until,
    updated_at = pg_catalog.now()
  WHERE leases.lease_until <= pg_catalog.now()
     OR leases.holder = EXCLUDED.holder
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_property_report_generation(
  p_listing_id uuid,
  p_lang text,
  p_holder uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released boolean := false;
BEGIN
  DELETE FROM private.property_report_generation_leases
  WHERE listing_id = p_listing_id
    AND report_type = 'valuation'
    AND lang = p_lang
    AND holder = p_holder
  RETURNING true INTO v_released;

  RETURN COALESCE(v_released, false);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_property_report_generation(
  uuid, text, uuid, integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_property_report_generation(
  uuid, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_property_report_generation(
  uuid, text, uuid, integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_property_report_generation(
  uuid, text, uuid
) TO service_role;
