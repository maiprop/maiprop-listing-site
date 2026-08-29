BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(90);

SELECT ok(
  to_regclass('private.public_catalogue_publications') IS NOT NULL,
  'private catalogue publications exist'
);
SELECT ok(
  to_regclass('private.public_catalogue_current') IS NOT NULL,
  'private current-publication pointer exists'
);
SELECT ok(
  to_regclass('private.public_catalogue_versions') IS NOT NULL,
  'private temporal catalogue versions exist'
);
SELECT ok(
  to_regclass('private.public_catalogue_snapshot_batches') IS NULL,
  'obsolete full-copy snapshot batches do not exist'
);
SELECT ok(
  to_regclass('private.public_catalogue_snapshot_rows') IS NULL,
  'obsolete full-copy snapshot rows do not exist'
);

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid =
    'private.public_catalogue_publications'::regclass),
  'publication metadata has RLS defense in depth'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid =
    'private.public_catalogue_current'::regclass),
  'current pointer has RLS defense in depth'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid =
    'private.public_catalogue_versions'::regclass),
  'temporal versions have RLS defense in depth'
);

SELECT ok(
  NOT has_table_privilege(
    'anon',
    'private.public_catalogue_publications',
    'SELECT'
  ),
  'anon cannot read publication metadata directly'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'private.public_catalogue_publications',
    'SELECT'
  ),
  'authenticated cannot read publication metadata directly'
);
SELECT ok(
  NOT has_table_privilege(
    'anon',
    'private.public_catalogue_current',
    'SELECT'
  ),
  'anon cannot read the current pointer directly'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'private.public_catalogue_current',
    'SELECT'
  ),
  'authenticated cannot read the current pointer directly'
);
SELECT ok(
  NOT has_table_privilege(
    'anon',
    'private.public_catalogue_versions',
    'SELECT'
  ),
  'anon cannot read temporal versions directly'
);
SELECT ok(
  NOT has_table_privilege(
    'authenticated',
    'private.public_catalogue_versions',
    'SELECT'
  ),
  'authenticated cannot read temporal versions directly'
);

SELECT ok(
  has_function_privilege(
    'anon',
    'public.get_public_catalogue_publication(bigint)',
    'EXECUTE'
  ),
  'anon can execute publication metadata reader'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_public_catalogue_publication(bigint)',
    'EXECUTE'
  ),
  'authenticated can execute publication metadata reader'
);
SELECT ok(
  has_function_privilege(
    'anon',
    'public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamp with time zone,numeric,uuid,boolean,integer,integer,jsonb)',
    'EXECUTE'
  ),
  'anon can execute the typed catalogue reader'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamp with time zone,numeric,uuid,boolean,integer,integer,jsonb)',
    'EXECUTE'
  ),
  'authenticated can execute the typed catalogue reader'
);
SELECT ok(
  has_function_privilege(
    'anon',
    'public.get_public_catalogue_listing(bigint,uuid,text)',
    'EXECUTE'
  ),
  'anon can execute the publication-pinned detail reader'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_public_catalogue_listing(bigint,uuid,text)',
    'EXECUTE'
  ),
  'authenticated can execute the publication-pinned detail reader'
);
SELECT ok(
  has_function_privilege(
    'anon',
    'public.get_public_catalogue_auctions(bigint,uuid[],text)',
    'EXECUTE'
  ),
  'anon can execute the indexed exact auction reader'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_public_catalogue_auctions(bigint,uuid[],text)',
    'EXECUTE'
  ),
  'authenticated can execute the indexed exact auction reader'
);
SELECT ok(
  has_function_privilege(
    'anon',
    'public.get_public_catalogue_homepage(bigint)',
    'EXECUTE'
  ),
  'anon can execute the homepage publication reader'
);
SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_public_catalogue_homepage(bigint)',
    'EXECUTE'
  ),
  'authenticated can execute the homepage publication reader'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.publish_public_catalogue()',
    'EXECUTE'
  ),
  'anon has no publisher privilege'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.publish_public_catalogue()',
    'EXECUTE'
  ),
  'authenticated has no publisher privilege'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.publish_public_catalogue()',
    'EXECUTE'
  ),
  'service role has publisher privilege'
);

