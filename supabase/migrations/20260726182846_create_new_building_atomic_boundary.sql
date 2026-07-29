-- Create a project, its inventory, one representative catalogue listing, and
-- media in a single transaction. The service boundary supplies descriptive
-- input; this function owns tenant authorization and every commercial field.

CREATE OR REPLACE FUNCTION public.create_new_building_listing_for_service(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_project_kind text,
  p_project jsonb,
  p_units jsonb,
  p_project_media jsonb,
  p_listing jsonb,
  p_additional_image_urls jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
  v_listing_id uuid;
  v_existing_project public.projects%ROWTYPE;
  v_unit jsonb;
  v_media jsonb;
  v_image jsonb;
  v_representative jsonb;
  v_image_index integer := 0;
  v_permit_approval_date date;
  v_construction_start_date date;
  v_structural_completion_date date;
  v_delivery_date date;
  v_construction_year integer;
  v_renovation_year integer;
  v_construction_status text;
  v_year_built integer;
  v_tags text[];
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_project_kind NOT IN ('new_build', 'renovation') THEN
    RAISE EXCEPTION 'project_kind_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT private.has_developer_listing_access(p_actor_user_id) THEN
    RAISE EXCEPTION 'developer_pro_required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NOT NULL
     AND NOT private.has_org_permission(
       p_organization_id,
       'project:manage',
       p_actor_user_id
     ) THEN
    RAISE EXCEPTION 'organization_project_manage_required'
      USING ERRCODE = '42501';
  END IF;

  v_project_id := NULLIF(p_project->>'id', '')::uuid;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id_required' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries for the client-generated project id. A successful retry
  -- returns the original catalogue listing instead of creating duplicates.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('create-new-building:' || v_project_id::text, 0)
  );

  SELECT project.*
  INTO v_existing_project
  FROM public.projects AS project
  WHERE project.id = v_project_id;

  IF FOUND THEN
    IF v_existing_project.owner_id IS DISTINCT FROM p_actor_user_id
       OR v_existing_project.organization_id IS DISTINCT FROM p_organization_id
       OR NOT private.can_manage_project(v_project_id, p_actor_user_id) THEN
      RAISE EXCEPTION 'project_id_conflict' USING ERRCODE = '23505';
    END IF;

    SELECT listing.id
    INTO v_listing_id
    FROM public.listings AS listing
    WHERE listing.project_id = v_project_id
      AND listing.owner_id = p_actor_user_id
      AND listing.organization_id IS NOT DISTINCT FROM p_organization_id
      AND listing.listing_type = 'new_build'::public.listing_type
    ORDER BY listing.created_at ASC, listing.id ASC
    LIMIT 1;

    IF v_listing_id IS NULL THEN
      RAISE EXCEPTION 'project_creation_incomplete' USING ERRCODE = '55000';
    END IF;

    RETURN jsonb_build_object(
      'listingId', v_listing_id,
      'projectId', v_project_id,
      'idempotent', true
    );
  END IF;

  IF NULLIF(BTRIM(p_project->>'name'), '') IS NULL
     OR NULLIF(BTRIM(p_project->>'city'), '') IS NULL THEN
    RAISE EXCEPTION 'project_name_and_city_required' USING ERRCODE = '22023';
  END IF;

  IF p_project_kind = 'new_build'
     AND NULLIF(BTRIM(p_project->>'building_permit_number'), '') IS NULL THEN
    RAISE EXCEPTION 'building_permit_required' USING ERRCODE = '22023';
  END IF;

  IF (NULLIF(p_project->>'latitude', '') IS NULL)
     <> (NULLIF(p_project->>'longitude', '') IS NULL) THEN
    RAISE EXCEPTION 'project_coordinates_incomplete' USING ERRCODE = '22023';
  END IF;

  v_permit_approval_date :=
    NULLIF(p_project->>'permit_approval_date', '')::date;
  v_construction_start_date :=
    NULLIF(p_project->>'construction_start_date', '')::date;
  v_structural_completion_date :=
    NULLIF(p_project->>'structural_completion_date', '')::date;
  v_delivery_date := NULLIF(p_project->>'delivery_date', '')::date;

  IF (
    v_permit_approval_date IS NOT NULL
    AND COALESCE(
      v_construction_start_date,
      v_structural_completion_date,
      v_delivery_date
    ) IS NOT NULL
    AND v_permit_approval_date > COALESCE(
      v_construction_start_date,
      v_structural_completion_date,
      v_delivery_date
    )
  ) OR (
    v_construction_start_date IS NOT NULL
    AND COALESCE(v_structural_completion_date, v_delivery_date) IS NOT NULL
    AND v_construction_start_date >
      COALESCE(v_structural_completion_date, v_delivery_date)
  ) OR (
    v_structural_completion_date IS NOT NULL
    AND v_delivery_date IS NOT NULL
    AND v_structural_completion_date > v_delivery_date
  ) THEN
    RAISE EXCEPTION 'project_dates_out_of_order' USING ERRCODE = '22023';
  END IF;

  v_construction_year := NULLIF(p_project->>'construction_year', '')::integer;
  v_renovation_year := NULLIF(p_project->>'renovation_year', '')::integer;
  IF p_project_kind = 'renovation' AND (
    v_construction_year IS NULL
    OR v_renovation_year IS NULL
    OR v_construction_year < 1800
    OR v_renovation_year < v_construction_year
    OR v_renovation_year > EXTRACT(YEAR FROM CURRENT_DATE)::integer + 5
  ) THEN
    RAISE EXCEPTION 'renovation_years_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_units) <> 'array'
     OR jsonb_array_length(p_units) < 1
     OR jsonb_array_length(p_units) > 100 THEN
    RAISE EXCEPTION 'new_build_unit_count_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_project_media) <> 'array'
     OR jsonb_array_length(p_project_media) > 20 THEN
    RAISE EXCEPTION 'project_media_count_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_additional_image_urls) <> 'array'
     OR jsonb_array_length(p_additional_image_urls) > 250 THEN
    RAISE EXCEPTION 'listing_image_count_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT item.value
  INTO v_representative
  FROM jsonb_array_elements(p_units) WITH ORDINALITY AS item(value, ordinality)
  ORDER BY ROUND((item.value->>'price')::numeric, 2) ASC, item.ordinality ASC
  LIMIT 1;

  IF v_representative IS NULL THEN
    RAISE EXCEPTION 'new_build_unit_count_invalid' USING ERRCODE = '22023';
  END IF;

  v_construction_status := CASE
    WHEN p_project_kind = 'renovation' THEN 'renovated'
    WHEN v_structural_completion_date IS NOT NULL THEN 'shell_complete'
    WHEN v_construction_start_date IS NOT NULL THEN 'under_construction'
    ELSE 'planning'
  END;
  v_year_built := CASE
    WHEN p_project_kind = 'renovation' THEN v_construction_year
    WHEN v_delivery_date IS NOT NULL
      THEN EXTRACT(YEAR FROM v_delivery_date)::integer
    ELSE NULL
  END;
  v_tags := CASE
    WHEN p_project_kind = 'renovation' THEN ARRAY[
      'renovation_project',
      'renovation_year:' || v_renovation_year::text
    ]
    ELSE NULL
  END;

  INSERT INTO public.projects (
    id,
    owner_id,
    organization_id,
    name,
    building_permit_number,
    developer_company,
    architect_group,
    construction_company,
    description,
    address,
    city,
    municipality,
    area_description,
    latitude,
    longitude,
    permit_approval_date,
    construction_start_date,
    structural_completion_date,
    delivery_date,
    status
  )
  VALUES (
    v_project_id,
    p_actor_user_id,
    p_organization_id,
    BTRIM(p_project->>'name'),
    NULLIF(BTRIM(p_project->>'building_permit_number'), ''),
    NULLIF(BTRIM(p_project->>'developer_company'), ''),
    NULLIF(BTRIM(p_project->>'architect_group'), ''),
    NULLIF(BTRIM(p_project->>'construction_company'), ''),
    NULLIF(BTRIM(p_project->>'description'), ''),
    NULLIF(BTRIM(p_project->>'address'), ''),
    BTRIM(p_project->>'city'),
    NULLIF(BTRIM(p_project->>'municipality'), ''),
    NULLIF(BTRIM(p_project->>'area_description'), ''),
    NULLIF(p_project->>'latitude', '')::numeric,
    NULLIF(p_project->>'longitude', '')::numeric,
    v_permit_approval_date,
    v_construction_start_date,
    v_structural_completion_date,
    v_delivery_date,
    'active'
  );

  FOR v_unit IN
    SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    IF COALESCE(ROUND(NULLIF(v_unit->>'price', '')::numeric, 2), 0) <= 0
       OR COALESCE(ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2), 0) <= 0 THEN
      RAISE EXCEPTION 'new_build_unit_price_or_size_invalid'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.project_units (
      project_id,
      unit_id,
      floor,
      unit_number,
      availability_status,
      internal_sqm,
      balcony_sqm,
      storage_sqm,
      parking_sqm,
      bedrooms,
      bathrooms,
      kitchen_type,
      living_rooms,
      price,
      price_per_sqm,
      vat_included,
      parking_price,
      storage_price,
      sea_view,
      city_view,
      mountain_view,
      energy_class,
      heating_system,
      cooling_system
    )
    VALUES (
      v_project_id,
      NULLIF(BTRIM(v_unit->>'unit_id'), ''),
      NULLIF(v_unit->>'floor', '')::integer,
      NULLIF(BTRIM(v_unit->>'unit_number'), ''),
      'available',
      ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2),
      NULLIF(v_unit->>'balcony_sqm', '')::numeric,
      NULLIF(v_unit->>'storage_sqm', '')::numeric,
      NULLIF(v_unit->>'parking_sqm', '')::numeric,
      NULLIF(v_unit->>'bedrooms', '')::integer,
      NULLIF(v_unit->>'bathrooms', '')::integer,
      NULLIF(BTRIM(v_unit->>'kitchen_type'), ''),
      NULLIF(v_unit->>'living_rooms', '')::integer,
      ROUND(NULLIF(v_unit->>'price', '')::numeric, 2),
      ROUND(
        ROUND(NULLIF(v_unit->>'price', '')::numeric, 2)
        / NULLIF(ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2), 0),
        2
      ),
      COALESCE(NULLIF(v_unit->>'vat_included', '')::boolean, true),
      NULLIF(v_unit->>'parking_price', '')::numeric,
      NULLIF(v_unit->>'storage_price', '')::numeric,
      COALESCE(NULLIF(v_unit->>'sea_view', '')::boolean, false),
      COALESCE(NULLIF(v_unit->>'city_view', '')::boolean, false),
      COALESCE(NULLIF(v_unit->>'mountain_view', '')::boolean, false),
      NULLIF(BTRIM(v_unit->>'energy_class'), ''),
      NULLIF(BTRIM(v_unit->>'heating_system'), ''),
      NULLIF(BTRIM(v_unit->>'cooling_system'), '')
    );
  END LOOP;

  IF NULLIF(BTRIM(p_listing->>'title'), '') IS NULL
     OR NULLIF(BTRIM(p_listing->>'cover_image_url'), '') IS NULL THEN
    RAISE EXCEPTION 'listing_title_and_cover_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.listings (
    owner_id,
    organization_id,
    project_id,
    title,
    description,
    city,
    address,
    latitude,
    longitude,
    property_type,
    listing_type,
    price,
    sqm,
    price_per_sqm,
    bedrooms,
    bathrooms,
    living_rooms,
    floor,
    energy_class,
    heating_system,
    construction_status,
    year_built,
    cover_image_url,
    status,
    is_pre_sale,
    tags
  )
  VALUES (
    p_actor_user_id,
    p_organization_id,
    v_project_id,
    BTRIM(p_listing->>'title'),
    NULLIF(BTRIM(p_listing->>'description'), ''),
    BTRIM(p_project->>'city'),
    NULLIF(BTRIM(p_project->>'address'), ''),
    NULLIF(p_project->>'latitude', '')::numeric,
    NULLIF(p_project->>'longitude', '')::numeric,
    'apartment'::public.property_type,
    'new_build'::public.listing_type,
    ROUND((v_representative->>'price')::numeric, 2),
    ROUND((v_representative->>'internal_sqm')::numeric, 2),
    ROUND(
      ROUND((v_representative->>'price')::numeric, 2)
      / NULLIF(ROUND((v_representative->>'internal_sqm')::numeric, 2), 0),
      2
    ),
    NULLIF(v_representative->>'bedrooms', '')::integer,
    NULLIF(v_representative->>'bathrooms', '')::integer,
    NULLIF(v_representative->>'living_rooms', '')::integer,
    NULLIF(v_representative->>'floor', '')::integer,
    NULLIF(BTRIM(v_representative->>'energy_class'), ''),
    NULLIF(BTRIM(v_representative->>'heating_system'), ''),
    v_construction_status,
    v_year_built,
    BTRIM(p_listing->>'cover_image_url'),
    'active'::public.listing_status,
    false,
    v_tags
  )
  RETURNING id INTO v_listing_id;

  UPDATE public.project_units
  SET listing_id = v_listing_id
  WHERE project_id = v_project_id;

  FOR v_media IN
    SELECT value FROM jsonb_array_elements(p_project_media)
  LOOP
    INSERT INTO public.project_media (
      project_id,
      url,
      media_type,
      title,
      sort_order
    )
    VALUES (
      v_project_id,
      BTRIM(v_media->>'url'),
      BTRIM(v_media->>'media_type'),
      NULLIF(BTRIM(v_media->>'title'), ''),
      COALESCE(NULLIF(v_media->>'sort_order', '')::integer, 0)
    );
  END LOOP;

  FOR v_image IN
    SELECT value FROM jsonb_array_elements(p_additional_image_urls)
  LOOP
    v_image_index := v_image_index + 1;
    INSERT INTO public.listing_images (
      listing_id,
      url,
      sort_order
    )
    VALUES (
      v_listing_id,
      BTRIM(v_image #>> '{}'),
      v_image_index
    );
  END LOOP;

  RETURN jsonb_build_object(
    'listingId', v_listing_id,
    'projectId', v_project_id,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_new_building_listing_for_service(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_new_building_listing_for_service(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) TO service_role;

COMMENT ON FUNCTION public.create_new_building_listing_for_service(
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) IS
  'Service-only retry-safe creation boundary. Authorizes optional tenant ownership and derives listing classification, status, pricing, and renovation metadata.';
