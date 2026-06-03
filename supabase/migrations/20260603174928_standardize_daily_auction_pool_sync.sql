-- Standardize the portal auction catalogue:
-- - One private daily cron invokes poll-os-auctions.
-- - The edge function writes the canonical 600-auction daily pool.
-- - Free users see the first 60 from that same local pool; Pro/eligible users
--   see up to 600. User page views must not call the OS auction API.
--
-- The cron command deliberately calls a wrapper instead of storing CRON_SECRET
-- in cron.job.command. The wrapper fails closed when CRON_SECRET or project URL
-- is unavailable.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;

DROP FUNCTION IF EXISTS public.invoke_poll_os_auctions_cron();

CREATE OR REPLACE FUNCTION private.invoke_poll_os_auctions_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_cron_secret text := NULL;
  v_supabase_url text := NULL;
BEGIN
  BEGIN
    SELECT decrypted_secret
    INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION
    WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault decrypted secrets are not available while invoking poll-os-auctions.';
  END;

  v_cron_secret := COALESCE(
    NULLIF(v_cron_secret, ''),
    NULLIF(current_setting('app.settings.cron_secret', TRUE), '')
  );

  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE WARNING 'CRON_SECRET is missing from Vault/app settings; skipping poll-os-auctions cron invocation.';
    RETURN;
  END IF;

  v_supabase_url := NULLIF(current_setting('app.settings.supabase_url', TRUE), '');
  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    BEGIN
      SELECT decrypted_secret
      INTO v_supabase_url
      FROM vault.decrypted_secrets
      WHERE name IN ('SUPABASE_URL', 'supabase_url')
      LIMIT 1;
    EXCEPTION
      WHEN invalid_schema_name OR undefined_table THEN
        RAISE NOTICE 'Vault decrypted secrets are not available while resolving Supabase URL.';
    END;
  END IF;

  IF v_supabase_url IS NULL OR v_supabase_url = '' THEN
    RAISE WARNING 'Supabase URL is missing from Vault/app settings; skipping poll-os-auctions cron invocation.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/poll-os-auctions',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cron_secret
    ),
    body := jsonb_build_object(
      'pageSize', 600,
      'sampleAcrossGreece', true,
      'sortBy', 'AUCTION_DATE',
      'order', 'ASC',
      'source', 'daily-canonical-pool'
    )
  );
END;
$$;

COMMENT ON FUNCTION private.invoke_poll_os_auctions_cron() IS
  'Privately invokes poll-os-auctions with CRON_SECRET from Vault/app settings to refresh the daily canonical 600-auction portal pool.';

REVOKE ALL ON FUNCTION private.invoke_poll_os_auctions_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_poll_os_auctions_cron() TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) AND EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'poll-os-auctions-daily'
  ) THEN
    PERFORM cron.unschedule('poll-os-auctions-daily');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) THEN
    RAISE NOTICE 'cron schema is unavailable; poll-os-auctions schedule was not installed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'poll-os-auctions-daily',
    '15 4 * * *',
    'SELECT private.invoke_poll_os_auctions_cron();'
  );
END $$;
