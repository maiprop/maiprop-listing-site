BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(49);

SELECT ok(
  to_regclass('private.os_auction_invalid_identity_quarantine') IS NOT NULL,
  'invalid identity quarantine ledger exists'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class
   WHERE oid = 'private.os_auction_invalid_identity_quarantine'::regclass),
  'invalid identity quarantine ledger has RLS defense in depth'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    CROSS JOIN LATERAL aclexplode(
      COALESCE(relation.relacl, acldefault('r', relation.relowner))
    ) AS privilege
    WHERE relation.oid = 'private.os_auction_invalid_identity_quarantine'::regclass
      AND privilege.grantee = 0
  ),
  'PUBLIC has no direct quarantine ledger privilege'
);
SELECT ok(
  NOT has_table_privilege(
    'anon', 'private.os_auction_invalid_identity_quarantine', 'SELECT'
  ),
  'anon cannot read the quarantine ledger'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated', 'private.os_auction_invalid_identity_quarantine', 'SELECT'
  ),
  'authenticated cannot read the quarantine ledger'
);
SELECT ok(
  NOT has_table_privilege(
    'service_role', 'private.os_auction_invalid_identity_quarantine', 'SELECT'
  ),
  'service role cannot read the quarantine ledger'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
      'private.os_auction_invalid_identity_quarantine'::regclass
      AND constraint_definition.contype = 'f'
      AND constraint_definition.confrelid = 'public.listings'::regclass
      AND constraint_definition.confdeltype = 'r'
  ),
  'quarantine ledger listing foreign key is RESTRICT'
);
SELECT ok(
  NOT (SELECT prosecdef FROM pg_proc
       WHERE oid = 'private.quarantine_invalid_os_auction_identity()'::regprocedure),
  'quarantine routine is invoker security'
);

CREATE TEMP TABLE invalid_os_quarantine_test_baseline
ON COMMIT DROP
AS
SELECT count(*) AS ledger_rows
FROM private.os_auction_invalid_identity_quarantine;

ALTER TABLE public.listings
  DROP CONSTRAINT listings_os_auction_source_identity_valid;

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000099',
  'Owner rollback fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active',
  ARRAY['source:maiprop-os', 'os_auction:bad value']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  $$SELECT private.quarantine_invalid_os_auction_identity()$$,
  '23514',
  'os_auction_invalid_identity_has_owner',
  'an owner-linked candidate rolls the entire quarantine statement back'
);
SELECT is(
  (SELECT status::text FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000001'),
  'active',
  'owner guard preserves the original active status'
);
SELECT ok(
  (SELECT tags @> ARRAY['source:maiprop-os']::text[] FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000001'),
  'owner guard preserves the original source tag'
);
SELECT is(
  (SELECT count(*) FROM private.os_auction_invalid_identity_quarantine),
  (SELECT ledger_rows FROM invalid_os_quarantine_test_baseline),
  'owner guard writes no partial snapshot'
);

SET LOCAL session_replication_role = replica;
DELETE FROM public.listings
WHERE id = '74000000-0000-4000-8000-000000000001';
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000002',
  NULL,
  'Scheduled promotion rollback fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active',
  ARRAY['source:maiprop-os', 'os_auction:bad value']::text[],
  statement_timestamp(), statement_timestamp()
);
INSERT INTO public.listing_promotion_allocations (
  id, listing_id, owner_id, promotion_type, source_type,
  request_key, starts_at, ends_at
) VALUES (
  '74000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000099',
  'spotlight', 'admin', 'scheduled-invalid-quarantine-guard',
  statement_timestamp() + interval '1 day',
  statement_timestamp() + interval '2 days'
);
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  $$SELECT private.quarantine_invalid_os_auction_identity()$$,
  '23514',
  'os_auction_invalid_identity_has_active_promotion',
  'a scheduled unrevoked allocation rolls the entire quarantine statement back'
);
SELECT is(
  (SELECT status::text FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000002'),
  'active',
  'promotion guard preserves the original active status'
);
SELECT ok(
  (SELECT tags @> ARRAY['source:maiprop-os']::text[] FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000002'),
  'promotion guard preserves the original source tag'
);
SELECT is(
  (SELECT count(*) FROM private.os_auction_invalid_identity_quarantine),
  (SELECT ledger_rows FROM invalid_os_quarantine_test_baseline),
  'promotion guard writes no partial snapshot'
);

SET LOCAL session_replication_role = replica;
DELETE FROM public.listing_promotion_allocations
WHERE id = '74000000-0000-4000-8000-000000000003';
DELETE FROM public.listings
WHERE id = '74000000-0000-4000-8000-000000000002';
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES
  (
    '74000000-0000-4000-8000-000000000004', NULL,
    'Candidate cap fixture one', 'Athens', 1, 1, 'apartment',
    'auction', 'active', ARRAY['source:maiprop-os']::text[],
    statement_timestamp(), statement_timestamp()
  ),
  (
    '74000000-0000-4000-8000-000000000005', NULL,
    'Candidate cap fixture two', 'Athens', 1, 1, 'apartment',
    'auction', 'active', ARRAY['source:maiprop-os']::text[],
    statement_timestamp(), statement_timestamp()
  );
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  $$SELECT private.quarantine_invalid_os_auction_identity()$$,
  '23514',
  'os_auction_invalid_identity_candidate_cap_exceeded',
  'more than the evidenced one-row candidate set fails closed'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id IN (
     '74000000-0000-4000-8000-000000000004',
     '74000000-0000-4000-8000-000000000005'
   ) AND status = 'active'::public.listing_status),
  2::bigint,
  'candidate cap rolls back every live-row change'
);
SELECT is(
  (SELECT count(*) FROM private.os_auction_invalid_identity_quarantine),
  (SELECT ledger_rows FROM invalid_os_quarantine_test_baseline),
  'candidate cap writes no partial snapshot'
);

