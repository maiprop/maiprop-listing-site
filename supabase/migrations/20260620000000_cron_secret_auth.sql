-- Update the send-saved-search-alerts cron job to pass Authorization: Bearer <CRON_SECRET>
-- so the edge function can reject calls that don't originate from pg_cron.
--
-- PREREQUISITE — add CRON_SECRET to Supabase Vault before running:
--   Dashboard › Settings › Vault › New secret
--   Name: CRON_SECRET   Value: <long random string>
--
-- Then also set CRON_SECRET as an edge function secret:
--   Dashboard › Edge Functions › Manage secrets › CRON_SECRET = same value
--
-- If the Vault secret is absent this migration still succeeds: it reschedules
-- the job without an auth header and logs a NOTICE. You can re-run the
-- migration after adding the secret to Vault.

DO $$
DECLARE
  v_secret  text := '';
  v_headers jsonb;
BEGIN
  -- Read CRON_SECRET from Vault (non-fatal if absent or vault unavailable)
  BEGIN
    SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'vault.decrypted_secrets not accessible: %. Scheduling without auth.', SQLERRM;
  END;

  -- Remove the existing cron job (idempotent)
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-saved-search-alerts') THEN
    PERFORM cron.unschedule('send-saved-search-alerts');
  END IF;

  -- Build the headers object
  IF v_secret IS NOT NULL AND v_secret <> '' THEN
    v_headers := json_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_secret
    )::jsonb;
    RAISE NOTICE 'Scheduling send-saved-search-alerts with CRON_SECRET Authorization header.';
  ELSE
    v_headers := '{"Content-Type":"application/json"}'::jsonb;
    RAISE NOTICE 'CRON_SECRET not found in Vault — scheduled WITHOUT auth header. Add it and re-run this migration.';
  END IF;

  -- Re-schedule: every 6 hours (00:00, 06:00, 12:00, 18:00 UTC)
  PERFORM cron.schedule(
    'send-saved-search-alerts',
    '0 0,6,12,18 * * *',
    format(
      $q$
        SELECT net.http_post(
          url     := 'https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/send-saved-search-alerts',
          headers := %L::jsonb,
          body    := '{}'::jsonb
        );
      $q$,
      v_headers::text
    )
  );

  RAISE NOTICE 'send-saved-search-alerts cron job updated.';
END $$;
