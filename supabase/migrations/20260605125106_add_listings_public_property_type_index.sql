CREATE INDEX IF NOT EXISTS idx_listings_public_property_type
  ON public.listings USING btree (property_type)
  WHERE status = 'active'::public.listing_status
    AND is_off_market = false;
