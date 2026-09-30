-- Synthetic captured variant reconstructed from redacted 2026-09-27 evidence.
-- Exact LF-normalized body MD5: 298f66b973474b0b95b9220e14613d05.
-- The fixed project endpoint is public routing metadata, not a credential.
CREATE OR REPLACE FUNCTION public.invoke_send_saved_search_alerts_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cron_secret text := NULL;
BEGIN
  BEGIN
    SELECT decrypted_secret
    INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION
    WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault decrypted secrets are not available while invoking saved-search alerts.';
  END;

  v_cron_secret := COALESCE(
    NULLIF(v_cron_secret, ''),
    NULLIF(current_setting('app.settings.cron_secret', TRUE), '')
  );

  IF v_cron_secret IS NULL OR v_cron_secret = '' THEN
    RAISE WARNING 'CRON_SECRET is missing from Vault/app settings; skipping saved-search alert cron invocation.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/send-saved-search-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cron_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;
