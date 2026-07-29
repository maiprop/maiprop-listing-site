-- Close the remaining tenant-aware listing mutation gaps without restoring
-- raw table DML. Organization context is a separate trusted RPC argument,
-- quota is always evaluated for the listing owner, and browser callers cannot
-- forge the reserved provenance tags consumed by the public auction pipeline.

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
        )
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION private.assert_listing_payload_keys(
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  v_unknown text[];
  v_reserved_tags text[];
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'invalid_listing_payload' USING ERRCODE = '22023';
  END IF;

  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_unknown
  FROM jsonb_object_keys(p_payload) AS key_name
  WHERE NOT key_name = ANY (private.listing_client_writable_columns());

  IF v_unknown IS NOT NULL THEN
    RAISE EXCEPTION 'listing_fields_not_writable: %', array_to_string(v_unknown, ', ')
      USING ERRCODE = '42501';
  END IF;

  IF p_payload ? 'tags' AND p_payload->'tags' <> 'null'::jsonb THEN
    IF jsonb_typeof(p_payload->'tags') <> 'array' THEN
      RAISE EXCEPTION 'invalid_listing_tags' USING ERRCODE = '22023';
    END IF;

    SELECT array_agg(tag_name ORDER BY tag_name)
    INTO v_reserved_tags
    FROM jsonb_array_elements_text(p_payload->'tags') AS client_tag(tag_name)
    WHERE tag_name = 'source:maiprop-os'
       OR tag_name LIKE 'os_auction:%'
       OR tag_name LIKE 'auction_pool:%';

    IF v_reserved_tags IS NOT NULL THEN
      RAISE EXCEPTION 'listing_reserved_tags_not_writable: %',
        array_to_string(v_reserved_tags, ', ')
        USING ERRCODE = '42501';
    END IF;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.check_listing_quota_for_owner(
  p_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('listing_quota:' || p_owner_user_id::text)
  );

  v_limit := public.get_listing_limit(p_owner_user_id);
  IF v_limit >= 999 THEN
    RETURN true;
  END IF;

  IF v_limit <= 0 THEN
    RETURN false;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.listings
  WHERE owner_id = p_owner_user_id
    AND COALESCE(status::text, 'active') NOT IN (
      'deleted',
      'archived',
      'closed',
      'expired',
      'cancelled',
      'withdrawn'
    );

  RETURN v_count < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_listing_quota()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN false;
  END IF;

  RETURN private.check_listing_quota_for_owner(v_actor);
END;
$$;

CREATE OR REPLACE FUNCTION private.check_listing_quota()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.check_listing_quota_for_owner((SELECT auth.uid()));
$$;

CREATE OR REPLACE FUNCTION public.check_listing_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_limit integer;
BEGIN
  -- Trusted service paths own their own entitlement checks.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_owner_must_match_actor'
      USING ERRCODE = '42501';
  END IF;

  v_limit := public.get_listing_limit(NEW.owner_id);
  IF v_limit <= 0 THEN
    RAISE EXCEPTION 'listing_not_allowed'
      USING HINT = 'Your account type cannot create listings';
  END IF;

  IF NOT private.check_listing_quota_for_owner(NEW.owner_id) THEN
    RAISE EXCEPTION 'listing_limit_reached'
      USING HINT = 'Upgrade to Pro for more listings';
  END IF;

  RETURN NEW;
END;
$$;

-- Replace the one-argument wrapper with one uniquely named PostgREST function
-- signature. The default keeps older clients that only send p_payload working.
DROP FUNCTION IF EXISTS public.create_listing_for_user(jsonb, uuid);
DROP FUNCTION IF EXISTS public.create_listing_for_user(jsonb);
DROP FUNCTION IF EXISTS private.create_listing_for_actor(jsonb, uuid);
DROP FUNCTION IF EXISTS private.create_listing_for_actor(jsonb);

CREATE OR REPLACE FUNCTION private.create_listing_for_actor(
  p_payload jsonb,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_payload jsonb;
  v_keys text[];
  v_columns text;
  v_values text;
  v_row public.listings%ROWTYPE;
  v_price numeric;
  v_sqm numeric;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_listing_payload_keys(p_payload);

  IF p_organization_id IS NOT NULL
     AND NOT private.has_org_permission(
       p_organization_id,
       'listing:manage',
       v_actor
     ) THEN
    RAISE EXCEPTION 'organization_listing_not_managed'
      USING ERRCODE = '42501';
  END IF;

  IF NOT p_payload ?& ARRAY[
    'title',
    'city',
    'price',
    'sqm',
    'property_type',
    'listing_type'
  ] THEN
    RAISE EXCEPTION 'listing_required_fields_missing' USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'listing_type' = 'new_build' THEN
    RAISE EXCEPTION 'new_build_requires_project_boundary' USING ERRCODE = '42501';
  END IF;

  v_payload := p_payload - 'price_per_sqm';
  v_price := NULLIF(v_payload->>'price', '')::numeric;
  v_sqm := NULLIF(v_payload->>'sqm', '')::numeric;
  v_payload := v_payload || jsonb_build_object(
    'price_per_sqm',
    CASE
      WHEN v_price > 0 AND v_sqm > 0 THEN round(v_price / v_sqm)
      ELSE NULL
    END
  );

  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_keys
  FROM jsonb_object_keys(v_payload) AS key_name
  WHERE key_name = ANY (
    private.listing_client_writable_columns() || ARRAY['price_per_sqm']::text[]
  );

  SELECT
    string_agg(format('%I', key_name), ', '),
    string_agg(
      format('(jsonb_populate_record(NULL::public.listings, $3)).%I', key_name),
      ', '
    )
  INTO v_columns, v_values
  FROM unnest(v_keys) AS key_name;

  EXECUTE format(
    'INSERT INTO public.listings (owner_id, organization_id, %s) '
      || 'SELECT $1, $2, %s RETURNING *',
    v_columns,
    v_values
  )
  USING v_actor, p_organization_id, v_payload
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'organization_id', v_row.organization_id,
    'status', v_row.status,
    'listing_type', v_row.listing_type,
    'updated_at', v_row.updated_at
  );
END;
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
     AND NOT private.check_listing_quota_for_owner(v_existing.owner_id) THEN
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
    'UPDATE public.listings AS listing SET %s '
      || 'WHERE listing.id = $1 RETURNING listing.*',
    v_assignments
  )
  USING p_id, v_updates
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'organization_id', v_row.organization_id,
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

