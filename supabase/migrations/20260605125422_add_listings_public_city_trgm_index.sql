CREATE INDEX IF NOT EXISTS idx_listings_public_city_trgm
  ON public.listings USING gin (city extensions.gin_trgm_ops)
  WHERE status = 'active'::public.listing_status
    AND is_off_market = false;
