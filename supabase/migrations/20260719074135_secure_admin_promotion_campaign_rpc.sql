-- Keep the browser-facing campaign report under caller privileges. The
-- privileged aggregate stays in the non-exposed private schema and repeats
-- the platform-admin check as defense in depth.

CREATE OR REPLACE FUNCTION private.get_admin_listing_promotion_campaigns_internal()
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
  IF NOT private.has_platform_admin((SELECT auth.uid())) THEN
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

REVOKE ALL ON FUNCTION private.get_admin_listing_promotion_campaigns_internal()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_admin_listing_promotion_campaigns_internal() TO authenticated, service_role;

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
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.has_platform_admin((SELECT auth.uid())) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT campaign.*
  FROM private.get_admin_listing_promotion_campaigns_internal() AS campaign;
END;
$$;

REVOKE ALL ON FUNCTION public.get_admin_listing_promotion_campaigns()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_admin_listing_promotion_campaigns()
  TO authenticated, service_role;

COMMENT ON FUNCTION private.get_admin_listing_promotion_campaigns_internal() IS
  'Private privileged campaign aggregation. Callable only through an admin-checked service boundary.';
COMMENT ON FUNCTION public.get_admin_listing_promotion_campaigns() IS
  'Invoker-safe admin campaign reporting boundary. Privileged aggregation remains in the non-exposed private schema.';

DO $$
DECLARE
  public_fn regprocedure := to_regprocedure('public.get_admin_listing_promotion_campaigns()');
  private_fn regprocedure := to_regprocedure('private.get_admin_listing_promotion_campaigns_internal()');
BEGIN
  IF public_fn IS NULL OR private_fn IS NULL THEN
    RAISE EXCEPTION 'promotion campaign reporting functions are missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = public_fn
      AND prosecdef
  ) THEN
    RAISE EXCEPTION 'public campaign reporting function must remain SECURITY INVOKER';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc
    WHERE oid = private_fn
      AND prosecdef
  ) THEN
    RAISE EXCEPTION 'private campaign aggregation function must remain SECURITY DEFINER';
  END IF;

  IF has_function_privilege('anon', public_fn, 'EXECUTE')
     OR has_function_privilege('anon', private_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anonymous callers must not execute campaign reporting functions';
  END IF;
END;
$$;
