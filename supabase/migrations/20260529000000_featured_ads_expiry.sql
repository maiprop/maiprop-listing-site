-- Add expiry tracking to featured listings
-- Previously is_featured was permanent; now it auto-expires.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

-- Auto-unfeat listings whose featured_until is in the past
CREATE OR REPLACE FUNCTION expire_featured_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE listings
  SET is_featured = false, featured_until = NULL
  WHERE is_featured = true
    AND featured_until IS NOT NULL
    AND featured_until < now();
END;
$$;

-- Let pg_cron call this every hour (run manually or via cron extension)
-- SELECT cron.schedule('expire-featured-listings', '0 * * * *', 'SELECT expire_featured_listings()');

-- Index to make expiry queries fast
CREATE INDEX IF NOT EXISTS idx_listings_featured_until
  ON listings(featured_until)
  WHERE is_featured = true AND featured_until IS NOT NULL;
