
-- Add is_featured and priority_placement columns to listings table
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority_placement integer NOT NULL DEFAULT 0;

-- Index for fast featured/priority queries on the listings page
CREATE INDEX IF NOT EXISTS idx_listings_featured ON public.listings (is_featured, priority_placement DESC);
