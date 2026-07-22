\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

SELECT 'ECAS_QUERY_PLAN sale_priority_stream';
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)
SELECT id, title, city, price, listing_type, created_at
FROM public.public_listing_catalogue
WHERE listing_type IN ('sale', 'new_build')
  AND status = 'active'
  AND is_off_market = false
  AND priority_placement > 0
  AND priority_until > now()
ORDER BY created_at DESC, id DESC
LIMIT 40;

SELECT 'ECAS_QUERY_PLAN sale_organic_stream';
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)
SELECT id, title, city, price, listing_type, created_at
FROM public.public_listing_catalogue
WHERE listing_type IN ('sale', 'new_build')
  AND status = 'active'
  AND is_off_market = false
  AND (
    priority_placement <= 0
    OR priority_until <= now()
    OR priority_until IS NULL
  )
ORDER BY created_at DESC, id DESC
LIMIT 40;

SELECT 'ECAS_QUERY_PLAN rent_organic_stream';
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)
SELECT id, title, city, price, listing_type, created_at
FROM public.public_listing_catalogue
WHERE listing_type = 'rent'
  AND status = 'active'
  AND is_off_market = false
  AND (
    priority_placement <= 0
    OR priority_until <= now()
    OR priority_until IS NULL
  )
ORDER BY created_at DESC, id DESC
LIMIT 40;

SELECT 'ECAS_QUERY_PLAN location_search';
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)
SELECT id, title, city, price, listing_type, created_at
FROM public.public_listing_catalogue
WHERE status = 'active'
  AND is_off_market = false
  AND location_search_text ILIKE '%glyfada%'
ORDER BY created_at DESC, id DESC
LIMIT 40;

SELECT 'ECAS_QUERY_PLAN cursor_page';
EXPLAIN (ANALYZE, BUFFERS, WAL, FORMAT JSON)
WITH cursor_value AS (
  SELECT created_at, id
  FROM public.public_listing_catalogue
  WHERE listing_type = 'sale' AND status = 'active' AND is_off_market = false
  ORDER BY created_at DESC, id DESC
  OFFSET 399 LIMIT 1
)
SELECT listing.id, listing.title, listing.city, listing.price, listing.created_at
FROM public.public_listing_catalogue AS listing
CROSS JOIN cursor_value AS cursor
WHERE listing.listing_type = 'sale'
  AND listing.status = 'active'
  AND listing.is_off_market = false
  AND (listing.created_at, listing.id) < (cursor.created_at, cursor.id)
ORDER BY listing.created_at DESC, listing.id DESC
LIMIT 40;

SELECT 'ECAS_INDEX_USAGE';
SELECT jsonb_agg(to_jsonb(stats) ORDER BY stats.indexrelname)
FROM (
  SELECT
    schemaname,
    relname,
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND relname IN ('listings', 'listing_images', 'projects', 'project_units', 'listing_promotion_allocations')
) AS stats;
