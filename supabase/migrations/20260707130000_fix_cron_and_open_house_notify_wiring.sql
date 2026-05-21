-- Repair two production wiring gaps:
-- 1. Saved-search alert cron must invoke its Edge Function with CRON_SECRET.
-- 2. Open-house registration status changes must call oh-registration-notify
--    with WEBHOOK_SECRET after the registrations table exists.
--
-- Both paths fail closed if their matching Vault/app setting secret is missing:
-- the saved-search cron wrapper skips the outbound call, and the registration
-- trigger skips the outbound email webhook rather than sending an invalid
-- request. The cron job calls a wrapper function so the bearer secret is not
-- stored in cron.job.command.

CREATE OR REPLACE FUNCTION public.invoke_send_saved_search_alerts_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) AND EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'send-saved-search-alerts'
  ) THEN
    PERFORM cron.unschedule('send-saved-search-alerts');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) THEN
    RAISE NOTICE 'cron schema is unavailable; saved-search alert schedule was not installed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'send-saved-search-alerts',
    '0 0,6,12,18 * * *',
    'SELECT public.invoke_send_saved_search_alerts_cron();'
  );
END $$;

COMMENT ON FUNCTION public.invoke_send_saved_search_alerts_cron() IS
  'Invokes send-saved-search-alerts with CRON_SECRET from Vault/app settings; skips outbound calls if the secret is missing.';

CREATE OR REPLACE FUNCTION public.notify_oh_registration_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edge_url text := 'https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/oh-registration-notify';
  v_webhook_secret text := NULL;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  BEGIN
    SELECT decrypted_secret
    INTO v_webhook_secret
    FROM vault.decrypted_secrets
    WHERE name = 'WEBHOOK_SECRET'
    LIMIT 1;
  EXCEPTION
    WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault decrypted secrets are not available while notifying open-house registration status.';
  END;

  v_webhook_secret := COALESCE(
    NULLIF(v_webhook_secret, ''),
    NULLIF(current_setting('app.settings.webhook_secret', TRUE), '')
  );

  IF v_webhook_secret IS NULL OR v_webhook_secret = '' THEN
    RAISE WARNING 'WEBHOOK_SECRET is missing from Vault/app settings; skipping open-house registration notification for registration %.', NEW.id;
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := v_edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'UPDATE',
      'record', row_to_json(NEW)::jsonb,
      'old_record', row_to_json(OLD)::jsonb
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_oh_registration_notify
  ON public.open_house_registrations;

CREATE TRIGGER trg_oh_registration_notify
  AFTER UPDATE OF status ON public.open_house_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_oh_registration_status_change();

COMMENT ON FUNCTION public.notify_oh_registration_status_change() IS
  'Calls oh-registration-notify on approved/rejected open-house registration status changes using WEBHOOK_SECRET from Vault/app settings.';