SELECT is(
  (
    SELECT provolatile::text
    FROM pg_proc
    WHERE oid = 'public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamp with time zone,numeric,uuid,boolean,integer,integer,jsonb)'::regprocedure
  ),
  's',
  'typed public catalogue reader is stable and read-only'
);
SELECT is(
  (
    SELECT provolatile::text
    FROM pg_proc
    WHERE oid =
      'public.get_public_catalogue_auctions(bigint,uuid[],text)'::regprocedure
  ),
  's',
  'exact public auction reader is stable and read-only'
);
SELECT is(
  (
    SELECT provolatile::text
    FROM pg_proc
    WHERE oid = 'public.publish_public_catalogue()'::regprocedure
  ),
  'v',
  'service-only catalogue publisher is volatile'
);

SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_current_listing')
    IS NOT NULL,
  'one current version per listing is enforced'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_newest') IS NOT NULL,
  'newest keyset index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_price_asc') IS NOT NULL,
  'ascending-price keyset index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_price_desc') IS NOT NULL,
  'descending-price keyset index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_ai_score') IS NOT NULL,
  'AI-score keyset index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_views') IS NOT NULL,
  'views keyset index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_open_house') IS NOT NULL,
  'Open House keyset index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_location') IS NOT NULL,
  'location trigram index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_features') IS NOT NULL,
  'feature containment index exists'
);
SELECT has_column(
  'private',
  'public_catalogue_versions',
  'os_tag',
  'temporal versions store the canonical OS auction identity'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_os_tag_publication')
    IS NOT NULL,
  'publication-pinned OS-tag lookup index exists'
);
SELECT ok(
  to_regclass('private.idx_public_catalogue_versions_current_os_tag')
    IS NOT NULL,
  'one current temporal version per OS tag is enforced'
);
SELECT ok(
  to_regclass(
    'private.idx_public_catalogue_versions_auction_listing_publication'
  ) IS NOT NULL,
  'publication-pinned auction ID lookup index exists'
);

DELETE FROM private.public_catalogue_current;
DELETE FROM private.public_catalogue_versions;
DELETE FROM private.public_catalogue_publications;

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('71000000-0000-4000-8000-000000000001'),
  ('71000000-0000-4000-8000-000000000002');

INSERT INTO public.profiles (
  user_id,
  role,
  is_platform_admin
)
VALUES
  ('71000000-0000-4000-8000-000000000001', 'seller', false),
  ('71000000-0000-4000-8000-000000000002', 'admin', true);

INSERT INTO public.projects (
  id,
  owner_id,
  name,
  city,
  status
)
VALUES (
  '73000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001',
  'Athens compatibility project',
  'Athens',
  'active'
);

INSERT INTO public.listings (
  id,
  owner_id,
  project_id,
  title,
  city,
  price,
  sqm,
  property_type,
  listing_type,
  status,
  tags,
  created_at,
  updated_at
)
VALUES
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    'Temporal catalogue changed fixture',
    'Athens',
    123456,
    82,
    'apartment',
    'new_build',
    'active',
    '{}'::text[],
    date_trunc('minute', now()) - interval '1 minute',
    date_trunc('minute', now()) - interval '1 minute'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    NULL,
    'Temporal catalogue unchanged fixture',
    'Athens',
    234567,
    91,
    'apartment',
    'sale',
    'active',
    '{}'::text[],
    date_trunc('minute', now()) - interval '1 minute',
    date_trunc('minute', now()) - interval '1 minute'
  ),
  (
    '72000000-0000-4000-8000-000000000003',
    '71000000-0000-4000-8000-000000000001',
    NULL,
    'Supervisor-991 fixture must stay private',
    'Athens',
    654321,
    99,
    'apartment',
    'sale',
    'active',
    '{}'::text[],
    date_trunc('minute', now()) - interval '1 minute',
    date_trunc('minute', now()) - interval '1 minute'
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    NULL,
    'Spotlight auction excluded from Featured Properties',
    'Athens',
    345678,
    75,
    'apartment',
    'auction',
    'active',
    ARRAY['os_auction:catalogue-old-tag']::text[],
    date_trunc('minute', now()) - interval '1 minute',
    date_trunc('minute', now()) - interval '1 minute'
  );

