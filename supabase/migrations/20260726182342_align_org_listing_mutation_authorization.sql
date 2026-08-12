-- Keep authenticated listing mutations aligned with the tenant-aware RLS
-- contract. Client-writable fields remain constrained by the existing positive
-- allowlist; this migration changes authorization only.

CREATE OR REPLACE FUNCTION private.can_manage_listing(
  p_listing_id uuid,
  p_actor_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_actor_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = p_listing_id
        AND (
          (
            listing.organization_id IS NULL
            AND listing.owner_id = p_actor_user_id
          )
          OR (
            listing.organization_id IS NOT NULL
            AND private.has_org_permission(
              listing.organization_id,
              'listing:manage',
              p_actor_user_id
            )
          )
          OR private.has_platform_admin(p_actor_user_id)
        )
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION private.update_listing_for_actor(
  p_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_existing public.listings%ROWTYPE;
  v_updates jsonb;
  v_keys text[];
  v_assignments text;
  v_row public.listings%ROWTYPE;
  v_target_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_listing_payload_keys(p_updates);

  SELECT listing.*
  INTO v_existing
  FROM public.listings AS listing
  WHERE listing.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR NOT private.can_manage_listing(p_id, v_actor) THEN
    RAISE EXCEPTION 'listing_not_managed' USING ERRCODE = '42501';
  END IF;

  IF p_updates ? 'listing_type'
     AND p_updates->>'listing_type' = 'new_build'
     AND v_existing.listing_type::text <> 'new_build' THEN
    RAISE EXCEPTION 'new_build_requires_project_boundary' USING ERRCODE = '42501';
  END IF;

  v_updates := p_updates - 'price_per_sqm';
  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_keys
  FROM jsonb_object_keys(v_updates) AS key_name
  WHERE key_name = ANY (private.listing_client_writable_columns())
    AND key_name <> 'price_per_sqm';

  IF v_keys IS NULL OR cardinality(v_keys) = 0 THEN
    RAISE EXCEPTION 'listing_update_empty' USING ERRCODE = '22023';
  END IF;

  v_target_status := COALESCE(v_updates->>'status', v_existing.status::text);
  IF v_existing.status::text <> 'active'
     AND v_target_status = 'active'
     AND NOT public.check_listing_quota() THEN
    RAISE EXCEPTION 'listing_limit_reached'
      USING ERRCODE = 'P0001', HINT = 'Upgrade to Pro for more listings';
  END IF;

  SELECT string_agg(
    format('%1$I = (jsonb_populate_record(listing, $2)).%1$I', key_name),
    ', '
  )
  INTO v_assignments
  FROM unnest(v_keys) AS key_name;

  IF v_updates ? 'price' OR v_updates ? 'sqm' THEN
    v_assignments := v_assignments || ', price_per_sqm = CASE'
      || ' WHEN COALESCE((jsonb_populate_record(listing, $2)).price, 0) > 0'
      || ' AND COALESCE((jsonb_populate_record(listing, $2)).sqm, 0) > 0'
      || ' THEN round((jsonb_populate_record(listing, $2)).price'
      || ' / (jsonb_populate_record(listing, $2)).sqm) ELSE NULL END';
  END IF;

  EXECUTE format(
    'UPDATE public.listings AS listing SET %s WHERE listing.id = $1 RETURNING listing.*',
    v_assignments
  )
  USING p_id, v_updates
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'status', v_row.status,
    'listing_type', v_row.listing_type,
    'updated_at', v_row.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.delete_listing_for_actor(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  PERFORM 1
  FROM public.listings AS listing
  WHERE listing.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR NOT private.can_manage_listing(p_id, v_actor) THEN
    RAISE EXCEPTION 'listing_not_managed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.listings WHERE id = p_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION private.can_manage_listing(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_listing(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION private.update_listing_for_actor(uuid, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION private.delete_listing_for_actor(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.update_listing_for_actor(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.delete_listing_for_actor(uuid)
  TO authenticated;

COMMENT ON FUNCTION private.can_manage_listing(uuid, uuid) IS
  'Canonical personal, active-organization-membership, or platform-admin listing management authorization.';