CREATE OR REPLACE FUNCTION public.create_listing_for_user(
  p_payload jsonb,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.create_listing_for_actor(p_payload, p_organization_id);
$$;

REVOKE ALL ON FUNCTION private.can_manage_listing(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_listing(uuid, uuid)
  TO service_role;

REVOKE ALL ON FUNCTION private.assert_listing_payload_keys(jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.check_listing_quota_for_owner(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_listing_for_actor(jsonb, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION private.update_listing_for_actor(uuid, jsonb)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION private.delete_listing_for_actor(uuid)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION private.create_listing_for_actor(jsonb, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_listing_for_actor(uuid, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION private.delete_listing_for_actor(uuid)
  TO authenticated;

REVOKE ALL ON FUNCTION public.create_listing_for_user(jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing_for_user(jsonb, uuid)
  TO authenticated;

COMMENT ON FUNCTION private.can_manage_listing(uuid, uuid) IS
  'Canonical personal-owner or active organization listing-management authorization.';
COMMENT ON FUNCTION private.check_listing_quota_for_owner(uuid) IS
  'Race-resistant owner-scoped listing quota guard that ignores terminal listings.';
COMMENT ON FUNCTION public.create_listing_for_user(jsonb, uuid) IS
  'Creates a personal or authorized organization listing while deriving ownership server-side.';