INSERT INTO public.listing_images (
  listing_id,
  url,
  sort_order
)
VALUES
  (
    '72000000-0000-4000-8000-000000000001',
    'https://fixtures.invalid/catalogue-athens-1.jpg',
    1
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    'https://fixtures.invalid/catalogue-athens-2.jpg',
    2
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    'https://fixtures.invalid/catalogue-athens-3.jpg',
    3
  ),
  (
    '72000000-0000-4000-8000-000000000001',
    'https://fixtures.invalid/catalogue-athens-4.jpg',
    4
  );

INSERT INTO public.listing_promotion_allocations (
  listing_id,
  owner_id,
  promotion_type,
  source_type,
  request_key,
  starts_at,
  ends_at
)
VALUES
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'spotlight',
    'admin',
    'catalogue-sale-spotlight',
    date_trunc('minute', now()) - interval '1 minute',
    date_trunc('minute', now()) + interval '30 days'
  ),
  (
    '72000000-0000-4000-8000-000000000004',
    '71000000-0000-4000-8000-000000000001',
    'spotlight',
    'admin',
    'catalogue-auction-spotlight',
    date_trunc('minute', now()) - interval '1 minute',
    date_trunc('minute', now()) + interval '30 days'
  );

SET LOCAL session_replication_role = origin;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.publish_public_catalogue()$$,
  '42501',
  'permission denied for function publish_public_catalogue',
  'anon is actually denied when invoking the publisher'
);
SET LOCAL ROLE postgres;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.publish_public_catalogue()$$,
  '42501',
  'permission denied for function publish_public_catalogue',
  'authenticated is actually denied when invoking the publisher'
);
SET LOCAL ROLE postgres;

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT * FROM public.publish_public_catalogue()$$,
  'service role can actually publish the current catalogue'
);
SET LOCAL ROLE postgres;

SELECT is(
  (SELECT count(*)::integer FROM private.public_catalogue_current),
  1,
  'publisher sets exactly one current pointer'
);
SELECT is(
  (
    SELECT retain_until - snapshot_minute
    FROM private.public_catalogue_publications
    WHERE publication_id = (
      SELECT publication_id FROM private.public_catalogue_current
    )
  ),
  interval '40 minutes',
  'publication retention is exactly forty minutes'
);

