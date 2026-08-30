-- Quarantine historical OS-source rows whose provider identity cannot satisfy
-- the canonical identity bridge. Preserve their complete original state while
-- removing every live tag consumed by OS auction features.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE OR REPLACE FUNCTION private.extract_os_auction_id(p_tags text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  WITH identities AS (
    SELECT lower(btrim(substr(tag.value, length('os_auction:') + 1))) AS value
    FROM unnest(COALESCE(p_tags, '{}'::text[])) AS tag(value)
    WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
  )
  SELECT CASE
    WHEN count(*) = 1
      AND min(value) ~ '^[a-z0-9:_-]{1,120}$'
      AND min(value) NOT IN ('unknown', 'null', 'undefined', 'none', 'na', 'n/a')
    THEN min(value)
    ELSE NULL
  END
  FROM identities;
$$;

REVOKE ALL ON FUNCTION private.extract_os_auction_id(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.extract_os_auction_id(text[])
  TO service_role;

CREATE TABLE private.os_auction_invalid_identity_quarantine (
  listing_id uuid PRIMARY KEY
    REFERENCES public.listings(id) ON DELETE RESTRICT,
  previous_status public.listing_status NOT NULL,
  previous_tags text[] NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  reason text NOT NULL CHECK (reason IN (
    'non_auction',
    'missing_identity',
    'multiple_identities',
    'placeholder_identity',
    'malformed_identity'
  ))
);

ALTER TABLE private.os_auction_invalid_identity_quarantine
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.os_auction_invalid_identity_quarantine
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.quarantine_invalid_os_auction_identity()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_candidate_count integer;
  v_snapshot_count integer;
  v_update_count integer;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '30s';

  -- Match the established promotion-writer protocol: the listing lock is
  -- always acquired before the allocation ledger lock.
  LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE;
  LOCK TABLE public.listing_promotion_allocations IN SHARE MODE;

  DROP TABLE IF EXISTS pg_temp.invalid_os_auction_identity_plan;
  CREATE TEMP TABLE invalid_os_auction_identity_plan
  ON COMMIT DROP
  AS
  WITH listing_identity AS (
    SELECT
      listing.id AS listing_id,
      listing.owner_id,
      listing.listing_type,
      listing.status AS previous_status,
      COALESCE(listing.tags, '{}'::text[]) AS previous_tags,
      count(tag.value) FILTER (
        WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
      ) AS provider_tag_count,
      min(
        lower(btrim(substr(tag.value, length('os_auction:') + 1)))
      ) FILTER (
        WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
      ) AS observed_provider_id
    FROM public.listings AS listing
    LEFT JOIN LATERAL unnest(
      COALESCE(listing.tags, '{}'::text[])
    ) AS tag(value) ON true
    WHERE COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os']::text[]
      AND NOT COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
    GROUP BY listing.id
  )
  SELECT
    identity.listing_id,
    identity.owner_id,
    identity.previous_status,
    identity.previous_tags,
    CASE
      WHEN identity.listing_type <> 'auction'::public.listing_type
        THEN 'non_auction'
      WHEN identity.provider_tag_count = 0
        THEN 'missing_identity'
      WHEN identity.provider_tag_count > 1
        THEN 'multiple_identities'
      WHEN identity.observed_provider_id IN (
        'unknown', 'null', 'undefined', 'none', 'na', 'n/a'
      ) THEN 'placeholder_identity'
      ELSE 'malformed_identity'
    END AS reason
  FROM listing_identity AS identity
  WHERE identity.listing_type <> 'auction'::public.listing_type
    OR private.extract_os_auction_id(identity.previous_tags) IS NULL;

  SELECT count(*)::integer
  INTO v_candidate_count
  FROM pg_temp.invalid_os_auction_identity_plan;

  IF v_candidate_count > 1 THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_candidate_cap_exceeded'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.invalid_os_auction_identity_plan AS plan
    WHERE plan.owner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_has_owner'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.invalid_os_auction_identity_plan AS plan
    JOIN public.listing_promotion_allocations AS allocation
      ON allocation.listing_id = plan.listing_id
    WHERE allocation.ends_at > statement_timestamp()
      AND allocation.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_has_active_promotion'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO private.os_auction_invalid_identity_quarantine (
    listing_id,
    previous_status,
    previous_tags,
    reason
  )
  SELECT
    plan.listing_id,
    plan.previous_status,
    plan.previous_tags,
    plan.reason
  FROM pg_temp.invalid_os_auction_identity_plan AS plan
  ;

  GET DIAGNOSTICS v_snapshot_count = ROW_COUNT;
  IF v_snapshot_count <> v_candidate_count THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_snapshot_conflict'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.invalid_os_auction_identity_plan AS plan
    LEFT JOIN private.os_auction_invalid_identity_quarantine AS quarantine
      ON quarantine.listing_id = plan.listing_id
    WHERE quarantine.listing_id IS NULL
      OR quarantine.previous_status IS DISTINCT FROM plan.previous_status
      OR quarantine.previous_tags IS DISTINCT FROM plan.previous_tags
      OR quarantine.reason IS DISTINCT FROM plan.reason
  ) THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_snapshot_incomplete'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.listings AS listing
  SET
    status = CASE
      WHEN listing.status = 'active'::public.listing_status
        THEN 'paused'::public.listing_status
      ELSE listing.status
    END,
    tags = ARRAY(
      SELECT tag.value
      FROM unnest(COALESCE(listing.tags, '{}'::text[]))
        WITH ORDINALITY AS tag(value, ordinal)
      WHERE tag.value <> 'source:maiprop-os'
        AND left(tag.value, length('os_auction:')) <> 'os_auction:'
        AND tag.value <> 'source:maiprop-os-invalid-identity-quarantine'
      ORDER BY tag.ordinal
    ) || ARRAY['source:maiprop-os-invalid-identity-quarantine']::text[]
  FROM pg_temp.invalid_os_auction_identity_plan AS plan
  WHERE listing.id = plan.listing_id;

  GET DIAGNOSTICS v_update_count = ROW_COUNT;
  IF v_update_count <> v_candidate_count THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_update_incomplete'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.invalid_os_auction_identity_plan AS plan
    JOIN public.listings AS listing
      ON listing.id = plan.listing_id
    WHERE listing.status = 'active'::public.listing_status
      OR COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os']::text[]
      OR NOT COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os-invalid-identity-quarantine']::text[]
      OR EXISTS (
        SELECT 1
        FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
        WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
      )
  ) THEN
    RAISE EXCEPTION 'os_auction_invalid_identity_quarantine_incomplete'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_candidate_count;
END;
$$;

REVOKE ALL ON FUNCTION private.quarantine_invalid_os_auction_identity()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT private.quarantine_invalid_os_auction_identity();

COMMENT ON TABLE private.os_auction_invalid_identity_quarantine IS
  'Recoverable original state for historical OS-source rows removed from every live OS auction feature because their provider identity was invalid.';
COMMENT ON FUNCTION private.quarantine_invalid_os_auction_identity() IS
  'Lock-ordered, fail-closed, one-row-capped quarantine for invalid historical OS-source identity rows.';

COMMIT;
