-- Schedule the saved-search-alerts edge function to run every 6 hours via pg_cron + pg_net.
-- Requires: SUPABASE_URL set in Vault or hardcoded below (use Vault in production).

DO $$
DECLARE
  v_url text := current_setting('app.settings.supabase_url', true);
BEGIN
  -- Fallback: if app setting not present, pg_net will still work as long as the
  -- edge function URL is accessible from within the Supabase project.
  IF v_url IS NULL OR v_url = '' THEN
    RAISE NOTICE 'app.settings.supabase_url not set — cron job will use hardcoded project URL';
  END IF;
END $$;

-- Remove existing job if it exists (idempotent)
SELECT cron.unschedule('send-saved-search-alerts') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'send-saved-search-alerts'
);

-- Schedule: every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
SELECT cron.schedule(
  'send-saved-search-alerts',
  '0 0,6,12,18 * * *',
  $$
    SELECT net.http_post(
      url := 'https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/send-saved-search-alerts',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);
