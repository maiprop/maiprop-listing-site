-- =============================================================================
-- Fix 1: Subscribed investors can view firesale deal feed
-- Fix 2: Schedule saved search alerts (pg_cron + pg_net)
-- =============================================================================

-- ── 1. RLS: Subscribed investors can SELECT firesale_requests (deal feed) ───
-- Investors/institutional with active subscription need to see the deal pipeline.
-- Inlined logic (no dependency on has_buy_side_role which may not exist yet).

DROP POLICY IF EXISTS "Subscribed investors view firesale deal feed" ON public.firesale_requests;
CREATE POLICY "Subscribed investors view firesale deal feed"
  ON public.firesale_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role::text IN ('investor', 'institutional')
    )
    AND EXISTS (
      SELECT 1 FROM public.investor_subscriptions
      WHERE user_id = auth.uid()
        AND status IN ('active', 'trial')
    )
  );

-- ── 2. Saved search alerts cron ─────────────────────────────────────────────
-- Requires: pg_cron and pg_net extensions (enable in Dashboard > Database > Extensions)
-- Requires: vault secrets - run once (replace with your anon key):
--   SELECT vault.create_secret('https://qvvicunqcrwpioqnvzxf.supabase.co', 'saved_search_alerts_project_url');
--   SELECT vault.create_secret('YOUR_ANON_KEY', 'saved_search_alerts_anon_key');

DO $$
BEGIN
  -- Only schedule if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net')
  THEN
    -- Unschedule if exists (idempotent)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-saved-search-alerts') THEN
      PERFORM cron.unschedule('send-saved-search-alerts');
    END IF;

    -- Schedule every 6 hours (only invokes when vault secrets are configured)
    PERFORM cron.schedule(
      'send-saved-search-alerts',
      '0 */6 * * *',  -- Every 6 hours at :00
      $cronsched$
      DO $cron$
      DECLARE
        base_url text;
        anon_key text;
      BEGIN
        SELECT decrypted_secret INTO base_url FROM vault.decrypted_secrets WHERE name = 'saved_search_alerts_project_url';
        SELECT decrypted_secret INTO anon_key FROM vault.decrypted_secrets WHERE name = 'saved_search_alerts_anon_key';
        IF base_url IS NOT NULL AND anon_key IS NOT NULL THEN
          PERFORM net.http_post(
            url := base_url || '/functions/v1/send-saved-search-alerts',
            headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || anon_key),
            body := '{}'::jsonb
          );
        END IF;
      END $cron$;
      $cronsched$
    );
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;  -- Extensions not enabled, skip silently
  WHEN OTHERS THEN
    RAISE NOTICE 'Cron setup skipped: %', SQLERRM;
END $$;
