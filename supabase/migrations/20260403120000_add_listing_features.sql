-- Add is_featured and priority_placement for Pro listings
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_placement integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.listings.is_featured IS 'Spotlight badge/visibility for Pro listings';
COMMENT ON COLUMN public.listings.priority_placement IS 'Higher = appear first in search (Pro); 0 = default';

CREATE INDEX IF NOT EXISTS idx_listings_featured_placement
  ON public.listings (is_featured, priority_placement DESC)
  WHERE status = 'active';
