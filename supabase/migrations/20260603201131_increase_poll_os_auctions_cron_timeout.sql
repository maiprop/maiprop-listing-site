-- Give the private auction-pool cron wrapper enough time to observe the
-- Edge Function response. The sync can legitimately take longer than pg_net's
-- 5 second default while it samples and upserts the daily 600-auction pool.

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
    ),
    timeout_milliseconds := 120000
  );
END;
$$;

COMMENT ON FUNCTION private.invoke_poll_os_auctions_cron() IS
  'Privately invokes poll-os-auctions with CRON_SECRET from Vault/app settings to refresh the daily canonical 600-auction portal pool; pg_net waits up to 120s for an observable response.';

REVOKE ALL ON FUNCTION private.invoke_poll_os_auctions_cron() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_poll_os_auctions_cron() TO service_role;
