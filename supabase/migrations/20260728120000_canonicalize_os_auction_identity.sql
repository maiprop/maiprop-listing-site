-- Repair the historical OS importer race without deleting listings or breaking
-- listing foreign keys, then enforce one durable Hub row per provider auction.

BEGIN;

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
    WHERE tag.value LIKE 'os_auction:%'
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

CREATE TABLE IF NOT EXISTS private.os_auction_duplicate_quarantine (
  duplicate_listing_id uuid PRIMARY KEY
    REFERENCES public.listings(id) ON DELETE RESTRICT,
  canonical_listing_id uuid NOT NULL
    REFERENCES public.listings(id) ON DELETE RESTRICT,
  provider_id text NOT NULL,
  previous_status public.listing_status NOT NULL,
  previous_tags text[] NOT NULL,
  quarantined_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  reason text NOT NULL DEFAULT 'duplicate_os_auction_identity'
    CHECK (reason = 'duplicate_os_auction_identity'),
  CHECK (duplicate_listing_id <> canonical_listing_id)
);

REVOKE ALL ON TABLE private.os_auction_duplicate_quarantine
  FROM PUBLIC, anon, authenticated;

SET LOCAL lock_timeout = '5s';
-- This migration later needs ACCESS EXCLUSIVE for the generated column. Take
-- it before the promotion ledger lock so existing promotion writers (which
-- lock the listing first) finish, and no new allocation can pass its listing
-- lock between the promotion guard and quarantine update.
LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.listing_promotion_allocations IN SHARE MODE;

DO $$
BEGIN
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
    RAISE EXCEPTION 'os_auction_source_identity_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.listings AS listing
    WHERE listing.listing_type = 'auction'::public.listing_type
      AND private.extract_os_auction_id(listing.tags) IS NOT NULL
      AND listing.owner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_identity_has_owner'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

DROP TABLE IF EXISTS pg_temp.os_auction_duplicate_plan;
CREATE TEMP TABLE os_auction_duplicate_plan
ON COMMIT DROP
AS
WITH ranked AS (
  SELECT
    listing.id AS duplicate_listing_id,
    first_value(listing.id) OVER (
      PARTITION BY private.extract_os_auction_id(listing.tags)
      ORDER BY
        CASE WHEN listing.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
        listing.updated_at DESC,
        listing.created_at DESC,
        listing.id DESC
    ) AS canonical_listing_id,
    private.extract_os_auction_id(listing.tags) AS provider_id,
    (
      SELECT tag.value
      FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
      WHERE tag.value LIKE 'os_auction:%'
      ORDER BY tag.value
      LIMIT 1
    ) AS original_os_tag,
    listing.status AS previous_status,
    COALESCE(listing.tags, '{}'::text[]) AS previous_tags,
    row_number() OVER (
      PARTITION BY private.extract_os_auction_id(listing.tags)
      ORDER BY
        CASE WHEN listing.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
        listing.updated_at DESC,
        listing.created_at DESC,
        listing.id DESC
    ) AS identity_rank
  FROM public.listings AS listing
  WHERE listing.listing_type = 'auction'::public.listing_type
    AND private.extract_os_auction_id(listing.tags) IS NOT NULL
)
SELECT
  ranked.duplicate_listing_id,
  ranked.canonical_listing_id,
  ranked.provider_id,
  ranked.original_os_tag,
  ranked.previous_status,
  ranked.previous_tags
FROM ranked
WHERE ranked.identity_rank > 1;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_duplicate_plan AS plan
    JOIN public.listings AS listing
      ON listing.id = plan.duplicate_listing_id
    WHERE listing.owner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_has_owner'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_duplicate_plan AS plan
    JOIN public.listing_promotion_allocations AS allocation
      ON allocation.listing_id = plan.duplicate_listing_id
    WHERE allocation.starts_at <= statement_timestamp()
      AND allocation.ends_at > statement_timestamp()
      AND allocation.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_has_active_promotion'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

INSERT INTO private.os_auction_duplicate_quarantine (
  duplicate_listing_id,
  canonical_listing_id,
  provider_id,
  previous_status,
  previous_tags
)
SELECT
  plan.duplicate_listing_id,
  plan.canonical_listing_id,
  plan.provider_id,
  plan.previous_status,
  plan.previous_tags
FROM pg_temp.os_auction_duplicate_plan AS plan
ON CONFLICT (duplicate_listing_id) DO NOTHING;

UPDATE public.listings AS listing
SET
  status = CASE
    WHEN listing.status = 'active'::public.listing_status
      THEN 'paused'::public.listing_status
    ELSE listing.status
  END,
  tags = CASE
    WHEN array_replace(
      COALESCE(listing.tags, '{}'::text[]),
      plan.original_os_tag,
      'os_auction_duplicate:' || plan.provider_id
    ) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
      THEN array_replace(
        COALESCE(listing.tags, '{}'::text[]),
        plan.original_os_tag,
        'os_auction_duplicate:' || plan.provider_id
      )
    ELSE array_replace(
      COALESCE(listing.tags, '{}'::text[]),
      plan.original_os_tag,
      'os_auction_duplicate:' || plan.provider_id
    ) || ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
  END
FROM pg_temp.os_auction_duplicate_plan AS plan
WHERE listing.id = plan.duplicate_listing_id;

ALTER TABLE public.listings
  ADD COLUMN os_auction_id text
  GENERATED ALWAYS AS (
    CASE
      WHEN listing_type = 'auction'::public.listing_type
        THEN private.extract_os_auction_id(tags)
      ELSE NULL
    END
  ) STORED;

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
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_os_auction_id_unique
  ON public.listings (os_auction_id);

COMMENT ON COLUMN public.listings.os_auction_id IS
  'Canonical provider identity derived from one valid os_auction tag; unique across Hub listings.';
COMMENT ON TABLE private.os_auction_duplicate_quarantine IS
  'Recoverable map from corrupt historical OS duplicate rows to the retained canonical listing UUID.';

COMMIT;
