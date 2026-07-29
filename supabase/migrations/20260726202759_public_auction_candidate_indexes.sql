-- Production EXPLAIN showed the public auction card query scanning every
-- active auction through a bedroom/type index before sorting the first page.
-- Keep these indexes narrow: only active, on-market MaiProp OS auctions are
-- indexed, in the exact stable order exposed by the public candidate RPC.

CREATE INDEX IF NOT EXISTS idx_listings_public_auction_candidates
  ON public.listings (auction_date ASC NULLS LAST, id ASC)
  INCLUDE (priority_placement, priority_until)
  WHERE status = 'active'::public.listing_status
    AND listing_type = 'auction'::public.listing_type
    AND COALESCE(is_off_market, FALSE) = FALSE
    AND tags @> ARRAY['source:maiprop-os']::TEXT[];

-- Paid placements are sparse and must not scan the organic catalogue merely
-- to prove that only a handful are active. Expiry stays a runtime predicate
-- because NOW() is not immutable and therefore does not belong in an index
-- predicate.
CREATE INDEX IF NOT EXISTS idx_listings_public_priority_auction_candidates
  ON public.listings (auction_date ASC NULLS LAST, id ASC)
  INCLUDE (priority_placement, priority_until)
  WHERE status = 'active'::public.listing_status
    AND listing_type = 'auction'::public.listing_type
    AND COALESCE(is_off_market, FALSE) = FALSE
    AND tags @> ARRAY['source:maiprop-os']::TEXT[]
    AND priority_placement > 0;