SET LOCAL ROLE anon;
SELECT lives_ok(
  $$SELECT * FROM public.get_public_catalogue_publication(NULL)$$,
  'anon can actually resolve current publication metadata'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_limit => 200
    )
    WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  ),
  1,
  'anon can actually read the changed fixture through the typed reader'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_limit => 200
    )
    WHERE listing_id = '72000000-0000-4000-8000-000000000002'
  ),
  1,
  'anon can actually read the unchanged fixture through the typed reader'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_limit => 200
    )
    WHERE listing_id = '72000000-0000-4000-8000-000000000003'
  ),
  0,
  'typed publisher excludes synthetic supervisor fixtures'
);
SELECT lives_ok(
  $$SELECT * FROM public.get_public_catalogue_homepage(NULL)$$,
  'anon can actually read the publication-pinned homepage bundle'
);
SELECT is(
  (
    SELECT homepage.retain_until
    FROM public.get_public_catalogue_homepage(NULL) AS homepage
  ),
  (
    SELECT publication.retain_until
    FROM public.get_public_catalogue_publication(NULL) AS publication
  ),
  'homepage reader propagates the publication retention deadline'
);
SELECT ok(
  (
    SELECT
      payload -> 'featured' @>
        '[{"id":"72000000-0000-4000-8000-000000000001"}]'::jsonb
      AND NOT (
        payload -> 'featured' @>
          '[{"id":"72000000-0000-4000-8000-000000000004"}]'::jsonb
      )
    FROM public.get_public_catalogue_homepage(NULL)
  ),
  'Featured Properties includes spotlight non-auction inventory and excludes spotlight auctions'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_listing(
      NULL,
      NULL,
      'catalogue-old-tag'
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'exact OS-tag detail reads resolve the matching auction in the current publication'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_auctions(
      NULL,
      NULL,
      'catalogue-old-tag'
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'indexed exact auction reads resolve the current OS tag'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_auctions(
      NULL,
      ARRAY['72000000-0000-4000-8000-000000000004'::uuid],
      NULL
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'indexed exact auction reads resolve current listing IDs'
);
SELECT ok(
  (
    SELECT ai_score IS NULL AND open_house_date IS NULL
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_listing_type => 'new_build',
      p_limit => 200
    )
    WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  ),
  'nullable catalogue RPC fields remain null across the public boundary'
);
SELECT lives_ok(
  $$SELECT * FROM public.get_public_listing_catalogue(NULL) LIMIT 1$$,
  'anon can use the read-only one-release compatibility reader'
);
SELECT is(
  (
    SELECT is_off_market
    FROM public.get_public_listing_catalogue(NULL)
    WHERE id = '72000000-0000-4000-8000-000000000001'
  ),
  false,
  'anon legacy compatibility rows preserve false is_off_market for the Athens fixture'
);
SELECT ok(
  (
    SELECT location_search_text IS NOT NULL
      AND location_search_text ~* 'athens'
    FROM public.get_public_listing_catalogue(NULL)
    WHERE id = '72000000-0000-4000-8000-000000000001'
  ),
  'anon legacy compatibility rows preserve Athens location search text'
);
SELECT throws_ok(
  $$
    SELECT *
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_limit => NULL
    )
  $$,
  '22023',
  'public_catalogue_invalid_limit',
  'anon cannot bypass the catalogue response cap with a null limit'
);
SET LOCAL ROLE postgres;

SELECT is(
  (
    SELECT legacy.project::text
    FROM public.get_public_listing_catalogue(NULL) AS legacy
    WHERE legacy.id = '72000000-0000-4000-8000-000000000001'
  ),
  (
    SELECT source.project::text
    FROM public.public_listing_catalogue AS source
    WHERE source.id = '72000000-0000-4000-8000-000000000001'
  ),
  'legacy compatibility rows preserve the source card project'
);
SELECT is(
  (
    SELECT legacy.listing_images
    FROM public.get_public_listing_catalogue(NULL) AS legacy
    WHERE legacy.id = '72000000-0000-4000-8000-000000000001'
  ),
  jsonb_build_array(
    jsonb_build_object(
      'url', 'https://fixtures.invalid/catalogue-athens-1.jpg',
      'sort_order', 1
    ),
    jsonb_build_object(
      'url', 'https://fixtures.invalid/catalogue-athens-2.jpg',
      'sort_order', 2
    ),
    jsonb_build_object(
      'url', 'https://fixtures.invalid/catalogue-athens-3.jpg',
      'sort_order', 3
    )
  ),
  'legacy compatibility rows retain the ordered three-image card payload'
);
SELECT is(
  (
    SELECT legacy.project_detail::text
    FROM public.get_public_listing_catalogue(NULL) AS legacy
    WHERE legacy.id = '72000000-0000-4000-8000-000000000001'
  ),
  (
    SELECT source.project_detail::text
    FROM public.public_listing_catalogue AS source
    WHERE source.id = '72000000-0000-4000-8000-000000000001'
  ),
  'legacy compatibility rows preserve the source detail project'
);
SELECT is(
  (
    SELECT legacy.listing_images_detail::text
    FROM public.get_public_listing_catalogue(NULL) AS legacy
    WHERE legacy.id = '72000000-0000-4000-8000-000000000001'
  ),
  (
    SELECT source.listing_images_detail::text
    FROM public.public_listing_catalogue AS source
    WHERE source.id = '72000000-0000-4000-8000-000000000001'
  ),
  'legacy compatibility rows preserve the source detail listing images'
);

SET LOCAL ROLE authenticated;
SELECT lives_ok(
  $$
    SELECT *
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_limit => 1
    )
  $$,
  'authenticated can actually execute the typed catalogue reader'
);
SET LOCAL ROLE postgres;

