CREATE OR REPLACE FUNCTION private.admin_update_listing_promotion_expiry(
  p_listing_id uuid,
  p_promotion_type text,
  p_ends_at timestamptz,
  p_actor_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now timestamptz := statement_timestamp();
  v_listing_type text;
BEGIN
  IF p_promotion_type NOT IN ('spotlight', 'priority') THEN
    RAISE EXCEPTION 'invalid_promotion_type' USING ERRCODE = '22023';
  END IF;
  IF p_ends_at IS NULL OR p_ends_at <= v_now THEN
    RAISE EXCEPTION 'promotion_expiry_must_be_future' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_platform_admin(p_actor_id) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;

  SELECT listing.listing_type::text
  INTO v_listing_type
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_listing_type = 'open_house' THEN
    RAISE EXCEPTION 'open_house_promotion_not_supported' USING ERRCODE = '22023';
  END IF;

  UPDATE public.listing_promotion_allocations
  SET ends_at = p_ends_at,
      updated_at = v_now
  WHERE listing_id = p_listing_id
    AND promotion_type = p_promotion_type
    AND status = 'active'
    AND ends_at > v_now;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_promotion_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_listing_promotion_expiry(
  p_listing_id uuid,
  p_promotion_type text,
  p_ends_at timestamptz,
  p_actor_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.admin_update_listing_promotion_expiry(
    p_listing_id,
    p_promotion_type,
    p_ends_at,
    p_actor_id
  );
$$;

REVOKE ALL ON FUNCTION private.admin_update_listing_promotion_expiry(
  uuid,
  text,
  timestamptz,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.admin_update_listing_promotion_expiry(
  uuid,
  text,
  timestamptz,
  uuid
) TO service_role;

REVOKE ALL ON FUNCTION public.admin_update_listing_promotion_expiry(
  uuid,
  text,
  timestamptz,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_listing_promotion_expiry(
  uuid,
  text,
  timestamptz,
  uuid
) TO service_role;

COMMENT ON FUNCTION public.admin_update_listing_promotion_expiry(
  uuid,
  text,
  timestamptz,
  uuid
) IS 'Updates only an active promotion expiry while preserving its campaign start and billing attribution.';
