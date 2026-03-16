
-- Add is_off_market and is_pre_sale columns to listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_off_market boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pre_sale boolean NOT NULL DEFAULT false;

-- Indexes for quick off-market / pre-sale queries
CREATE INDEX IF NOT EXISTS idx_listings_is_off_market ON public.listings (is_off_market) WHERE is_off_market = true;
CREATE INDEX IF NOT EXISTS idx_listings_is_pre_sale ON public.listings (is_pre_sale) WHERE is_pre_sale = true;