SELECT lives_ok(
  $$
    SELECT *
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_listing_type => 'sale,new_build',
      p_limit => 1
    )
  $$,
  'catalogue reader accepts the sale and new-build product family'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_listing_type => 'sale,new_build',
      p_limit => 1,
      p_offset => 1
    )
  ),
  1,
  'bounded legacy offsets remain available without changing cursor traffic'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_location_groups => '[["athens"], ["changed", "unchanged"]]'::jsonb,
      p_limit => 200
    )
  ),
  2,
  'bounded locality groups require every word group and allow aliases within each group'
);
SELECT throws_ok(
  $$
    SELECT *
    FROM public.query_public_catalogue(
      p_publication_id => NULL,
      p_location_groups => '{"athens": true}'::jsonb,
      p_limit => 1
    )
  $$,
  '22023',
  'public_catalogue_invalid_location_groups',
  'catalogue reader rejects unbounded or malformed locality groups'
);

-- Move the first publication one minute into the retained past so this
-- transaction can prove delta behavior without waiting for wall-clock time.
UPDATE private.public_catalogue_publications
SET
  snapshot_minute = snapshot_minute - interval '1 minute',
  retain_until = retain_until - interval '1 minute'
WHERE publication_id = (
  SELECT publication_id
  FROM private.public_catalogue_current
);

SET LOCAL session_replication_role = replica;
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
  created_at,
  updated_at
)
VALUES (
  '72000000-0000-4000-8000-000000000005',
  '71000000-0000-4000-8000-000000000001',
  'Duplicate OS tag must block publication',
  'Athens',
  456789,
  88,
  'apartment',
  'auction',
  'active',
  ARRAY['os_auction:catalogue-old-tag']::text[],
  date_trunc('minute', now()) - interval '1 minute',
  date_trunc('minute', now()) - interval '1 minute'
);
SET LOCAL session_replication_role = origin;

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$SELECT * FROM public.publish_public_catalogue()$$,
  '23505',
  'public_catalogue_duplicate_os_tag',
  'the publisher rejects duplicate OS tags within one publication'
);
SET LOCAL ROLE postgres;

SET LOCAL session_replication_role = replica;
DELETE FROM public.listings
WHERE id = '72000000-0000-4000-8000-000000000005';
SET LOCAL session_replication_role = origin;

UPDATE public.listings
SET price = 654321
WHERE id = '72000000-0000-4000-8000-000000000001';

UPDATE public.listings
SET tags = ARRAY['os_auction:catalogue-new-tag']::text[]
WHERE id = '72000000-0000-4000-8000-000000000004';

SET LOCAL ROLE service_role;
SELECT lives_ok(
  $$SELECT * FROM public.publish_public_catalogue()$$,
  'a later service publication writes the changed delta'
);
SET LOCAL ROLE postgres;

