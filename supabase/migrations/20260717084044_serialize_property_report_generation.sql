-- Prevent concurrent cache misses from issuing duplicate MAIProp OS report
-- requests. The table stays in the non-exposed private schema and callers can
-- only acquire/release short-lived leases through service-role RPCs.

CREATE TABLE IF NOT EXISTS private.property_report_generation_leases (
  listing_id uuid NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'valuation'
    CHECK (report_type = 'valuation'),
  lang text NOT NULL CHECK (lang IN ('en', 'el')),
  holder uuid NOT NULL,
  lease_until timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (listing_id, report_type, lang)
);

REVOKE ALL ON TABLE private.property_report_generation_leases
  FROM PUBLIC, anon, authenticated;

CREATE INDEX IF NOT EXISTS idx_property_report_generation_leases_expiry
  ON private.property_report_generation_leases (lease_until);

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

COMMENT ON FUNCTION public.claim_property_report_generation(
  uuid, text, uuid, integer
) IS 'Service-only expiring lease that serializes external property report generation per listing and language.';

DO $$
BEGIN
  IF pg_catalog.has_function_privilege(
    'authenticated',
    'public.claim_property_report_generation(uuid,text,uuid,integer)',
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'authenticated',
    'public.release_property_report_generation(uuid,text,uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'property report generation lease is browser executable';
  END IF;
END
$$;
