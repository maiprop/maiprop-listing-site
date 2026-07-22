-- Authenticated listing writes are exposed as narrow RPCs rather than raw
-- table DML. The implementation keeps auth.uid() visible to existing quota,
-- lifecycle, project-integrity and account-deletion triggers while preventing
-- callers from writing ownership, promotion, analytics or generated columns.

CREATE OR REPLACE FUNCTION private.listing_client_writable_columns()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT ARRAY[
    'title', 'description', 'address', 'city', 'region', 'postal_code',
    'latitude', 'longitude', 'price', 'price_per_sqm', 'sqm', 'bedrooms',
    'bathrooms', 'floor', 'total_floors', 'year_built', 'energy_class',
    'property_type', 'listing_type', 'status', 'auction_date',
    'auction_starting_bid', 'auction_court', 'has_parking', 'has_pool',
    'has_elevator', 'has_garden', 'has_storage', 'has_security',
    'has_smart_home', 'has_video_tour', 'has_virtual_tour',
    'cadastre_number', 'enfia_zone', 'tags', 'cover_image_url', 'wc_count',
    'kitchens', 'living_rooms', 'levels', 'heating_system',
    'construction_status', 'has_ac', 'has_solar_water', 'has_fireplace',
    'has_underfloor_heating', 'has_furnished', 'has_alarm', 'has_cctv',
    'has_secure_door', 'has_internal_staircase', 'has_double_glazing',
    'has_window_screens', 'has_night_power', 'has_attic', 'has_satellite',
    'has_painted', 'has_balcony', 'has_view', 'has_facade', 'has_awning',
    'has_disability_access', 'is_corner', 'is_penthouse',
    'is_neoclassical', 'is_preserved', 'suitable_student',
    'suitable_holiday', 'suitable_investment', 'suitable_commercial_use',
    'deposit_months', 'monthly_expenses', 'agent_fee_included',
    'pets_allowed', 'short_term_rental', 'available_from',
    'min_rental_months', 'is_buildable', 'within_city_plan',
    'within_settlement', 'coverage_ratio', 'building_allowance',
    'facade_length', 'plot_depth', 'slope', 'zone_type', 'road_type',
    'has_water_supply', 'has_electricity_supply', 'land_use',
    'distance_from_sea', 'distance_from_city', 'has_land_concession',
    'plot_surface', 'commercial_subtype', 'floor_height',
    'has_three_phase_power', 'has_loading_dock', 'has_structured_cabling',
    'has_equipped', 'website_url', 'is_off_market', 'is_pre_sale',
    'open_house_date', 'open_house_transaction_type'
  ]::text[];
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
END;
$$;

CREATE OR REPLACE FUNCTION private.create_listing_for_actor(p_payload jsonb)
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

  IF NOT p_payload ?& ARRAY['title', 'city', 'price', 'sqm', 'property_type', 'listing_type'] THEN
    RAISE EXCEPTION 'listing_required_fields_missing' USING ERRCODE = '22023';
  END IF;

  IF p_payload->>'listing_type' = 'new_build' THEN
    RAISE EXCEPTION 'new_build_requires_project_boundary' USING ERRCODE = '42501';
  END IF;

  -- Price per square metre is derived server-side. Existing clients may still
  -- send the field, but its value is intentionally ignored.
  v_payload := p_payload - 'price_per_sqm';
  v_price := NULLIF(v_payload->>'price', '')::numeric;
  v_sqm := NULLIF(v_payload->>'sqm', '')::numeric;
  v_payload := v_payload || jsonb_build_object(
    'price_per_sqm',
    CASE WHEN v_price > 0 AND v_sqm > 0 THEN round(v_price / v_sqm) ELSE NULL END
  );

  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_keys
  FROM jsonb_object_keys(v_payload) AS key_name
  WHERE key_name = ANY (
    private.listing_client_writable_columns() || ARRAY['price_per_sqm']::text[]
  );

  SELECT string_agg(format('%I', key_name), ', '),
         string_agg(
           format('(jsonb_populate_record(NULL::public.listings, $2)).%I', key_name),
           ', '
         )
  INTO v_columns, v_values
  FROM unnest(v_keys) AS key_name;

  EXECUTE format(
    'INSERT INTO public.listings (owner_id, %s) SELECT $1, %s RETURNING *',
    v_columns,
    v_values
  )
  USING v_actor, v_payload
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

  IF NOT FOUND OR v_existing.owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_not_owned' USING ERRCODE = '42501';
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
  v_listing public.listings%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT listing.*
  INTO v_listing
  FROM public.listings AS listing
  WHERE listing.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR NOT (
    (v_listing.organization_id IS NULL AND v_listing.owner_id = v_actor)
    OR (
      v_listing.organization_id IS NOT NULL
      AND private.has_org_permission(v_listing.organization_id, 'listing:manage', v_actor)
    )
  ) THEN
    RAISE EXCEPTION 'listing_not_managed' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.listings WHERE id = p_id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_listing_for_user(p_payload jsonb)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.create_listing_for_actor(p_payload);
$$;

CREATE OR REPLACE FUNCTION public.update_listing_for_user(
  p_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.update_listing_for_actor(p_id, p_updates);
$$;

CREATE OR REPLACE FUNCTION public.delete_listing_for_user(p_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.delete_listing_for_actor(p_id);
$$;

REVOKE ALL ON FUNCTION private.listing_client_writable_columns() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.assert_listing_payload_keys(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.create_listing_for_actor(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.update_listing_for_actor(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.delete_listing_for_actor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.create_listing_for_actor(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.update_listing_for_actor(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION private.delete_listing_for_actor(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.create_listing_for_user(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.update_listing_for_user(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_listing_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing_for_user(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_listing_for_user(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_listing_for_user(uuid) TO authenticated;

-- Browser clients now mutate listings only through the RPCs above. Existing
-- RLS policies and triggers remain defense in depth for trusted server paths.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.listings FROM authenticated;
REVOKE SELECT (id, owner_id) ON TABLE public.listings FROM authenticated;

COMMENT ON TABLE public.listings IS
  'Raw listing storage. Public/management reads use scoped projections; authenticated writes use allowlisted listing mutation RPCs.';
