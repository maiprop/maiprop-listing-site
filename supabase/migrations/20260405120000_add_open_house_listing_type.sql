-- Add open_house listing type and open_house_date column
ALTER TYPE public.listing_type ADD VALUE IF NOT EXISTS 'open_house';

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS open_house_date TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.listings.open_house_date IS 'When the open house viewing takes place (for listing_type = open_house)';

CREATE INDEX IF NOT EXISTS idx_listings_open_house_date
  ON public.listings (open_house_date)
  WHERE status = 'active';
