CREATE INDEX IF NOT EXISTS idx_listings_active_auction_tags_gin
  ON public.listings USING gin (tags)
  WHERE status = 'active'::public.listing_status
    AND listing_type = 'auction'::public.listing_type
    AND is_off_market = false;