SET LOCAL session_replication_role = replica;
DELETE FROM public.listings
WHERE id IN (
  '74000000-0000-4000-8000-000000000004',
  '74000000-0000-4000-8000-000000000005'
);
SET LOCAL session_replication_role = origin;

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000011', NULL,
  'Non auction source fixture', 'Athens', 1, 1, 'apartment',
  'sale', 'active',
  ARRAY['manual:keep', 'source:maiprop-os-v2', 'source:maiprop-os', 'os_auction:valid-id']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;
SELECT is(
  private.quarantine_invalid_os_auction_identity(), 1,
  'non-auction source subtype is quarantined'
);

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000012', NULL,
  'Missing identity fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active',
  ARRAY['manual:keep', 'source:maiprop-os-v2', 'source:maiprop-os', 'osXauction:near-miss']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;
SELECT is(
  private.quarantine_invalid_os_auction_identity(), 1,
  'missing identity subtype is quarantined'
);

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000013', NULL,
  'Multiple identity fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active',
  ARRAY['manual:keep', 'source:maiprop-os-v2', 'source:maiprop-os', 'os_auction:first', 'os_auction:second']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;
SELECT is(
  private.quarantine_invalid_os_auction_identity(), 1,
  'multiple identity subtype is quarantined'
);

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000014', NULL,
  'Placeholder identity fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active',
  ARRAY['manual:keep', 'source:maiprop-os-v2', 'source:maiprop-os', 'os_auction:unknown']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;
SELECT is(
  private.quarantine_invalid_os_auction_identity(), 1,
  'placeholder identity subtype is quarantined'
);

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000015', NULL,
  'Malformed identity fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active',
  ARRAY['manual:keep', 'source:maiprop-os-v2', 'source:maiprop-os', 'os_auction:bad value']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;
SELECT is(
  private.quarantine_invalid_os_auction_identity(), 1,
  'malformed identity subtype is quarantined'
);

SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id::text LIKE '74000000-0000-4000-8000-00000000001_'),
  5::bigint,
  'quarantine does not delete any candidate listing'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id::text LIKE '74000000-0000-4000-8000-00000000001_'
     AND status = 'paused'::public.listing_status),
  5::bigint,
  'every active candidate becomes paused'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id::text LIKE '74000000-0000-4000-8000-00000000001_'
     AND tags @> ARRAY['source:maiprop-os']::text[]),
  0::bigint,
  'no live candidate retains the exact OS source tag'
);
SELECT is(
  (SELECT count(*) FROM public.listings AS listing
   WHERE listing.id::text LIKE '74000000-0000-4000-8000-00000000001_'
     AND EXISTS (
       SELECT 1 FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
       WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
     )),
  0::bigint,
  'no live OS consumer can see a quarantined identity tag'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id::text LIKE '74000000-0000-4000-8000-00000000001_'
     AND array_length(
       array_positions(tags, 'source:maiprop-os-invalid-identity-quarantine'),
       1
     ) = 1),
  5::bigint,
  'every live candidate has exactly one distinct quarantine marker'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id::text LIKE '74000000-0000-4000-8000-00000000001_'
     AND tags @> ARRAY['manual:keep', 'source:maiprop-os-v2']::text[]),
  5::bigint,
  'unrelated and similarly named source tags remain unchanged'
);
SELECT ok(
  (SELECT tags @> ARRAY['osXauction:near-miss']::text[] FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000012'),
  'literal-prefix quarantine preserves a near-miss non-provider tag'
);
SELECT ok(
  (SELECT previous_tags @> ARRAY['osXauction:near-miss']::text[]
   FROM private.os_auction_invalid_identity_quarantine
   WHERE listing_id = '74000000-0000-4000-8000-000000000012'),
  'private snapshot preserves the source near-miss tag exactly'
);
SELECT is(
  (SELECT reason FROM private.os_auction_invalid_identity_quarantine
   WHERE listing_id = '74000000-0000-4000-8000-000000000012'),
  'missing_identity',
  'source near-miss is diagnosed as missing exact provider identity'
);
SELECT is(
  (SELECT count(*) FROM private.os_auction_invalid_identity_quarantine
   WHERE listing_id::text LIKE '74000000-0000-4000-8000-00000000001_'),
  5::bigint,
  'every candidate has one recoverable private snapshot'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM private.os_auction_invalid_identity_quarantine AS quarantine
    WHERE quarantine.listing_id::text LIKE '74000000-0000-4000-8000-00000000001_'
      AND (quarantine.previous_status <> 'active'::public.listing_status
      OR NOT quarantine.previous_tags @> ARRAY['source:maiprop-os']::text[]
      )
  ),
  'private snapshots retain complete original active status and source tags'
);
SELECT set_eq(
  $$SELECT reason FROM private.os_auction_invalid_identity_quarantine
    WHERE listing_id::text LIKE '74000000-0000-4000-8000-00000000001_'$$,
  $$VALUES
    ('non_auction'::text),
    ('missing_identity'::text),
    ('multiple_identities'::text),
    ('placeholder_identity'::text),
    ('malformed_identity'::text)$$,
  'all five invalid identity subtype reasons are recorded'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id::text LIKE '74000000-0000-4000-8000-00000000001_'
     AND os_auction_id IS NOT NULL),
  0::bigint,
  'quarantine does not synthesize a provider identity'
);
SELECT is(
  private.quarantine_invalid_os_auction_identity(), 0,
  'rerunning the quarantine routine after source removal is a no-op'
);
SELECT is(
  (SELECT count(*) FROM private.os_auction_invalid_identity_quarantine
   WHERE listing_id::text LIKE '74000000-0000-4000-8000-00000000001_'),
  5::bigint,
  'idempotent rerun leaves the recovery ledger unchanged'
);
SELECT throws_ok(
  $$DELETE FROM public.listings
    WHERE id = '74000000-0000-4000-8000-000000000011'$$,
  '23503',
  NULL,
  'RESTRICT ledger foreign key prevents accidental listing deletion'
);

