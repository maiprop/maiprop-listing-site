CREATE INDEX IF NOT EXISTS idx_listings_active_public_updated_at
  ON public.listings USING btree (updated_at DESC)
  WHERE status = 'active'::public.listing_status
    AND is_off_market = false;
