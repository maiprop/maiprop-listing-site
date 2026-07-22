-- ECAS public-data boundary hardening, phase A.
--
-- Quick Sale and professional verification controls are safe to enforce in
-- this migration because their privileged writes already use authenticated
-- Edge Functions or the platform-admin session. The listing projection is
-- deliberately additive: Cloudflare and browser consumers must switch to the
-- projection before a later migration tightens legacy base-table privileges.

-- Investors read the sanitized feed, never the seller/admin workflow row.
DROP POLICY IF EXISTS "firesale_requests_select" ON public.firesale_requests;
CREATE POLICY "firesale_requests_select"
  ON public.firesale_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

REVOKE ALL ON TABLE public.firesale_requests_investor_feed
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.firesale_requests_investor_feed TO authenticated;

-- Workflow fields are owned by admin-firesale-action and other authenticated
-- Edge boundaries. Sellers retain read access to their own submissions.
DROP POLICY IF EXISTS "firesale_requests_update" ON public.firesale_requests;
CREATE POLICY "firesale_requests_update"
  ON public.firesale_requests
  FOR UPDATE
  TO authenticated
  USING (private.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (private.has_platform_admin((SELECT auth.uid())));

COMMENT ON POLICY "firesale_requests_update" ON public.firesale_requests IS
  'Platform-admin compatibility policy; authenticated Quick Sale writes remain behind authenticated Edge Functions.';

-- A professional may maintain public profile content, but verification,
-- moderation notes and subscription state are platform-owned. Guard INSERT as
-- well as UPDATE so direct Data API calls cannot create a pre-verified profile.
CREATE OR REPLACE FUNCTION private.guard_professional_managed_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.verified IS DISTINCT FROM FALSE
       OR NEW.verified_at IS NOT NULL
       OR NEW.rejection_reason IS NOT NULL
       OR NEW.notes IS NOT NULL
       OR COALESCE(NEW.subscription_tier, 'free') <> 'free' THEN
      RAISE EXCEPTION 'professional_managed_fields_forbidden'
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'professional_managed_fields_forbidden'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_professional_managed_fields()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_professional_managed_fields()
  TO service_role;

DROP TRIGGER IF EXISTS professionals_guard_managed_fields ON public.professionals;
CREATE TRIGGER professionals_guard_managed_fields
  BEFORE INSERT OR UPDATE ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_professional_managed_fields();

DROP POLICY IF EXISTS "professionals_update" ON public.professionals;
CREATE POLICY "professionals_update"
  ON public.professionals
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR private.has_platform_admin((SELECT auth.uid()))
  );

-- Explicit public projection. Sensitive ownership, tenancy, cadastral and
-- internal workflow fields are not selected. The view is a deliberate
-- security-definer projection: its fixed row predicate is the public listing
-- contract, and security-invoker semantics retain the underlying RLS checks.
CREATE INDEX IF NOT EXISTS idx_listing_images_listing_sort
  ON public.listing_images(listing_id, sort_order);

