-- Correct the historic SQL LIKE wildcard mismatch so provider identity uses
-- the same literal, case-sensitive os_auction: prefix as every live consumer.
-- Recompute bounded STORED generated-value mismatches without firing user
-- update triggers or changing any non-generated listing field.

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

CREATE OR REPLACE FUNCTION private.repair_exact_os_auction_identity_prefix()
RETURNS integer
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_candidate_count integer;
  v_null_candidate_count integer;
  v_value_candidate_count integer;
  v_null_update_count integer;
  v_value_update_count integer;
BEGIN
  SET LOCAL lock_timeout = '5s';
  SET LOCAL statement_timeout = '30s';

  LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE;

  IF EXISTS (
    SELECT 1
    FROM private.os_auction_duplicate_quarantine AS quarantine
    JOIN public.listings AS canonical
      ON canonical.id = quarantine.canonical_listing_id
    LEFT JOIN private.os_auction_invalid_identity_quarantine AS canonical_quarantine
      ON canonical_quarantine.listing_id = quarantine.canonical_listing_id
    WHERE private.extract_os_auction_id(quarantine.previous_tags)
        IS DISTINCT FROM quarantine.provider_id
      OR private.extract_os_auction_id(
        COALESCE(canonical_quarantine.previous_tags, canonical.tags)
      ) IS DISTINCT FROM quarantine.provider_id
  ) THEN
    RAISE EXCEPTION 'os_auction_exact_prefix_historical_duplicate_requires_manual_recovery'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.listings AS listing
    WHERE COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os']::text[]
      AND NOT COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
      AND (
        listing.listing_type <> 'auction'::public.listing_type
        OR private.extract_os_auction_id(listing.tags) IS NULL
      )
  ) THEN
    RAISE EXCEPTION 'os_auction_exact_prefix_requires_quarantine'
      USING ERRCODE = '23514';
  END IF;

  EXECUTE 'ALTER TABLE public.listings DROP CONSTRAINT listings_os_auction_source_identity_valid';

  EXECUTE $constraint$
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_os_auction_source_identity_valid
      CHECK (
        NOT COALESCE(tags, '{}'::text[])
          @> ARRAY['source:maiprop-os']::text[]
        OR COALESCE(tags, '{}'::text[])
          @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
        OR (
          listing_type = 'auction'::public.listing_type
          AND private.extract_os_auction_id(tags) IS NOT NULL
        )
      ) NOT VALID
  $constraint$;

  DROP TABLE IF EXISTS pg_temp.exact_os_auction_identity_repair_plan;
  CREATE TEMP TABLE exact_os_auction_identity_repair_plan
  ON COMMIT DROP
  AS
  SELECT
    listing.id AS listing_id,
    to_jsonb(listing) - 'os_auction_id' AS previous_row,
    CASE
      WHEN listing.listing_type = 'auction'::public.listing_type
        THEN private.extract_os_auction_id(listing.tags)
      ELSE NULL
    END AS expected_os_auction_id
  FROM public.listings AS listing
  WHERE listing.os_auction_id IS DISTINCT FROM CASE
    WHEN listing.listing_type = 'auction'::public.listing_type
      THEN private.extract_os_auction_id(listing.tags)
    ELSE NULL
  END;

  SELECT count(*)::integer
  INTO v_candidate_count
  FROM pg_temp.exact_os_auction_identity_repair_plan;

  SELECT
    count(*) FILTER (WHERE expected_os_auction_id IS NULL)::integer,
    count(*) FILTER (WHERE expected_os_auction_id IS NOT NULL)::integer
  INTO v_null_candidate_count, v_value_candidate_count
  FROM pg_temp.exact_os_auction_identity_repair_plan;

  IF v_candidate_count > 10 THEN
    RAISE EXCEPTION 'os_auction_exact_prefix_repair_candidate_cap_exceeded'
      USING ERRCODE = '23514';
  END IF;

  SET LOCAL session_replication_role = replica;
  UPDATE public.listings AS listing
  SET tags = listing.tags
  FROM pg_temp.exact_os_auction_identity_repair_plan AS plan
  WHERE listing.id = plan.listing_id
    AND plan.expected_os_auction_id IS NULL;
  GET DIAGNOSTICS v_null_update_count = ROW_COUNT;

  UPDATE public.listings AS listing
  SET tags = listing.tags
  FROM pg_temp.exact_os_auction_identity_repair_plan AS plan
  WHERE listing.id = plan.listing_id
    AND plan.expected_os_auction_id IS NOT NULL;
  GET DIAGNOSTICS v_value_update_count = ROW_COUNT;
  SET LOCAL session_replication_role = origin;

  IF v_null_update_count <> v_null_candidate_count
      OR v_value_update_count <> v_value_candidate_count
      OR v_null_update_count + v_value_update_count <> v_candidate_count THEN
    RAISE EXCEPTION 'os_auction_exact_prefix_repair_rowcount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.exact_os_auction_identity_repair_plan AS plan
    JOIN public.listings AS listing ON listing.id = plan.listing_id
    WHERE (to_jsonb(listing) - 'os_auction_id') IS DISTINCT FROM plan.previous_row
      OR listing.os_auction_id IS DISTINCT FROM plan.expected_os_auction_id
  ) THEN
    RAISE EXCEPTION 'os_auction_exact_prefix_repair_changed_listing_state'
      USING ERRCODE = '23514';
  END IF;

  EXECUTE 'ALTER TABLE public.listings VALIDATE CONSTRAINT listings_os_auction_source_identity_valid';

  IF EXISTS (
    SELECT 1
    FROM public.listings AS listing
    WHERE listing.os_auction_id IS DISTINCT FROM CASE
      WHEN listing.listing_type = 'auction'::public.listing_type
        THEN private.extract_os_auction_id(listing.tags)
      ELSE NULL
    END
  ) THEN
    RAISE EXCEPTION 'os_auction_exact_prefix_repair_incomplete'
      USING ERRCODE = '23514';
  END IF;

  RETURN v_candidate_count;
EXCEPTION WHEN OTHERS THEN
  SET LOCAL session_replication_role = origin;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION private.repair_exact_os_auction_identity_prefix()
  FROM PUBLIC, anon, authenticated, service_role;

SELECT private.repair_exact_os_auction_identity_prefix();

COMMENT ON FUNCTION private.extract_os_auction_id(text[]) IS
  'Extract one normalized provider identity from an exact literal os_auction: tag prefix.';
COMMENT ON FUNCTION private.repair_exact_os_auction_identity_prefix() IS
  'Lock-bounded exact-prefix STORED identity convergence with trigger suppression and full non-generated row preservation.';

COMMIT;
