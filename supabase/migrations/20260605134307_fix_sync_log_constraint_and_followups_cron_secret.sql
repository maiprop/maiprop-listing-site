ALTER TABLE public.sync_log
  DROP CONSTRAINT IF EXISTS sync_log_entity_type_check;

ALTER TABLE public.sync_log
  ADD CONSTRAINT sync_log_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'listing'::text,
    'report'::text,
    'lead'::text,
    'profile'::text,
    'auction'::text,
    'firesale'::text,
    'consultation'::text
  ]));

CREATE OR REPLACE FUNCTION private.invoke_scheduled_followups_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supabase_url text;
  v_cron_secret text;
BEGIN
  SELECT decrypted_secret
  INTO v_supabase_url
  FROM vault.decrypted_secrets
  WHERE name = 'SUPABASE_URL'
  ORDER BY created_at DESC
  LIMIT 1;

  SELECT decrypted_secret
  INTO v_cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'CRON_SECRET'
  ORDER BY created_at DESC
  LIMIT 1;

  IF nullif(v_supabase_url, '') IS NULL THEN
    v_supabase_url := current_setting('app.settings.supabase_url', true);
  END IF;

  IF nullif(v_cron_secret, '') IS NULL THEN
    v_cron_secret := current_setting('app.settings.cron_secret', true);
  END IF;

  IF nullif(v_supabase_url, '') IS NULL OR nullif(v_cron_secret, '') IS NULL THEN
    RAISE WARNING 'Skipping scheduled-followups cron: missing Supabase URL or cron secret';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/scheduled-followups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_scheduled_followups_cron() FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION private.invoke_scheduled_followups_cron() IS 'Invokes the scheduled-followups edge function from pg_cron using Vault-backed settings.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'daily-crm-followups') THEN
    PERFORM cron.unschedule('daily-crm-followups');
  END IF;

  PERFORM cron.schedule(
    'daily-crm-followups',
    '0 8 * * *',
    'SELECT private.invoke_scheduled_followups_cron();'
  );
END;
$$;
