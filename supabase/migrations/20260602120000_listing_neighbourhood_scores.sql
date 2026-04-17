-- Add neighbourhood quality scores to listings so they can be used as search filters.
-- Scores are populated when the neighbourhood-report edge function is called for a listing.

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS walkability_score  SMALLINT CHECK (walkability_score  BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS safety_score       SMALLINT CHECK (safety_score       BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS noise_score        SMALLINT CHECK (noise_score        BETWEEN 1 AND 10);

-- Partial indexes for filter performance (only rows with a score set).
CREATE INDEX IF NOT EXISTS idx_listings_walkability_score
  ON public.listings (walkability_score) WHERE walkability_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_safety_score
  ON public.listings (safety_score) WHERE safety_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_listings_noise_score
  ON public.listings (noise_score) WHERE noise_score IS NOT NULL;
