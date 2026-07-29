-- The catalogue RPC is an internal hydration boundary. The Cloudflare public
-- route enforces the Free 60-auction response contract, while authenticated
-- Pro/Admin clients use the separately authorized Edge Function.
REVOKE ALL ON FUNCTION public.get_public_auction_candidates(
  INTEGER,
  TEXT,
  DATE,
  TIMESTAMPTZ,
  TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(
  INTEGER,
  TEXT,
  DATE,
  TIMESTAMPTZ,
  TEXT
) TO service_role;

-- The table currently contains fewer than 20k OS auctions. A short lock timeout
-- makes this fail safely rather than blocking catalogue writes if production is
-- unexpectedly busy. The existing general auction-date index is retained until
-- post-release usage telemetry proves it redundant.
SET lock_timeout = '3s';
SET statement_timeout = '30s';

DROP INDEX IF EXISTS public.idx_listings_public_priority_auction_candidates;
DROP INDEX IF EXISTS public.idx_listings_public_auction_candidates;

CREATE INDEX IF NOT EXISTS idx_listings_public_auction_order_v1
ON public.listings (auction_date ASC NULLS LAST, id ASC)
WHERE status = 'active'::public.listing_status
  AND listing_type = 'auction'::public.listing_type
  AND COALESCE(is_off_market, FALSE) = FALSE
  AND tags @> ARRAY['source:maiprop-os']::TEXT[];

DO $$
DECLARE
  v_indexdef TEXT;
  v_indisvalid BOOLEAN;
  v_indisready BOOLEAN;
BEGIN
  SELECT
    pg_get_indexdef(index_class.oid),
    index_state.indisvalid,
    index_state.indisready
  INTO v_indexdef, v_indisvalid, v_indisready
  FROM pg_catalog.pg_class AS index_class
  JOIN pg_catalog.pg_index AS index_state
    ON index_state.indexrelid = index_class.oid
  JOIN pg_catalog.pg_namespace AS namespace
    ON namespace.oid = index_class.relnamespace
  WHERE namespace.nspname = 'public'
    AND index_class.relname = 'idx_listings_public_auction_order_v1';

  IF v_indexdef IS NULL
     OR NOT v_indisvalid
     OR NOT v_indisready
     OR POSITION('(auction_date, id)' IN v_indexdef) = 0
     OR POSITION('source:maiprop-os' IN v_indexdef) = 0 THEN
    RAISE EXCEPTION 'public_auction_order_index_invalid';
  END IF;
END;
$$;

RESET statement_timeout;
RESET lock_timeout;

COMMENT ON INDEX public.idx_listings_public_auction_order_v1 IS
  'Ordered active MaiProp OS auction candidates for the backend-only catalogue RPC. Priority auctions are already covered by the existing priority index at current volume.';
