-- Enable pg_cron for Spotlight listing expiry.
-- Requires the pg_cron extension to be enabled in Supabase dashboard:
--   Dashboard → Database → Extensions → cron
--
-- Schedule: every hour at :00
SELECT cron.schedule(
  'expire-featured-listings',
  '0 * * * *',
  'SELECT expire_featured_listings()'
);
