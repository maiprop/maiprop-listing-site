-- Forward repair for capabilities missing from the production migration state.
-- Historical migrations remain immutable; this migration restores only their
-- required database capabilities and validates the final PostgREST contract.

DO $$
BEGIN
  IF to_regclass('public.listing_management_catalogue') IS NULL THEN
    RAISE EXCEPTION 'Required managed catalogue relation is missing';
  END IF;

  IF to_regclass('public.listings') IS NULL THEN
    RAISE EXCEPTION 'Required listings relation is missing';
  END IF;

  IF to_regclass('public.professionals') IS NULL THEN
    RAISE EXCEPTION 'Required professionals relation is missing';
  END IF;

  IF to_regprocedure('auth.uid()') IS NULL THEN
    RAISE EXCEPTION 'Required auth.uid helper is missing';
  END IF;

  IF to_regprocedure(
    'public.get_auction_listing_visible_limit(uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required auction listing visible limit helper is missing';
  END IF;

  IF to_regprocedure(
    'private.has_org_permission(uuid,text,uuid)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required organization permission helper is missing';
  END IF;

  IF to_regprocedure(
    'public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required underlying auction candidate RPC is missing';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.get_auction_listing_visible_limit(UUID)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auction_listing_visible_limit(UUID)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_current_auction_listing_visible_limit()
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id UUID := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 60;
  END IF;

  RETURN LEAST(
    600,
    GREATEST(
      60,
      COALESCE(public.get_auction_listing_visible_limit(v_user_id), 60)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_current_auction_listing_visible_limit()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_current_auction_listing_visible_limit()
  TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_auction_candidates(
  INTEGER,
  TEXT,
  DATE,
  TIMESTAMPTZ,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(
  INTEGER,
  TEXT,
  DATE,
  TIMESTAMPTZ,
  TEXT
) TO service_role;

DROP FUNCTION IF EXISTS public.get_visible_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT
);

CREATE OR REPLACE FUNCTION public.get_visible_auction_candidates(
  p_limit INTEGER DEFAULT 60,
  p_stream TEXT DEFAULT 'organic',
  p_today DATE DEFAULT (NOW() AT TIME ZONE 'UTC')::DATE,
  p_now TIMESTAMPTZ DEFAULT NOW(),
  p_pool_tag TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_property_base TEXT DEFAULT NULL,
  p_property_subtype TEXT DEFAULT NULL,
  p_bid_min NUMERIC DEFAULT NULL,
  p_bid_max NUMERIC DEFAULT NULL,
  p_year_min INTEGER DEFAULT NULL,
  p_year_max INTEGER DEFAULT NULL,
  p_sqm_min NUMERIC DEFAULT NULL,
  p_sqm_max NUMERIC DEFAULT NULL,
  p_ownership TEXT DEFAULT NULL,
  p_round TEXT DEFAULT NULL,
  p_yield TEXT DEFAULT NULL
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
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_visible_limit INTEGER := 60;
BEGIN
  v_visible_limit := LEAST(
    600,
    GREATEST(
      60,
      COALESCE(public.get_current_auction_listing_visible_limit(), 60)
    )
  );

  RETURN QUERY
  WITH bounded_candidates AS MATERIALIZED (
    SELECT *
    FROM public.get_public_auction_candidates(
      600,
      p_stream,
      p_today,
      p_now,
      p_pool_tag
    )
  ),
  filtered_candidates AS MATERIALIZED (
    SELECT candidate.*
    FROM bounded_candidates AS candidate
    CROSS JOIN LATERAL (
      SELECT
        (
          SELECT SUBSTRING(
            tagged.tag FROM CHAR_LENGTH('ownership:') + 1
          )
          FROM pg_catalog.unnest(
            COALESCE(candidate.tags, ARRAY[]::TEXT[])
          ) WITH ORDINALITY AS tagged(tag, position)
          WHERE LEFT(tagged.tag, CHAR_LENGTH('ownership:')) = 'ownership:'
          ORDER BY tagged.position
          LIMIT 1
        ) AS raw_ownership,
        (
          SELECT SUBSTRING(
            tagged.tag FROM CHAR_LENGTH('ownership_pct:') + 1
          )
          FROM pg_catalog.unnest(
            COALESCE(candidate.tags, ARRAY[]::TEXT[])
          ) WITH ORDINALITY AS tagged(tag, position)
          WHERE LEFT(tagged.tag, CHAR_LENGTH('ownership_pct:')) = 'ownership_pct:'
          ORDER BY tagged.position
          LIMIT 1
        ) AS raw_ownership_percentage,
        (
          SELECT SUBSTRING(tagged.tag FROM CHAR_LENGTH('round:') + 1)
          FROM pg_catalog.unnest(
            COALESCE(candidate.tags, ARRAY[]::TEXT[])
          ) WITH ORDINALITY AS tagged(tag, position)
          WHERE LEFT(tagged.tag, CHAR_LENGTH('round:')) = 'round:'
          ORDER BY tagged.position
          LIMIT 1
        ) AS raw_round
    ) AS raw_metadata
    CROSS JOIN LATERAL (
      SELECT
        CASE LOWER(BTRIM(COALESCE(raw_metadata.raw_ownership, '')))
          WHEN '' THEN NULL
          WHEN 'full' THEN 'full'
          WHEN 'full_ownership' THEN 'full'
          WHEN 'complete' THEN 'full'
          WHEN '100' THEN 'full'
          WHEN 'bare' THEN 'bare'
          WHEN 'bare_ownership' THEN 'bare'
          WHEN 'psili' THEN 'bare'
          WHEN 'common' THEN 'common'
          WHEN 'shared' THEN 'common'
          WHEN 'undivided' THEN 'common'
          WHEN 'joint' THEN 'common'
          WHEN 'usufruct' THEN 'usufruct'
          WHEN 'epikarpia' THEN 'usufruct'
          WHEN 'vertical' THEN 'vertical'
          WHEN 'vertical_ownership' THEN 'vertical'
          WHEN 'horizontal' THEN 'horizontal'
          WHEN 'horizontal_ownership' THEN 'horizontal'
          ELSE LOWER(BTRIM(raw_metadata.raw_ownership))
        END AS ownership_status,
        CASE
          WHEN raw_metadata.raw_ownership_percentage IS NULL
            OR BTRIM(raw_metadata.raw_ownership_percentage) = ''
          THEN 0::NUMERIC
          WHEN BTRIM(raw_metadata.raw_ownership_percentage)
            ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
          THEN BTRIM(raw_metadata.raw_ownership_percentage)::NUMERIC
          ELSE NULL::NUMERIC
        END AS ownership_percentage,
        CASE
          WHEN raw_metadata.raw_round IS NULL
            OR BTRIM(raw_metadata.raw_round) = ''
          THEN 0::NUMERIC
          WHEN BTRIM(raw_metadata.raw_round)
            ~ '^[+-]?([0-9]+([.][0-9]*)?|[.][0-9]+)([eE][+-]?[0-9]+)?$'
          THEN BTRIM(raw_metadata.raw_round)::NUMERIC
          ELSE NULL::NUMERIC
        END AS auction_round,
        TRANSLATE(
          LOWER(BTRIM(COALESCE(candidate.city, ''))),
          'άέήίόύώϊΐϋΰ',
          'αεηιουωιιυυ'
        ) AS normalized_city
    ) AS normalized_metadata
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN STRPOS(normalized_metadata.normalized_city, 'athens') > 0
          OR STRPOS('athens', normalized_metadata.normalized_city) > 0
        THEN 9.5::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'piraeus') > 0
          OR STRPOS('piraeus', normalized_metadata.normalized_city) > 0
        THEN 7.5::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'thessaloniki') > 0
          OR STRPOS('thessaloniki', normalized_metadata.normalized_city) > 0
        THEN 8::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'mykonos') > 0
          OR STRPOS('mykonos', normalized_metadata.normalized_city) > 0
        THEN 18::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'santorini') > 0
          OR STRPOS('santorini', normalized_metadata.normalized_city) > 0
        THEN 16::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'rhodes') > 0
          OR STRPOS('rhodes', normalized_metadata.normalized_city) > 0
        THEN 10::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'corfu') > 0
          OR STRPOS('corfu', normalized_metadata.normalized_city) > 0
        THEN 9::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'heraklion') > 0
          OR STRPOS('heraklion', normalized_metadata.normalized_city) > 0
        THEN 8::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'patras') > 0
          OR STRPOS('patras', normalized_metadata.normalized_city) > 0
        THEN 6.5::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'αθηνα') > 0
          OR STRPOS('αθηνα', normalized_metadata.normalized_city) > 0
        THEN 9.5::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'πειραιας') > 0
          OR STRPOS('πειραιας', normalized_metadata.normalized_city) > 0
        THEN 7.5::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'θεσσαλονικη') > 0
          OR STRPOS('θεσσαλονικη', normalized_metadata.normalized_city) > 0
        THEN 8::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'μυκονος') > 0
          OR STRPOS('μυκονος', normalized_metadata.normalized_city) > 0
        THEN 18::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'σαντορινη') > 0
          OR STRPOS('σαντορινη', normalized_metadata.normalized_city) > 0
        THEN 16::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'ροδος') > 0
          OR STRPOS('ροδος', normalized_metadata.normalized_city) > 0
        THEN 10::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'κερκυρα') > 0
          OR STRPOS('κερκυρα', normalized_metadata.normalized_city) > 0
        THEN 9::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'ηρακλειο') > 0
          OR STRPOS('ηρακλειο', normalized_metadata.normalized_city) > 0
        THEN 8::NUMERIC
        WHEN STRPOS(normalized_metadata.normalized_city, 'πατρα') > 0
          OR STRPOS('πατρα', normalized_metadata.normalized_city) > 0
        THEN 6.5::NUMERIC
        ELSE 6::NUMERIC
      END AS rent_per_sqm
    ) AS rent_metadata
    CROSS JOIN LATERAL (
      SELECT CASE
        WHEN COALESCE(candidate.auction_starting_bid, candidate.price, 0) > 0
          AND COALESCE(candidate.sqm, 0) > 0
          AND COALESCE(
            candidate.auction_starting_bid,
            candidate.price,
            0
          )::TEXT NOT IN ('NaN', 'Infinity', '-Infinity')
          AND COALESCE(candidate.sqm, 0)::TEXT
            NOT IN ('NaN', 'Infinity', '-Infinity')
        THEN (
          rent_metadata.rent_per_sqm
          * COALESCE(candidate.sqm, 0)
          * 12
        ) / COALESCE(
          candidate.auction_starting_bid,
          candidate.price,
          0
        ) * 100
        ELSE NULL::NUMERIC
      END AS estimated_yield
    ) AS yield_metadata
    WHERE (
      p_city IS NULL
      OR STRPOS(LOWER(COALESCE(candidate.city, '')), LOWER(p_city)) > 0
    )
      AND (
        p_property_base IS NULL
        OR candidate.property_type = p_property_base
      )
      AND (
        p_property_subtype IS NULL
        OR (
          p_property_base = 'land'
          AND COALESCE(candidate.tags, ARRAY[]::TEXT[])
            @> ARRAY['land_type:' || p_property_subtype]::TEXT[]
        )
        OR (
          p_property_base = 'commercial'
          AND COALESCE(candidate.tags, ARRAY[]::TEXT[])
            @> ARRAY['commercial_type:' || p_property_subtype]::TEXT[]
        )
      )
      AND (
        p_bid_min IS NULL
        OR COALESCE(candidate.auction_starting_bid, candidate.price, 0)
          >= p_bid_min
      )
      AND (
        p_bid_max IS NULL
        OR COALESCE(candidate.auction_starting_bid, candidate.price, 0)
          <= p_bid_max
      )
      AND (
        (p_year_min IS NULL AND p_year_max IS NULL)
        OR (
          candidate.year_built IS NOT NULL
          AND (p_year_min IS NULL OR candidate.year_built >= p_year_min)
          AND (p_year_max IS NULL OR candidate.year_built <= p_year_max)
        )
      )
      AND (
        p_sqm_min IS NULL
        OR COALESCE(candidate.sqm, 0) >= p_sqm_min
      )
      AND (
        p_sqm_max IS NULL
        OR COALESCE(candidate.sqm, 0) <= p_sqm_max
      )
      AND (
        p_ownership IS NULL
        OR (
          p_ownership = 'full'
          AND (
            normalized_metadata.ownership_status = 'full'
            OR normalized_metadata.ownership_percentage >= 100
          )
        )
        OR (
          p_ownership = 'bare'
          AND normalized_metadata.ownership_status = 'bare'
        )
        OR (
          p_ownership = 'common'
          AND (
            normalized_metadata.ownership_status = 'common'
            OR (
              normalized_metadata.ownership_status IS NULL
              AND normalized_metadata.ownership_percentage > 0
              AND normalized_metadata.ownership_percentage < 100
            )
          )
        )
        OR (
          p_ownership NOT IN ('full', 'bare', 'common')
          AND normalized_metadata.ownership_status = p_ownership
        )
      )
      AND (
        p_round IS NULL
        OR (
          p_round = '3plus'
          AND normalized_metadata.auction_round >= 3
        )
        OR (
          p_round ~ '^[1-9][0-9]?$'
          AND normalized_metadata.auction_round = p_round::NUMERIC
        )
      )
      AND (
        p_yield IS NULL
        OR (
          p_yield = 'low'
          AND yield_metadata.estimated_yield >= 0
          AND yield_metadata.estimated_yield <= 3
        )
        OR (
          p_yield = 'medium'
          AND yield_metadata.estimated_yield >= 3
          AND yield_metadata.estimated_yield <= 6
        )
        OR (
          p_yield = 'high'
          AND yield_metadata.estimated_yield >= 6
          AND yield_metadata.estimated_yield <= 9
        )
        OR (
          p_yield = 'very_high'
          AND yield_metadata.estimated_yield >= 9
        )
      )
  )
  SELECT filtered.*
  FROM filtered_candidates AS filtered
  ORDER BY filtered.auction_date ASC NULLS LAST, filtered.id ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_visible_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue_page(
  p_limit integer DEFAULT 50,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  data jsonb,
  total_count bigint,
  next_created_at timestamptz,
  next_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'manageable_catalogue_cursor_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH authorized AS MATERIALIZED (
    SELECT catalogue.*
    FROM public.listing_management_catalogue AS catalogue
    WHERE (
      catalogue.organization_id IS NULL
      AND catalogue.owner_id = v_actor
    ) OR (
      catalogue.organization_id IS NOT NULL
      AND private.has_org_permission(
        catalogue.organization_id,
        'listing:manage',
        v_actor
      )
    )
  ),
  page_plus_one AS MATERIALIZED (
    SELECT catalogue.*
    FROM authorized AS catalogue
    WHERE p_before_created_at IS NULL
      OR (catalogue.created_at, catalogue.id)
        < (p_before_created_at, p_before_id)
    ORDER BY catalogue.created_at DESC, catalogue.id DESC
    LIMIT v_limit + 1
  ),
  page_rows AS MATERIALIZED (
    SELECT catalogue.*
    FROM page_plus_one AS catalogue
    ORDER BY catalogue.created_at DESC, catalogue.id DESC
    LIMIT v_limit
  ),
  last_row AS (
    SELECT catalogue.created_at, catalogue.id
    FROM page_rows AS catalogue
    ORDER BY catalogue.created_at ASC, catalogue.id ASC
    LIMIT 1
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(catalogue)
          ORDER BY catalogue.created_at DESC, catalogue.id DESC
        )
        FROM page_rows AS catalogue
      ),
      '[]'::jsonb
    ),
    (SELECT count(*) FROM authorized),
    CASE
      WHEN (SELECT count(*) FROM page_plus_one) > v_limit
      THEN (SELECT created_at FROM last_row)
      ELSE NULL
    END,
    CASE
      WHEN (SELECT count(*) FROM page_plus_one) > v_limit
      THEN (SELECT id FROM last_row)
      ELSE NULL
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_manageable_listing_catalogue_page(
  integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manageable_listing_catalogue_page(
  integer, timestamptz, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manageable_listing_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  WITH authorized AS MATERIALIZED (
    SELECT listing.*
    FROM public.listings AS listing
    WHERE (
      listing.organization_id IS NULL
      AND listing.owner_id = v_actor
    ) OR (
      listing.organization_id IS NOT NULL
      AND private.has_org_permission(
        listing.organization_id,
        'listing:manage',
        v_actor
      )
    )
  )
  SELECT jsonb_build_object(
    'totalListings',
      count(*),
    'activeListings',
      count(*) FILTER (
        WHERE status = 'active'::public.listing_status
      ),
    'totalViews',
      COALESCE(sum(views_count), 0),
    'averageViews',
      COALESCE(round(avg(COALESCE(views_count, 0))), 0),
    'averageActiveDays',
      COALESCE(
        round(
          avg(
            extract(epoch FROM (now() - created_at)) / 86400
          ) FILTER (
            WHERE status = 'active'::public.listing_status
          )
        ),
        0
      ),
    'bestListing',
      (
        SELECT jsonb_build_object(
          'id', best.id,
          'title', best.title,
          'viewsCount', COALESCE(best.views_count, 0)
        )
        FROM authorized AS best
        ORDER BY COALESCE(best.views_count, 0) DESC, best.id ASC
        LIMIT 1
      )
  )
  INTO v_result
  FROM authorized;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_manageable_listing_summary()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manageable_listing_summary()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_public_professionals()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  title text,
  display_name text,
  category public.professional_category,
  city text,
  bio text,
  avatar_url text,
  rating numeric(3, 2),
  reviews_count integer,
  verified boolean,
  verified_at timestamptz,
  hourly_rate numeric(10, 2),
  experience_years integer,
  specialties text[],
  languages text[],
  license_number text,
  website_url text,
  video_link text,
  projects_count integer,
  average_deal_size text,
  average_portfolio_asset_size text,
  subscription_tier text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    professional.id,
    professional.user_id,
    professional.title,
    professional.display_name,
    professional.category,
    professional.city,
    professional.bio,
    professional.avatar_url,
    professional.rating,
    professional.reviews_count,
    professional.verified,
    professional.verified_at,
    professional.hourly_rate,
    professional.experience_years,
    professional.specialties,
    professional.languages,
    professional.license_number,
    professional.website_url,
    professional.video_link,
    professional.projects_count,
    professional.average_deal_size,
    professional.average_portfolio_asset_size,
    professional.subscription_tier,
    professional.created_at,
    professional.updated_at
  FROM public.professionals AS professional
  WHERE professional.archived_at IS NULL;
$function$;

REVOKE ALL ON FUNCTION public.get_public_professionals()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_professionals()
  TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW public.public_professionals
WITH (security_barrier = true, security_invoker = true)
AS
SELECT
  professional.id,
  professional.user_id,
  professional.title,
  professional.display_name,
  professional.category,
  professional.city,
  professional.bio,
  professional.avatar_url,
  professional.rating::numeric(3, 2) AS rating,
  professional.reviews_count,
  professional.verified,
  professional.verified_at,
  professional.hourly_rate::numeric(10, 2) AS hourly_rate,
  professional.experience_years,
  professional.specialties,
  professional.languages,
  professional.license_number,
  professional.website_url,
  professional.video_link,
  professional.projects_count,
  professional.average_deal_size,
  professional.average_portfolio_asset_size,
  professional.subscription_tier,
  professional.created_at,
  professional.updated_at
FROM public.get_public_professionals() AS professional;

REVOKE ALL ON TABLE public.public_professionals
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_professionals
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_manageable_listing_catalogue_page(
  integer, timestamptz, uuid
) IS
  'Exact-count keyset page of the current actor managed listing catalogue.';
COMMENT ON FUNCTION public.get_manageable_listing_summary() IS
  'Authoritative managed listing counts and view aggregates for dashboard analytics.';
COMMENT ON FUNCTION public.get_public_professionals() IS
  'Fixed professional-directory projection. The function excludes internal moderation and calendar fields.';
COMMENT ON VIEW public.public_professionals IS
  'Security-invoker wrapper over the fixed public professional-directory projection.';

DO $$
DECLARE
  signature TEXT;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)',
    'public.get_current_auction_listing_visible_limit()',
    'public.get_visible_auction_candidates(integer,text,date,timestamp with time zone,text,text,text,text,numeric,numeric,integer,integer,numeric,numeric,text,text,text)',
    'public.get_manageable_listing_catalogue_page(integer,timestamp with time zone,uuid)',
    'public.get_manageable_listing_summary()',
    'public.get_public_professionals()'
  ]
  LOOP
    IF to_regprocedure(signature) IS NULL THEN
      RAISE EXCEPTION 'Required release capability is missing: %', signature;
    END IF;
  END LOOP;

  IF to_regclass('public.public_professionals') IS NULL THEN
    RAISE EXCEPTION 'Required release capability is missing: public.public_professionals';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
