-- Exact auction lookups must not depend on the bounded catalogue stream used
-- for browse pages. Keep them publication-pinned and indexed by listing ID or
-- the already-indexed per-publication OS tag.

CREATE INDEX IF NOT EXISTS
  idx_public_catalogue_versions_auction_listing_publication
ON private.public_catalogue_versions (
  listing_id,
  valid_from_publication,
  valid_to_publication
)
WHERE listing_type = 'auction';

DROP FUNCTION IF EXISTS public.get_public_catalogue_auctions(
  bigint,
  uuid[],
  text
);
CREATE OR REPLACE FUNCTION public.get_public_catalogue_auctions(
  p_publication_id bigint DEFAULT NULL,
  p_listing_ids uuid[] DEFAULT NULL,
  p_os_tag text DEFAULT NULL
)
RETURNS TABLE(
  publication_id bigint,
  published_at timestamptz,
  listing_id uuid,
  detail_payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint :=
    private.resolve_public_catalogue_publication(p_publication_id);
  v_match_count integer;
BEGIN
  IF (p_listing_ids IS NULL) = (p_os_tag IS NULL) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_auction_identity'
      USING ERRCODE = '22023';
  END IF;

  IF p_listing_ids IS NOT NULL
     AND (
       cardinality(p_listing_ids) < 1
       OR cardinality(p_listing_ids) > 600
       OR array_position(p_listing_ids, NULL::uuid) IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_auction_identity'
      USING ERRCODE = '22023';
  END IF;

  IF p_os_tag IS NOT NULL
     AND (
       length(p_os_tag) > 120
       OR p_os_tag !~ '^[A-Za-z0-9:_-]+$'
     ) THEN
    RAISE EXCEPTION 'public_catalogue_invalid_auction_identity'
      USING ERRCODE = '22023';
  END IF;

  IF p_os_tag IS NOT NULL THEN
    SELECT count(*)::integer
    INTO v_match_count
    FROM private.public_catalogue_versions AS version
    WHERE version.valid_from_publication <= v_publication_id
      AND (
        version.valid_to_publication IS NULL
        OR v_publication_id < version.valid_to_publication
      )
      AND version.listing_type = 'auction'
      AND version.os_tag = p_os_tag;

    IF v_match_count > 1 THEN
      RAISE EXCEPTION 'public_catalogue_duplicate_os_tag'
        USING ERRCODE = '23505';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    publication.publication_id,
    publication.published_at,
    version.listing_id,
    version.detail_payload
  FROM private.public_catalogue_versions AS version
  JOIN private.public_catalogue_publications AS publication
    ON publication.publication_id = v_publication_id
  WHERE version.valid_from_publication <= v_publication_id
    AND (
      version.valid_to_publication IS NULL
      OR v_publication_id < version.valid_to_publication
    )
    AND version.listing_type = 'auction'
    AND (
      (
        p_listing_ids IS NOT NULL
        AND version.listing_id = ANY(p_listing_ids)
      )
      OR (
        p_os_tag IS NOT NULL
        AND version.os_tag = p_os_tag
      )
    )
  ORDER BY
    CASE
      WHEN p_listing_ids IS NULL THEN 1
      ELSE array_position(p_listing_ids, version.listing_id)
    END,
    version.listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalogue_auctions(
  bigint,
  uuid[],
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalogue_auctions(
  bigint,
  uuid[],
  text
) TO anon, authenticated;

-- Homepage responses are backed by the same immutable publication and must
-- carry its retention boundary to every cache layer.
DROP FUNCTION IF EXISTS public.get_public_catalogue_homepage(bigint);
CREATE OR REPLACE FUNCTION public.get_public_catalogue_homepage(
  p_publication_id bigint DEFAULT NULL
)
RETURNS TABLE(
  publication_id bigint,
  published_at timestamptz,
  retain_until timestamptz,
  payload jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication_id bigint :=
    private.resolve_public_catalogue_publication(p_publication_id);
BEGIN
  RETURN QUERY
  SELECT
    publication.publication_id,
    publication.published_at,
    publication.retain_until,
    publication.homepage_payload
  FROM private.public_catalogue_publications AS publication
  WHERE publication.publication_id = v_publication_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_catalogue_homepage(bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_catalogue_homepage(bigint)
  TO anon, authenticated;