CREATE OR REPLACE VIEW public.public_listing_catalogue
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  listing.id,
  listing.owner_id,
  listing.project_id,
  listing.created_at,
  listing.updated_at,
  listing.status,
  listing.title,
  listing.description,
  listing.address,
  listing.city,
  listing.region,
  listing.postal_code,
  listing.latitude,
  listing.longitude,
  listing.price,
  listing.price_per_sqm,
  listing.sqm,
  listing.bedrooms,
  listing.bathrooms,
  listing.wc_count,
  listing.kitchens,
  listing.living_rooms,
  listing.floor,
  listing.total_floors,
  listing.levels,
  listing.year_built,
  listing.energy_class,
  listing.property_type,
  listing.listing_type,
  listing.auction_date,
  listing.auction_starting_bid,
  listing.auction_court,
  listing.open_house_date,
  listing.open_house_transaction_type,
  listing.cover_image_url,
  listing.website_url,
  listing.views_count,
  listing.ai_score,
  listing.tags,
  listing.heating_system,
  listing.construction_status,
  listing.commercial_subtype,
  listing.available_from,
  listing.deposit_months,
  listing.monthly_expenses,
  listing.agent_fee_included,
  listing.min_rental_months,
  listing.is_featured,
  listing.featured_until,
  listing.priority_placement,
  listing.priority_until,
  listing.is_pre_sale,
  listing.is_off_market,
  listing.location_search_text,
  listing.walkability_score,
  listing.safety_score,
  listing.noise_score,
  listing.distance_from_city,
  listing.distance_from_sea,
  listing.plot_surface,
  listing.plot_depth,
  listing.coverage_ratio,
  listing.building_allowance,
  listing.facade_length,
  listing.floor_height,
  listing.slope,
  listing.zone_type,
  listing.road_type,
  listing.land_use,
  listing.is_buildable,
  listing.is_corner,
  listing.is_neoclassical,
  listing.is_penthouse,
  listing.is_preserved,
  listing.within_city_plan,
  listing.within_settlement,
  listing.short_term_rental,
  listing.suitable_commercial_use,
  listing.suitable_holiday,
  listing.suitable_investment,
  listing.suitable_student,
  listing.pets_allowed,
  listing.has_ac,
  listing.has_alarm,
  listing.has_attic,
  listing.has_awning,
  listing.has_balcony,
  listing.has_cctv,
  listing.has_disability_access,
  listing.has_double_glazing,
  listing.has_electricity_supply,
  listing.has_elevator,
  listing.has_equipped,
  listing.has_facade,
  listing.has_fireplace,
  listing.has_furnished,
  listing.has_garden,
  listing.has_internal_staircase,
  listing.has_land_concession,
  listing.has_loading_dock,
  listing.has_night_power,
  listing.has_painted,
  listing.has_parking,
  listing.has_pool,
  listing.has_satellite,
  listing.has_secure_door,
  listing.has_security,
  listing.has_smart_home,
  listing.has_solar_water,
  listing.has_storage,
  listing.has_structured_cabling,
  listing.has_three_phase_power,
  listing.has_underfloor_heating,
  listing.has_video_tour,
  listing.has_view,
  listing.has_virtual_tour,
  listing.has_water_supply,
  listing.has_window_screens,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(card_image) ORDER BY card_image.sort_order)
      FROM (
        SELECT image.url, image.sort_order
        FROM public.listing_images AS image
        WHERE image.listing_id = listing.id
        ORDER BY image.sort_order
        LIMIT 3
      ) AS card_image
    ),
    '[]'::jsonb
  ) AS listing_images,
  COALESCE(
    (
      SELECT jsonb_agg(to_jsonb(detail_image) ORDER BY detail_image.sort_order)
      FROM (
        SELECT image.url, image.sort_order
        FROM public.listing_images AS image
        WHERE image.listing_id = listing.id
        ORDER BY image.sort_order
      ) AS detail_image
    ),
    '[]'::jsonb
  ) AS listing_images_detail,
  CASE WHEN listing.project_id IS NULL THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'name', project.name,
        'delivery_date', project.delivery_date,
        'project_units', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', unit.id,
                'availability_status', unit.availability_status,
                'internal_sqm', unit.internal_sqm
              )
              ORDER BY unit.floor NULLS LAST, unit.unit_number NULLS LAST, unit.id
            )
            FROM public.project_units AS unit
            WHERE unit.project_id = project.id
          ),
          '[]'::jsonb
        )
      )
      FROM public.projects AS project
      WHERE project.id = listing.project_id
        AND project.status = 'active'
    )
  END AS project,
  CASE WHEN listing.project_id IS NULL THEN NULL
    ELSE (
      SELECT jsonb_build_object(
        'id', project.id,
        'name', project.name,
        'description', project.description,
        'address', project.address,
        'city', project.city,
        'municipality', project.municipality,
        'latitude', project.latitude,
        'longitude', project.longitude,
        'cover_image_url', project.cover_image_url,
        'developer_company', project.developer_company,
        'architect_group', project.architect_group,
        'construction_company', project.construction_company,
        'building_permit_number', project.building_permit_number,
        'area_description', project.area_description,
        'permit_approval_date', project.permit_approval_date,
        'construction_start_date', project.construction_start_date,
        'structural_completion_date', project.structural_completion_date,
        'delivery_date', project.delivery_date,
        'status', project.status,
        'project_units', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', unit.id,
                'listing_id', unit.listing_id,
                'unit_id', unit.unit_id,
                'unit_number', unit.unit_number,
                'floor', unit.floor,
                'availability_status', unit.availability_status,
                'internal_sqm', unit.internal_sqm,
                'balcony_sqm', unit.balcony_sqm,
                'storage_sqm', unit.storage_sqm,
                'parking_sqm', unit.parking_sqm,
                'bedrooms', unit.bedrooms,
                'bathrooms', unit.bathrooms,
                'kitchen_type', unit.kitchen_type,
                'living_rooms', unit.living_rooms,
                'price', unit.price,
                'price_per_sqm', unit.price_per_sqm,
                'vat_included', unit.vat_included,
                'parking_price', unit.parking_price,
                'storage_price', unit.storage_price,
                'sea_view', unit.sea_view,
                'city_view', unit.city_view,
                'mountain_view', unit.mountain_view,
                'energy_class', unit.energy_class,
                'heating_system', unit.heating_system,
                'cooling_system', unit.cooling_system
              )
              ORDER BY unit.floor NULLS LAST, unit.unit_number NULLS LAST, unit.id
            )
            FROM public.project_units AS unit
            WHERE unit.project_id = project.id
          ),
          '[]'::jsonb
        ),
        'project_media', COALESCE(
          (
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', media.id,
                'url', media.url,
                'media_type', media.media_type,
                'title', media.title,
                'sort_order', media.sort_order
              )
              ORDER BY media.media_type, media.sort_order, media.id
            )
            FROM public.project_media AS media
            WHERE media.project_id = project.id
          ),
          '[]'::jsonb
        )
      )
      FROM public.projects AS project
      WHERE project.id = listing.project_id
        AND project.status = 'active'
    )
  END AS project_detail
FROM public.listings AS listing
WHERE listing.status = 'active'::public.listing_status
  AND COALESCE(listing.is_off_market, FALSE) = FALSE;

REVOKE ALL ON TABLE public.public_listing_catalogue
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_listing_catalogue TO anon, authenticated;

COMMENT ON VIEW public.public_listing_catalogue IS
  'Allowlisted active-listing projection for public APIs. Phase A retains legacy listings privileges until every consumer has switched.';