SET LOCAL session_replication_role = replica;
INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES (
  '74000000-0000-4000-8000-000000000020',
  '74000000-0000-4000-8000-000000000099',
  'Owned manual near-miss fixture', 'Athens', 1, 1, 'apartment',
  'auction', 'active', ARRAY['manual:keep', 'osXauction:valid']::text[],
  statement_timestamp(), statement_timestamp()
);
SET LOCAL session_replication_role = origin;
SELECT is(
  private.extract_os_auction_id(ARRAY['osXauction:valid']::text[]),
  NULL,
  'near-miss tag is not a provider identity'
);
SELECT is(
  (SELECT os_auction_id FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000020'),
  NULL,
  'owned manual near-miss row has a NULL stored provider identity'
);
SELECT ok(
  (SELECT tags @> ARRAY['osXauction:valid']::text[] FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000020'),
  'owned manual near-miss row and tag remain untouched'
);

ALTER TABLE public.listings
  ADD CONSTRAINT listings_os_auction_source_identity_valid
  CHECK (
    NOT COALESCE(tags, '{}'::text[]) @> ARRAY['source:maiprop-os']::text[]
    OR COALESCE(tags, '{}'::text[]) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
    OR (
      listing_type = 'auction'::public.listing_type
      AND private.extract_os_auction_id(tags) IS NOT NULL
    )
  );

INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES
  ('74000000-0000-4000-8000-000000000030', NULL, 'Exact canonical guard', 'Athens', 1, 1, 'apartment', 'auction', 'paused', ARRAY['os_auction:guard-one']::text[], statement_timestamp(), statement_timestamp()),
  ('74000000-0000-4000-8000-000000000031', NULL, 'Near loser guard', 'Athens', 1, 1, 'apartment', 'auction', 'paused', ARRAY['manual:keep']::text[], statement_timestamp(), statement_timestamp()),
  ('74000000-0000-4000-8000-000000000032', NULL, 'Near canonical guard', 'Athens', 1, 1, 'apartment', 'auction', 'paused', ARRAY['osXauction:guard-two']::text[], statement_timestamp(), statement_timestamp()),
  ('74000000-0000-4000-8000-000000000033', NULL, 'Exact loser guard', 'Athens', 1, 1, 'apartment', 'auction', 'paused', ARRAY['manual:keep']::text[], statement_timestamp(), statement_timestamp());

INSERT INTO private.os_auction_duplicate_quarantine (
  duplicate_listing_id, canonical_listing_id, provider_id,
  previous_status, previous_tags
) VALUES (
  '74000000-0000-4000-8000-000000000031',
  '74000000-0000-4000-8000-000000000030',
  'guard-one', 'active', ARRAY['osXauction:guard-one']::text[]
);
SELECT throws_ok(
  $$SELECT private.repair_exact_os_auction_identity_prefix()$$,
  '23514',
  'os_auction_exact_prefix_historical_duplicate_requires_manual_recovery',
  'corrective migration rejects historical near-prefix evidence on the duplicate loser'
);
DELETE FROM private.os_auction_duplicate_quarantine
WHERE duplicate_listing_id = '74000000-0000-4000-8000-000000000031';

INSERT INTO private.os_auction_duplicate_quarantine (
  duplicate_listing_id, canonical_listing_id, provider_id,
  previous_status, previous_tags
) VALUES (
  '74000000-0000-4000-8000-000000000033',
  '74000000-0000-4000-8000-000000000032',
  'guard-two', 'active', ARRAY['os_auction:guard-two']::text[]
);
SELECT throws_ok(
  $$SELECT private.repair_exact_os_auction_identity_prefix()$$,
  '23514',
  'os_auction_exact_prefix_historical_duplicate_requires_manual_recovery',
  'corrective migration rejects historical near-prefix evidence on the canonical winner'
);
DELETE FROM private.os_auction_duplicate_quarantine
WHERE duplicate_listing_id = '74000000-0000-4000-8000-000000000033';
DELETE FROM public.listings
WHERE id IN (
  '74000000-0000-4000-8000-000000000030',
  '74000000-0000-4000-8000-000000000031',
  '74000000-0000-4000-8000-000000000032',
  '74000000-0000-4000-8000-000000000033'
);

CREATE TEMP TABLE exact_os_extractor_definition ON COMMIT DROP AS
SELECT pg_get_functiondef('private.extract_os_auction_id(text[])'::regprocedure) AS sql;

CREATE OR REPLACE FUNCTION private.extract_os_auction_id(p_tags text[])
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  WITH identities AS (
    SELECT lower(btrim(substr(tag.value, length('os_auction:') + 1))) AS value
    FROM unnest(COALESCE(p_tags, '{}'::text[])) AS tag(value)
    WHERE tag.value LIKE 'os_auction:%'
  )
  SELECT CASE WHEN count(*) = 1
    AND min(value) ~ '^[a-z0-9:_-]{1,120}$'
    AND min(value) NOT IN ('unknown', 'null', 'undefined', 'none', 'na', 'n/a')
    THEN min(value) ELSE NULL END
  FROM identities
$$;

INSERT INTO public.listings (
  id, owner_id, title, city, price, sqm, property_type,
  listing_type, status, tags, created_at, updated_at
) VALUES
  (
    '74000000-0000-4000-8000-000000000021', NULL,
    'Stored near-miss convergence fixture', 'Athens', 1, 1, 'apartment',
    'auction', 'paused', ARRAY['manual:keep', 'osXauction:transfer-id']::text[],
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    '74000000-0000-4000-8000-000000000022', NULL,
    'Stored exact plus near-miss convergence fixture', 'Athens', 1, 1, 'apartment',
    'auction', 'paused', ARRAY['manual:keep', 'os_auction:transfer-id', 'osXauction:near']::text[],
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  );

DO $$
BEGIN
  EXECUTE (SELECT sql FROM exact_os_extractor_definition);
END;
$$;

SELECT is(
  private.repair_exact_os_auction_identity_prefix(),
  2,
  'corrective routine recomputes both bounded stale generated identities'
);
SELECT is(
  (SELECT os_auction_id FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000021'),
  NULL,
  'near-miss-only stale generated identity converges to NULL'
);
SELECT is(
  (SELECT os_auction_id FROM public.listings
   WHERE id = '74000000-0000-4000-8000-000000000022'),
  'transfer-id',
  'exact plus near-miss identity acquires the key released by the near-miss-only row'
);
SELECT is(
  (SELECT count(*) FROM public.listings
   WHERE id IN (
     '74000000-0000-4000-8000-000000000021',
     '74000000-0000-4000-8000-000000000022'
   )
     AND updated_at = '2026-01-01T00:00:00Z'::timestamptz
     AND tags @> ARRAY['manual:keep']::text[]),
  2::bigint,
  'trigger-suppressed convergence preserves updated_at and original tags'
);

SELECT * FROM finish();
ROLLBACK;
