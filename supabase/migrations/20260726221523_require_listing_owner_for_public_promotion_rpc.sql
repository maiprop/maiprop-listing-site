-- The customer-facing allocator spends the accountable owner's personal plan
-- allowance or add-on credits. Organization colleagues and platform admins
-- must not spend those credits. Platform merchandising uses the separate
-- service-only admin_set_listing_promotion RPC and records source_type=admin.

CREATE OR REPLACE FUNCTION public.activate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_owner_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT listing.owner_id
  INTO v_owner_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id;

  IF v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN private.activate_listing_promotion(
    p_listing_id,
    p_promotion_type,
    p_request_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_owner_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT listing.owner_id
  INTO v_owner_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id;

  IF v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN private.deactivate_listing_promotion(
    p_listing_id,
    p_promotion_type
  );
END;
$$;

REVOKE ALL ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.deactivate_listing_promotion(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.activate_listing_promotion(uuid, text, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION private.deactivate_listing_promotion(uuid, text)
  TO service_role;

REVOKE ALL ON FUNCTION public.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.deactivate_listing_promotion(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_listing_promotion(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_listing_promotion(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.activate_listing_promotion(uuid, text, text) IS
  'Owner-only customer allocator for personal plan and paid add-on promotion credits.';
COMMENT ON FUNCTION public.deactivate_listing_promotion(uuid, text) IS
  'Owner-only customer revocation boundary; admin grants use the dedicated service workflow.';
