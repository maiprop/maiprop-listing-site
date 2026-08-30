-- Prepare the historical OS identity duplicate repair in bounded statements.
-- The immutable bridge migration that follows observes an empty duplicate plan
-- while retaining its own final guards, generated column, and unique index.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

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
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_relation oid := to_regclass('private.os_auction_duplicate_quarantine');
  v_duplicate_attribute smallint;
  v_canonical_attribute smallint;
  v_listings_id_attribute smallint;
BEGIN
  IF v_relation IS NULL OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = v_relation
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND NOT relation.relrowsecurity
      AND NOT relation.relforcerowsecurity
      AND pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      AND NOT EXISTS (
        SELECT 1
        FROM pg_catalog.aclexplode(
          COALESCE(
            relation.relacl,
            pg_catalog.acldefault('r', relation.relowner)
          )
        ) AS privilege
        WHERE privilege.grantee <> relation.relowner
      )
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ) <> 7 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 1
      AND attribute.attname = 'duplicate_listing_id'
      AND attribute.atttypid = 'uuid'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 2
      AND attribute.attname = 'canonical_listing_id'
      AND attribute.atttypid = 'uuid'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 3
      AND attribute.attname = 'provider_id'
      AND attribute.atttypid = 'text'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 4
      AND attribute.attname = 'previous_status'
      AND attribute.atttypid = 'public.listing_status'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 5
      AND attribute.attname = 'previous_tags'
      AND attribute.atttypid = 'text[]'::regtype
      AND attribute.attnotnull
      AND NOT attribute.atthasdef
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
     AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 6
      AND attribute.attname = 'quarantined_at'
      AND attribute.atttypid = 'timestamptz'::regtype
      AND attribute.attnotnull
      AND pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
        = 'statement_timestamp()'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    JOIN pg_catalog.pg_attrdef AS default_value
      ON default_value.adrelid = attribute.attrelid
     AND default_value.adnum = attribute.attnum
    WHERE attribute.attrelid = v_relation
      AND attribute.attnum = 7
      AND attribute.attname = 'reason'
      AND attribute.atttypid = 'text'::regtype
      AND attribute.attnotnull
      AND pg_catalog.pg_get_expr(default_value.adbin, default_value.adrelid)
        = '''duplicate_os_auction_identity''::text'
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_quarantine_schema_drift'
      USING ERRCODE = '23514';
  END IF;

  SELECT
    max(attribute.attnum) FILTER (
      WHERE attribute.attname = 'duplicate_listing_id'
    ),
    max(attribute.attnum) FILTER (
      WHERE attribute.attname = 'canonical_listing_id'
    )
  INTO v_duplicate_attribute, v_canonical_attribute
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = v_relation;

  SELECT attribute.attnum
  INTO v_listings_id_attribute
  FROM pg_catalog.pg_attribute AS attribute
  WHERE attribute.attrelid = 'public.listings'::regclass
    AND attribute.attname = 'id';

  IF (
    SELECT count(*)
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
  ) <> 5 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
      AND constraint_record.contype = 'p'
      AND constraint_record.convalidated
      AND NOT constraint_record.condeferrable
      AND NOT constraint_record.condeferred
      AND constraint_record.conkey = ARRAY[v_duplicate_attribute]::smallint[]
  ) OR (
    SELECT count(*)
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
      AND constraint_record.contype = 'f'
      AND constraint_record.convalidated
      AND NOT constraint_record.condeferrable
      AND NOT constraint_record.condeferred
      AND constraint_record.confrelid = 'public.listings'::regclass
      AND constraint_record.confdeltype = 'r'
      AND constraint_record.confupdtype = 'a'
  ) <> 2 OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
      AND constraint_record.contype = 'f'
      AND constraint_record.convalidated
      AND NOT constraint_record.condeferrable
      AND NOT constraint_record.condeferred
      AND constraint_record.conkey = ARRAY[v_duplicate_attribute]::smallint[]
      AND constraint_record.confrelid = 'public.listings'::regclass
      AND constraint_record.confkey = ARRAY[v_listings_id_attribute]::smallint[]
      AND constraint_record.confdeltype = 'r'
      AND constraint_record.confupdtype = 'a'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
      AND constraint_record.contype = 'f'
      AND constraint_record.convalidated
      AND NOT constraint_record.condeferrable
      AND NOT constraint_record.condeferred
      AND constraint_record.conkey = ARRAY[v_canonical_attribute]::smallint[]
      AND constraint_record.confrelid = 'public.listings'::regclass
      AND constraint_record.confkey = ARRAY[v_listings_id_attribute]::smallint[]
      AND constraint_record.confdeltype = 'r'
      AND constraint_record.confupdtype = 'a'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
      AND constraint_record.contype = 'c'
      AND constraint_record.convalidated
      AND NOT constraint_record.condeferrable
      AND NOT constraint_record.condeferred
      AND pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_record.oid),
        '[[:space:]]+', ' ', 'g'
      ) = 'CHECK ((duplicate_listing_id <> canonical_listing_id))'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_record
    WHERE constraint_record.conrelid = v_relation
      AND constraint_record.contype = 'c'
      AND constraint_record.convalidated
      AND NOT constraint_record.condeferrable
      AND NOT constraint_record.condeferred
      AND pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_record.oid),
        '[[:space:]]+', ' ', 'g'
      ) = 'CHECK ((reason = ''duplicate_os_auction_identity''::text))'
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_quarantine_schema_drift'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

-- SHARE ROW EXCLUSIVE blocks listing writers while remaining compatible with
-- the ACCESS SHARE lock used by ordinary catalogue reads. Keep the established
-- listing-before-promotion lock order.
LOCK TABLE public.listings IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.listing_promotion_allocations IN SHARE MODE;

CREATE TEMP TABLE os_auction_identity_candidates (
  id uuid PRIMARY KEY,
  owner_id uuid,
  status public.listing_status NOT NULL,
  updated_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  previous_tags text[] NOT NULL,
  provider_id text NOT NULL,
  original_os_tag text NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.os_auction_identity_candidates (
  id,
  owner_id,
  status,
  updated_at,
  created_at,
  previous_tags,
  provider_id,
  original_os_tag
)
WITH extracted AS MATERIALIZED (
  SELECT
    listing.id,
    listing.owner_id,
    listing.status,
    listing.updated_at,
    listing.created_at,
    COALESCE(listing.tags, '{}'::text[]) AS previous_tags,
    private.extract_os_auction_id(listing.tags) AS provider_id
  FROM public.listings AS listing
  WHERE listing.listing_type = 'auction'::public.listing_type
)
SELECT
  extracted.id,
  extracted.owner_id,
  extracted.status,
  extracted.updated_at,
  extracted.created_at,
  extracted.previous_tags,
  extracted.provider_id,
  original_tag.value
FROM extracted
CROSS JOIN LATERAL (
  SELECT tag.value
  FROM unnest(extracted.previous_tags) AS tag(value)
  WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
  ORDER BY tag.value
  LIMIT 1
) AS original_tag
WHERE extracted.provider_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS os_auction_identity_candidates_rank_idx
  ON pg_temp.os_auction_identity_candidates (
    provider_id,
    (CASE WHEN status = 'active'::public.listing_status THEN 1 ELSE 0 END) DESC,
    updated_at DESC,
    created_at DESC,
    id DESC
  );

ANALYZE pg_temp.os_auction_identity_candidates;

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
        OR NOT EXISTS (
          SELECT 1
          FROM pg_temp.os_auction_identity_candidates AS candidate
          WHERE candidate.id = listing.id
        )
      )
  ) THEN
    RAISE EXCEPTION 'os_auction_source_identity_invalid'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_identity_candidates AS candidate
    WHERE candidate.owner_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_has_owner'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE TEMP TABLE os_auction_duplicate_plan (
  duplicate_listing_id uuid PRIMARY KEY,
  canonical_listing_id uuid NOT NULL,
  provider_id text NOT NULL,
  previous_status public.listing_status NOT NULL,
  previous_tags text[] NOT NULL,
  expected_status public.listing_status NOT NULL,
  expected_tags text[] NOT NULL,
  batch_no integer NOT NULL
) ON COMMIT DROP;

INSERT INTO pg_temp.os_auction_duplicate_plan (
  duplicate_listing_id,
  canonical_listing_id,
  provider_id,
  previous_status,
  previous_tags,
  expected_status,
  expected_tags,
  batch_no
)
WITH ranked AS MATERIALIZED (
  SELECT
    candidate.*,
    first_value(candidate.id) OVER (
      PARTITION BY candidate.provider_id
      ORDER BY
        CASE WHEN candidate.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
    ) AS canonical_listing_id,
    row_number() OVER (
      PARTITION BY candidate.provider_id
      ORDER BY
        CASE WHEN candidate.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
        candidate.updated_at DESC,
        candidate.created_at DESC,
        candidate.id DESC
    ) AS identity_rank
  FROM pg_temp.os_auction_identity_candidates AS candidate
), duplicate_rows AS MATERIALIZED (
  SELECT
    ranked.*,
    row_number() OVER (ORDER BY ranked.id) - 1 AS duplicate_ordinal
  FROM ranked
  WHERE ranked.identity_rank > 1
)
SELECT
  duplicate.id,
  duplicate.canonical_listing_id,
  duplicate.provider_id,
  duplicate.status,
  duplicate.previous_tags,
  CASE
    WHEN duplicate.status = 'active'::public.listing_status
      THEN 'paused'::public.listing_status
    ELSE duplicate.status
  END,
  CASE
    WHEN transformed.tags
        @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
      THEN transformed.tags
    ELSE transformed.tags
      || ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
  END,
  (duplicate.duplicate_ordinal / 1024)::integer AS batch_no
FROM duplicate_rows AS duplicate
CROSS JOIN LATERAL (
  SELECT array_replace(
    duplicate.previous_tags,
    duplicate.original_os_tag,
    'os_auction_duplicate:' || duplicate.provider_id
  ) AS tags
) AS transformed;

CREATE INDEX IF NOT EXISTS os_auction_duplicate_plan_batch_idx
  ON pg_temp.os_auction_duplicate_plan (batch_no, duplicate_listing_id);

ANALYZE pg_temp.os_auction_duplicate_plan;

DO $$
DECLARE
  v_candidate_count integer;
  v_max_batch_count integer;
BEGIN
  SELECT count(*)::integer
  INTO v_candidate_count
  FROM pg_temp.os_auction_duplicate_plan;

  IF v_candidate_count > 65536 THEN
    RAISE EXCEPTION 'os_auction_duplicate_candidate_cap_exceeded'
      USING ERRCODE = '23514';
  END IF;

  SELECT COALESCE(max(batch_count), 0)::integer
  INTO v_max_batch_count
  FROM (
    SELECT count(*) AS batch_count
    FROM pg_temp.os_auction_duplicate_plan
    GROUP BY batch_no
  ) AS batches;

  IF v_max_batch_count > 1024 THEN
    RAISE EXCEPTION 'os_auction_duplicate_batch_cap_exceeded'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_duplicate_plan AS plan
    JOIN public.listing_promotion_allocations AS allocation
      ON allocation.listing_id = plan.duplicate_listing_id
    WHERE allocation.ends_at > statement_timestamp()
      AND allocation.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_has_active_promotion'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.apply_os_auction_duplicate_batch(p_batch_no integer)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_expected_count integer;
  v_snapshot_count integer;
  v_update_count integer;
BEGIN
  IF p_batch_no < 0 OR p_batch_no > 63 THEN
    RAISE EXCEPTION 'os_auction_duplicate_batch_number_invalid'
      USING ERRCODE = '23514';
  END IF;

  SELECT count(*)::integer
  INTO v_expected_count
  FROM pg_temp.os_auction_duplicate_plan AS plan
  WHERE plan.batch_no = p_batch_no;

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
  WHERE plan.batch_no = p_batch_no
  ON CONFLICT (duplicate_listing_id) DO NOTHING;

  GET DIAGNOSTICS v_snapshot_count = ROW_COUNT;
  IF v_snapshot_count <> v_expected_count THEN
    RAISE EXCEPTION 'os_auction_duplicate_snapshot_rowcount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_duplicate_plan AS plan
    LEFT JOIN private.os_auction_duplicate_quarantine AS quarantine
      ON quarantine.duplicate_listing_id = plan.duplicate_listing_id
    WHERE plan.batch_no = p_batch_no
      AND (
        quarantine.duplicate_listing_id IS NULL
        OR quarantine.canonical_listing_id IS DISTINCT FROM plan.canonical_listing_id
        OR quarantine.provider_id IS DISTINCT FROM plan.provider_id
        OR quarantine.previous_status IS DISTINCT FROM plan.previous_status
        OR quarantine.previous_tags IS DISTINCT FROM plan.previous_tags
        OR quarantine.reason IS DISTINCT FROM 'duplicate_os_auction_identity'
      )
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_snapshot_incomplete'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.listings AS listing
  SET
    status = plan.expected_status,
    tags = plan.expected_tags
  FROM pg_temp.os_auction_duplicate_plan AS plan
  WHERE plan.batch_no = p_batch_no
    AND listing.id = plan.duplicate_listing_id;

  GET DIAGNOSTICS v_update_count = ROW_COUNT;
  IF v_update_count <> v_expected_count THEN
    RAISE EXCEPTION 'os_auction_duplicate_update_rowcount_mismatch'
      USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_duplicate_plan AS plan
    JOIN public.listings AS listing
      ON listing.id = plan.duplicate_listing_id
    WHERE plan.batch_no = p_batch_no
      AND (
        listing.status IS DISTINCT FROM plan.expected_status
        OR listing.tags IS DISTINCT FROM plan.expected_tags
      )
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_batch_post_state_mismatch'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

SELECT pg_temp.apply_os_auction_duplicate_batch(0);
SELECT pg_temp.apply_os_auction_duplicate_batch(1);
SELECT pg_temp.apply_os_auction_duplicate_batch(2);
SELECT pg_temp.apply_os_auction_duplicate_batch(3);
SELECT pg_temp.apply_os_auction_duplicate_batch(4);
SELECT pg_temp.apply_os_auction_duplicate_batch(5);
SELECT pg_temp.apply_os_auction_duplicate_batch(6);
SELECT pg_temp.apply_os_auction_duplicate_batch(7);
SELECT pg_temp.apply_os_auction_duplicate_batch(8);
SELECT pg_temp.apply_os_auction_duplicate_batch(9);
SELECT pg_temp.apply_os_auction_duplicate_batch(10);
SELECT pg_temp.apply_os_auction_duplicate_batch(11);
SELECT pg_temp.apply_os_auction_duplicate_batch(12);
SELECT pg_temp.apply_os_auction_duplicate_batch(13);
SELECT pg_temp.apply_os_auction_duplicate_batch(14);
SELECT pg_temp.apply_os_auction_duplicate_batch(15);
SELECT pg_temp.apply_os_auction_duplicate_batch(16);
SELECT pg_temp.apply_os_auction_duplicate_batch(17);
SELECT pg_temp.apply_os_auction_duplicate_batch(18);
SELECT pg_temp.apply_os_auction_duplicate_batch(19);
SELECT pg_temp.apply_os_auction_duplicate_batch(20);
SELECT pg_temp.apply_os_auction_duplicate_batch(21);
SELECT pg_temp.apply_os_auction_duplicate_batch(22);
SELECT pg_temp.apply_os_auction_duplicate_batch(23);
SELECT pg_temp.apply_os_auction_duplicate_batch(24);
SELECT pg_temp.apply_os_auction_duplicate_batch(25);
SELECT pg_temp.apply_os_auction_duplicate_batch(26);
SELECT pg_temp.apply_os_auction_duplicate_batch(27);
SELECT pg_temp.apply_os_auction_duplicate_batch(28);
SELECT pg_temp.apply_os_auction_duplicate_batch(29);
SELECT pg_temp.apply_os_auction_duplicate_batch(30);
SELECT pg_temp.apply_os_auction_duplicate_batch(31);
SELECT pg_temp.apply_os_auction_duplicate_batch(32);
SELECT pg_temp.apply_os_auction_duplicate_batch(33);
SELECT pg_temp.apply_os_auction_duplicate_batch(34);
SELECT pg_temp.apply_os_auction_duplicate_batch(35);
SELECT pg_temp.apply_os_auction_duplicate_batch(36);
SELECT pg_temp.apply_os_auction_duplicate_batch(37);
SELECT pg_temp.apply_os_auction_duplicate_batch(38);
SELECT pg_temp.apply_os_auction_duplicate_batch(39);
SELECT pg_temp.apply_os_auction_duplicate_batch(40);
SELECT pg_temp.apply_os_auction_duplicate_batch(41);
SELECT pg_temp.apply_os_auction_duplicate_batch(42);
SELECT pg_temp.apply_os_auction_duplicate_batch(43);
SELECT pg_temp.apply_os_auction_duplicate_batch(44);
SELECT pg_temp.apply_os_auction_duplicate_batch(45);
SELECT pg_temp.apply_os_auction_duplicate_batch(46);
SELECT pg_temp.apply_os_auction_duplicate_batch(47);
SELECT pg_temp.apply_os_auction_duplicate_batch(48);
SELECT pg_temp.apply_os_auction_duplicate_batch(49);
SELECT pg_temp.apply_os_auction_duplicate_batch(50);
SELECT pg_temp.apply_os_auction_duplicate_batch(51);
SELECT pg_temp.apply_os_auction_duplicate_batch(52);
SELECT pg_temp.apply_os_auction_duplicate_batch(53);
SELECT pg_temp.apply_os_auction_duplicate_batch(54);
SELECT pg_temp.apply_os_auction_duplicate_batch(55);
SELECT pg_temp.apply_os_auction_duplicate_batch(56);
SELECT pg_temp.apply_os_auction_duplicate_batch(57);
SELECT pg_temp.apply_os_auction_duplicate_batch(58);
SELECT pg_temp.apply_os_auction_duplicate_batch(59);
SELECT pg_temp.apply_os_auction_duplicate_batch(60);
SELECT pg_temp.apply_os_auction_duplicate_batch(61);
SELECT pg_temp.apply_os_auction_duplicate_batch(62);
SELECT pg_temp.apply_os_auction_duplicate_batch(63);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_temp.os_auction_duplicate_plan AS plan
    LEFT JOIN private.os_auction_duplicate_quarantine AS quarantine
      ON quarantine.duplicate_listing_id = plan.duplicate_listing_id
    LEFT JOIN public.listings AS listing
      ON listing.id = plan.duplicate_listing_id
    WHERE quarantine.duplicate_listing_id IS NULL
      OR quarantine.canonical_listing_id IS DISTINCT FROM plan.canonical_listing_id
      OR quarantine.provider_id IS DISTINCT FROM plan.provider_id
      OR quarantine.previous_status IS DISTINCT FROM plan.previous_status
      OR quarantine.previous_tags IS DISTINCT FROM plan.previous_tags
      OR listing.id IS NULL
      OR listing.status IS DISTINCT FROM plan.expected_status
      OR listing.tags IS DISTINCT FROM plan.expected_tags
  ) THEN
    RAISE EXCEPTION 'os_auction_duplicate_preparation_incomplete'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

COMMENT ON TABLE private.os_auction_duplicate_quarantine IS
  'Recoverable map from corrupt historical OS duplicate rows to the retained canonical listing UUID.';

COMMIT;
