-- Promotion reporting must describe the paid/admin allocation window rather
-- than lifetime listing activity. Open Houses currently have chronological
-- public ordering, so general listing boosts are intentionally ineligible.

CREATE INDEX IF NOT EXISTS idx_favorites_listing_created_at
  ON public.favorites (listing_id, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_listing_created_at
  ON public.conversations (listing_id, created_at)
  WHERE listing_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_admin_listing_promotion_campaigns()
RETURNS TABLE (
  listing_id uuid,
  title text,
  city text,
  property_type text,
  listing_type text,
  price numeric,
  cover_image_url text,
  is_featured boolean,
  priority_placement integer,
  featured_until timestamptz,
  priority_until timestamptz,
  status text,
  owner_id uuid,
  seller_name text,
  campaign_type text,
  source_type text,
  campaign_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  detail_views bigint,
  saves bigint,
  enquiries bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    listing.id,
    listing.title,
    listing.city,
    listing.property_type::text,
    listing.listing_type::text,
    listing.price,
    listing.cover_image_url,
    listing.is_featured,
    COALESCE(listing.priority_placement, 0),
    listing.featured_until,
    listing.priority_until,
    listing.status::text,
    listing.owner_id,
    profile.display_name,
    allocation.promotion_type,
    allocation.source_type,
    allocation.status,
    allocation.starts_at,
    allocation.ends_at,
    COALESCE(outcomes.detail_views, 0::bigint),
    COALESCE(outcomes.saves, 0::bigint),
    COALESCE(outcomes.enquiries, 0::bigint)
  FROM public.listings AS listing
  LEFT JOIN public.profiles AS profile
    ON profile.user_id = listing.owner_id
  LEFT JOIN public.listing_promotion_allocations AS allocation
    ON allocation.listing_id = listing.id
   AND allocation.status = 'active'
  LEFT JOIN LATERAL (
    SELECT
      (
        SELECT count(*)
        FROM public.listing_view_events AS view_event
        WHERE view_event.listing_id = allocation.listing_id
          AND view_event.viewed_at >= allocation.starts_at
          AND view_event.viewed_at < allocation.ends_at
      ) AS detail_views,
      (
        SELECT count(*)
        FROM public.favorites AS favorite
        WHERE favorite.listing_id = allocation.listing_id
          AND favorite.created_at >= allocation.starts_at
          AND favorite.created_at < allocation.ends_at
      ) AS saves,
      (
        SELECT count(*)
        FROM public.conversations AS conversation
        WHERE conversation.listing_id = allocation.listing_id
          AND conversation.created_at >= allocation.starts_at
          AND conversation.created_at < allocation.ends_at
      ) AS enquiries
  ) AS outcomes ON allocation.id IS NOT NULL
  WHERE listing.status = 'active'::public.listing_status
    AND listing.owner_id IS NOT NULL
  ORDER BY
    listing.is_featured DESC,
    COALESCE(listing.priority_placement, 0) DESC,
    listing.created_at DESC,
    listing.id DESC,
    CASE allocation.promotion_type WHEN 'spotlight' THEN 0 ELSE 1 END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_listing_promotion_campaigns()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_listing_promotion_campaigns()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_admin_listing_promotion_campaigns() IS
  'Admin-only campaign reporting using allocation-window detail views, saves, and enquiries. It intentionally does not claim impressions, CTR, or causal uplift.';

-- Fail deployment rather than silently revoke a paid or plan allocation. The
-- current inert Open House allocation is an administrator grant and can be
-- removed without consuming or refunding a customer entitlement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.listing_promotion_allocations AS allocation
    JOIN public.listings AS listing ON listing.id = allocation.listing_id
    WHERE allocation.status = 'active'
      AND allocation.source_type <> 'admin'
      AND listing.listing_type::text = 'open_house'
  ) THEN
    RAISE EXCEPTION 'open_house_non_admin_promotion_requires_manual_resolution';
  END IF;
END;
$$;

UPDATE public.listing_promotion_allocations AS allocation
SET
  status = 'revoked',
  revoked_at = statement_timestamp(),
  revoke_reason = 'open_house_promotion_not_supported',
  updated_at = statement_timestamp()
FROM public.listings AS listing
WHERE listing.id = allocation.listing_id
  AND listing.listing_type::text = 'open_house'
  AND allocation.source_type = 'admin'
  AND allocation.status = 'active';

CREATE OR REPLACE FUNCTION private.guard_listing_promotion_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'active'
     AND EXISTS (
       SELECT 1
       FROM public.listings AS listing
       WHERE listing.id = NEW.listing_id
         AND listing.listing_type::text = 'open_house'
     ) THEN
    RAISE EXCEPTION 'open_house_promotion_not_supported' USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_listing_promotion_eligibility()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_listing_promotion_eligibility
  ON public.listing_promotion_allocations;
CREATE TRIGGER trg_guard_listing_promotion_eligibility
  BEFORE INSERT OR UPDATE OF listing_id, status
  ON public.listing_promotion_allocations
  FOR EACH ROW EXECUTE FUNCTION private.guard_listing_promotion_eligibility();

COMMENT ON FUNCTION private.guard_listing_promotion_eligibility() IS
  'Rejects active general listing promotions for Open Houses before any allocation transaction can commit.';