SELECT is(
  (
    SELECT changed_count
    FROM private.public_catalogue_publications
    ORDER BY publication_id DESC
    LIMIT 1
  ),
  2,
  'the later publication records the changed listing and changed OS tag'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM private.public_catalogue_versions
    WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  ),
  2,
  'the changed listing has two immutable versions'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM private.public_catalogue_versions
    WHERE listing_id = '72000000-0000-4000-8000-000000000002'
  ),
  1,
  'the unchanged listing is not copied into the later publication'
);
SELECT is(
  (
    SELECT (card_payload ->> 'price')::numeric
    FROM public.query_public_catalogue(
      p_publication_id => (
        SELECT min(publication_id)
        FROM private.public_catalogue_publications
      ),
      p_limit => 200
    )
    WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  ),
  123456::numeric,
  'the retained publication preserves the original price'
);
SELECT is(
  (
    SELECT (card_payload ->> 'price')::numeric
    FROM public.query_public_catalogue(
      p_publication_id => (
        SELECT max(publication_id)
        FROM private.public_catalogue_publications
      ),
      p_limit => 200
    )
    WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  ),
  654321::numeric,
  'the latest publication exposes the new price'
);
SELECT is(
  (
    SELECT (detail_payload ->> 'price')::numeric
    FROM public.get_public_catalogue_listing(
      (
        SELECT min(publication_id)
        FROM private.public_catalogue_publications
      ),
      '72000000-0000-4000-8000-000000000001',
      NULL
    )
  ),
  123456::numeric,
  'the publication-pinned detail reader preserves the original detail price'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_listing(
      (
        SELECT min(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-old-tag'
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'a retained publication preserves its original OS-tag identity'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_auctions(
      (
        SELECT min(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-old-tag'
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'indexed auction reader preserves a retained publication OS tag'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.get_public_catalogue_listing(
      (
        SELECT max(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-old-tag'
    )
  ),
  0,
  'the latest publication does not resolve a superseded OS tag'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM public.get_public_catalogue_auctions(
      (
        SELECT max(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-old-tag'
    )
  ),
  0,
  'indexed auction reader does not resolve a superseded OS tag'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_listing(
      (
        SELECT max(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-new-tag'
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'the latest publication resolves the replacement OS tag'
);
SELECT is(
  (
    SELECT detail_payload ->> 'id'
    FROM public.get_public_catalogue_auctions(
      (
        SELECT max(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-new-tag'
    )
  ),
  '72000000-0000-4000-8000-000000000004',
  'indexed auction reader resolves the replacement OS tag'
);

SET LOCAL session_replication_role = replica;
UPDATE private.public_catalogue_versions
SET
  listing_type = 'auction',
  os_tag = 'catalogue-old-tag',
  tags = ARRAY['os_auction:catalogue-old-tag']::text[],
  detail_payload = detail_payload || jsonb_build_object(
    'listing_type', 'auction',
    'tags', jsonb_build_array('os_auction:catalogue-old-tag')
  )
WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  AND valid_to_publication IS NOT NULL;
SET LOCAL session_replication_role = origin;

SELECT throws_ok(
  $$
    SELECT *
    FROM public.get_public_catalogue_auctions(
      (
        SELECT min(publication_id)
        FROM private.public_catalogue_publications
      ),
      NULL,
      'catalogue-old-tag'
    )
  $$,
  '23505',
  'public_catalogue_duplicate_os_tag',
  'indexed auction reader fails closed on a duplicate historical OS tag'
);

SET LOCAL session_replication_role = replica;
UPDATE private.public_catalogue_versions
SET
  listing_type = 'new_build',
  os_tag = NULL,
  tags = '{}'::text[],
  detail_payload = detail_payload || jsonb_build_object(
    'listing_type', 'new_build',
    'tags', '[]'::jsonb
  )
WHERE listing_id = '72000000-0000-4000-8000-000000000001'
  AND valid_to_publication IS NOT NULL;
SET LOCAL session_replication_role = origin;

SELECT is(
  (SELECT publication_id FROM private.public_catalogue_current),
  (SELECT max(publication_id) FROM private.public_catalogue_publications),
  'the current pointer advances only after the later publication completes'
);
SELECT is(
  (
    SELECT (payload ->> 'publication_id')::bigint
    FROM public.get_public_catalogue_homepage(NULL)
  ),
  (SELECT publication_id FROM private.public_catalogue_current),
  'homepage payload and catalogue readers share the current publication'
);
SELECT throws_ok(
  $$
    UPDATE private.public_catalogue_versions
    SET card_payload = card_payload || '{"price": 1}'::jsonb
    WHERE listing_id = '72000000-0000-4000-8000-000000000001'
      AND valid_to_publication IS NULL
  $$,
  '22023',
  'public_catalogue_version_immutable',
  'published card payloads cannot be rewritten'
);

SELECT * FROM finish();

ROLLBACK;
