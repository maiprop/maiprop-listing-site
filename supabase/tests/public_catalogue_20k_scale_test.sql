CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

BEGIN;

SELECT plan(15);

DELETE FROM private.public_catalogue_current;
DELETE FROM private.public_catalogue_versions;
DELETE FROM private.public_catalogue_publications;

SET LOCAL session_replication_role = replica;

-- Local reset fixtures are created during the current minute. Move them behind
-- the publisher's minute boundary so they cannot enter only the second snapshot.
UPDATE public.listings
SET created_at = date_trunc('minute', now()) - interval '1 minute';

INSERT INTO auth.users (id)
VALUES ('73000000-0000-4000-8000-999999999999');

INSERT INTO public.profiles (
  user_id,
  role,
  is_platform_admin
)
VALUES (
  '73000000-0000-4000-8000-999999999999',
  'seller',
  false
);

INSERT INTO public.listings (
  id,
  owner_id,
  title,
  city,
  price,
  sqm,
  property_type,
  listing_type,
  status,
  tags,
  has_parking,
  views_count,
  created_at,
  updated_at
)
SELECT
  (
    '73000000-0000-4000-8000-'
    || lpad(scale.id::text, 12, '0')
  )::uuid,
  '73000000-0000-4000-8000-999999999999'::uuid,
  'Scale listing ' || scale.id,
  CASE
    WHEN scale.id % 4 = 0 THEN 'Thessaloniki'
    ELSE 'Athens'
  END,
  100000 + scale.id,
  40 + (scale.id % 180),
  (
    CASE
      WHEN scale.id % 5 = 0 THEN 'house'
      ELSE 'apartment'
    END
  )::public.property_type,
  (
    CASE
      WHEN scale.id = 20000 THEN 'auction'
      WHEN scale.id % 7 = 0 THEN 'rent'
      ELSE 'sale'
    END
  )::public.listing_type,
  'active'::public.listing_status,
  CASE
    WHEN scale.id = 20000
      THEN ARRAY['os_auction:scale-os-20000']::text[]
    ELSE '{}'::text[]
  END,
  scale.id % 3 = 0,
  scale.id,
  date_trunc('minute', now()) - interval '1 minute',
  date_trunc('minute', now()) - interval '1 minute'
FROM generate_series(1, 20000) AS scale(id);

SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
SELECT performs_ok(
  $$SELECT count(*) FROM public.publish_public_catalogue()$$,
  30000,
  'the real publisher materializes twenty thousand source listings within thirty seconds'
);
RESET ROLE;

ANALYZE private.public_catalogue_versions;

SELECT is(
  (
    SELECT count(*)
    FROM private.public_catalogue_versions
    WHERE title LIKE 'Scale listing %'
  ),
  20000::bigint,
  'the materializer publishes twenty thousand temporal catalogue rows'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.query_public_catalogue(
      p_listing_type => 'sale',
      p_property_type => 'apartment',
      p_location_groups => '[["athens", "athina"]]'::jsonb,
      p_features => ARRAY['has_parking'],
      p_sort => 'newest',
      p_limit => 28
    )
  ),
  28::bigint,
  'a selective first page remains complete at twenty thousand rows'
);

SELECT ok(
  (
    SELECT bool_and(card_payload ->> 'city' = 'Athens')
    FROM public.query_public_catalogue(
      p_listing_type => 'sale',
      p_property_type => 'apartment',
      p_location_groups => '[["athens", "athina"]]'::jsonb,
      p_features => ARRAY['has_parking'],
      p_sort => 'newest',
      p_limit => 28
    )
  ),
  'grouped location aliases are applied before pagination'
);

SELECT ok(
  (
    SELECT count(DISTINCT listing_id) = count(*)
    FROM public.query_public_catalogue(
      p_listing_type => 'sale',
      p_sort => 'newest',
      p_limit => 201
    )
  ),
  'a sentinel-sized page contains no duplicate listings'
);

SELECT is(
  (
    SELECT count(*)
    FROM public.query_public_catalogue(
      p_listing_type => 'sale',
      p_sort => 'newest',
      p_limit => 28,
      p_offset => 10000
    )
  ),
  28::bigint,
  'the bounded compatibility offset remains complete at depth'
);

SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_listing(
      NULL,
      NULL,
      'scale-os-20000'
    )
  ),
  '73000000-0000-4000-8000-000000020000',
  'the exact OS-tag reader resolves a materialized auction at scale'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_auctions(
      NULL,
      NULL,
      'scale-os-20000'
    )
  ),
  '73000000-0000-4000-8000-000000020000',
  'the indexed auction reader resolves an exact row beyond the 600-row stream window'
);

SELECT performs_ok(
  $$
    SELECT count(*)
    FROM public.get_public_catalogue_auctions(
      NULL,
      NULL,
      'scale-os-20000'
    )
  $$,
  1000,
  'the indexed exact auction lookup completes within one second at twenty thousand rows'
);

SELECT performs_ok(
  $$
    SELECT count(*)
    FROM public.query_public_catalogue(
      p_listing_type => 'sale',
      p_property_type => 'apartment',
      p_location_groups => '[["athens", "athina"]]'::jsonb,
      p_features => ARRAY['has_parking'],
      p_sort => 'newest',
      p_limit => 28
    )
  $$,
  1000,
  'a selective twenty-thousand-row query completes within one second'
);

-- Create another logical minute without waiting for wall-clock time.
UPDATE private.public_catalogue_publications
SET
  snapshot_minute = snapshot_minute - interval '1 minute',
  retain_until = retain_until - interval '1 minute'
WHERE publication_id = (
  SELECT publication_id
  FROM private.public_catalogue_current
);

UPDATE public.listings
SET price = 999999
WHERE id = '73000000-0000-4000-8000-000000000001';

SET LOCAL ROLE service_role;
SELECT performs_ok(
  $$SELECT count(*) FROM public.publish_public_catalogue()$$,
  30000,
  'the real publisher materializes a one-row delta within thirty seconds'
);
RESET ROLE;

SELECT is(
  (
    SELECT changed_count
    FROM private.public_catalogue_publications
    ORDER BY publication_id DESC
    LIMIT 1
  ),
  1,
  'the second publication records exactly one changed source listing'
);

SELECT is(
  (
    SELECT count(*)
    FROM private.public_catalogue_versions
    WHERE title LIKE 'Scale listing %'
  ),
  20001::bigint,
  'the delta publication stores one new version instead of copying twenty thousand rows'
);

SELECT is(
  (
    SELECT (detail_payload ->> 'price')::numeric
    FROM public.get_public_catalogue_listing(
      (
        SELECT min(publication_id)
        FROM private.public_catalogue_publications
      ),
      '73000000-0000-4000-8000-000000000001',
      NULL
    )
  ),
  100001::numeric,
  'the retained publication preserves the original exact-detail price'
);

SELECT is(
  (
    SELECT (detail_payload ->> 'price')::numeric
    FROM public.get_public_catalogue_listing(
      (
        SELECT max(publication_id)
        FROM private.public_catalogue_publications
      ),
      '73000000-0000-4000-8000-000000000001',
      NULL
    )
  ),
  999999::numeric,
  'the current publication exposes the changed exact-detail price'
);

SELECT * FROM finish();

ROLLBACK;
