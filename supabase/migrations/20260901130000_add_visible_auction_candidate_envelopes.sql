-- Return bounded auction rows and their stream metadata in one public RPC call.
-- Pool existence and facets are derived before caller filters; total_raw is
-- derived after filters but before the caller's per-stream 60/600 visible-row cap.

DO $$
BEGIN
  IF to_regprocedure(
    'public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required underlying auction candidate RPC is missing';
  END IF;

  IF to_regprocedure(
    'public.get_current_auction_listing_visible_limit()'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required current-user auction limit RPC is missing';
  END IF;
END
$$;

REVOKE ALL ON FUNCTION public.get_public_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_visible_auction_candidate_envelope(
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
  pool_exists BOOLEAN,
  total_raw BIGINT,
  facet_cities TEXT[],
  facet_rounds INTEGER[],
  visible_rows JSONB
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
            ~ '^[1-9][0-9]{0,8}$'
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
  SELECT
    EXISTS (SELECT 1 FROM bounded_candidates),
    (SELECT COUNT(*) FROM filtered_candidates),
    COALESCE(
      ARRAY(
        SELECT DISTINCT BTRIM(city_candidate.city)
        FROM bounded_candidates AS city_candidate
        WHERE BTRIM(COALESCE(city_candidate.city, '')) <> ''
        ORDER BY BTRIM(city_candidate.city)
      ),
      ARRAY[]::TEXT[]
    ),
    COALESCE(
      ARRAY(
        SELECT DISTINCT parsed_round.auction_round
        FROM bounded_candidates AS round_candidate
        CROSS JOIN LATERAL (
          SELECT CASE
            WHEN BTRIM(SUBSTRING(
              tagged.tag FROM CHAR_LENGTH('round:') + 1
            )) ~ '^[1-9][0-9]{0,8}$'
            THEN BTRIM(SUBSTRING(
              tagged.tag FROM CHAR_LENGTH('round:') + 1
            ))::INTEGER
            ELSE NULL::INTEGER
          END AS auction_round
          FROM pg_catalog.unnest(
            COALESCE(round_candidate.tags, ARRAY[]::TEXT[])
          ) WITH ORDINALITY AS tagged(tag, position)
          WHERE LEFT(tagged.tag, CHAR_LENGTH('round:')) = 'round:'
          ORDER BY tagged.position
          LIMIT 1
        ) AS parsed_round
        WHERE parsed_round.auction_round IS NOT NULL
        ORDER BY parsed_round.auction_round
      ),
      ARRAY[]::INTEGER[]
    ),
    COALESCE(
      (
        SELECT pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(visible_candidate)
          ORDER BY visible_candidate.auction_date ASC NULLS LAST,
            visible_candidate.id ASC
        )
        FROM (
          SELECT filtered.*
          FROM filtered_candidates AS filtered
          ORDER BY filtered.auction_date ASC NULLS LAST, filtered.id ASC
          LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600)
        ) AS visible_candidate
      ),
      '[]'::JSONB
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_visible_auction_candidate_envelope(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidate_envelope(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) TO anon, authenticated;

COMMENT ON FUNCTION public.get_visible_auction_candidate_envelope(
  INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT,
  NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT
) IS
  'One-row bounded auction stream envelope with unfiltered pool metadata and per-stream caller-visible filtered rows.';

DO $$
BEGIN
  IF to_regprocedure(
    'public.get_visible_auction_candidate_envelope(integer,text,date,timestamp with time zone,text,text,text,text,numeric,numeric,integer,integer,numeric,numeric,text,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'Required visible auction candidate envelope RPC is missing';
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
