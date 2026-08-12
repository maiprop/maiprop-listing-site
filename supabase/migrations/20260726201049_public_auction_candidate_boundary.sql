-- Keep the public auction catalogue narrow and push every selective predicate
-- into PostgreSQL. The generic public listing RPC returns a broad composite
-- row and forces PostgREST to filter outside a Function Scan.

CREATE OR REPLACE FUNCTION public.get_public_auction_candidates(
  p_limit INTEGER DEFAULT 60,
  p_stream TEXT DEFAULT 'organic',
  p_today DATE DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE,
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_pool_tag TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  address TEXT,
  city TEXT,
  price NUMERIC,
  price_per_sqm NUMERIC,
  bedrooms INTEGER,
  bathrooms INTEGER,
  sqm NUMERIC,
  floor INTEGER,
  total_floors INTEGER,
  year_built INTEGER,
  energy_class TEXT,
  cover_image_url TEXT,
  property_type TEXT,
  listing_type TEXT,
  ai_score INTEGER,
  views_count INTEGER,
  tags TEXT[],
  auction_date TIMESTAMPTZ,
  auction_starting_bid NUMERIC,
  latitude NUMERIC,
  longitude NUMERIC,
  auction_court TEXT,
  website_url TEXT,
  region TEXT,
  is_featured BOOLEAN,
  featured_until TIMESTAMPTZ,
  priority_placement INTEGER,
  priority_until TIMESTAMPTZ,
  construction_status TEXT,
  listing_images JSONB
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    listing.id,
    listing.title,
    listing.address,
    listing.city,
    listing.price,
    listing.price_per_sqm,
    listing.bedrooms,
    listing.bathrooms,
    listing.sqm,
    listing.floor,
    listing.total_floors,
    listing.year_built,
    listing.energy_class,
    listing.cover_image_url,
    listing.property_type::TEXT,
    listing.listing_type::TEXT,
    listing.ai_score,
    listing.views_count,
    listing.tags,
    listing.auction_date,
    listing.auction_starting_bid,
    listing.latitude,
    listing.longitude,
    listing.auction_court,
    listing.website_url,
    listing.region,
    listing.is_featured,
    listing.featured_until,
    listing.priority_placement,
    listing.priority_until,
    listing.construction_status,
    images.listing_images
  FROM public.listings AS listing
  CROSS JOIN LATERAL (
    SELECT COALESCE(
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
      '[]'::JSONB
    ) AS listing_images
  ) AS images
  WHERE listing.status = 'active'::public.listing_status
    AND listing.listing_type = 'auction'::public.listing_type
    AND COALESCE(listing.is_off_market, FALSE) = FALSE
    AND listing.tags @> ARRAY['source:maiprop-os']::TEXT[]
    AND (p_pool_tag IS NULL OR listing.tags @> ARRAY[p_pool_tag]::TEXT[])
    AND (listing.auction_date >= p_today::TIMESTAMPTZ OR listing.auction_date IS NULL)
    AND (
      (
        p_stream = 'priority'
        AND listing.priority_placement > 0
        AND listing.priority_until > p_now
      )
      OR
      (
        p_stream = 'organic'
        AND (
          listing.priority_placement <= 0
          OR listing.priority_until <= p_now
          OR listing.priority_until IS NULL
        )
      )
    )
  ORDER BY listing.auction_date ASC NULLS LAST, listing.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), 600);
$$;

REVOKE ALL ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT)
  TO anon, authenticated;

COMMENT ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) IS
  'Bounded card-only public auction candidate stream with all selective predicates inside PostgreSQL.';
