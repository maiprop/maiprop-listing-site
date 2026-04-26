-- =============================================================================
-- 20260623120000_rate_limit_counters.sql
-- =============================================================================
-- Cross-region rate-limit counters for edge functions.
--
-- Replaces the in-memory per-isolate limiter in
-- supabase/functions/_shared/rateLimit.ts with a Postgres-backed counter so
-- limits are enforced GLOBALLY across all Supabase edge regions, not per
-- isolate. Without this, a motivated attacker who rotates regions multiplies
-- their effective AI-endpoint quota by the number of active regions.
--
-- Design:
--   - Table is keyed by (bucket, window_start). One row per fixed time window.
--   - check_and_increment_rate_limit() is the single atomic operation:
--     INSERT … ON CONFLICT DO UPDATE … RETURNING count. Returns whether the
--     request is allowed and how long until the window resets.
--   - Service-role only. Edge functions invoke via supabase-js with the
--     service-role key; no client-direct access.
--   - pg_cron purges windows older than 24 h hourly.
-- =============================================================================

-- 1. Table -----------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  bucket text NOT NULL,
  window_start timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

CREATE INDEX IF NOT EXISTS rate_limit_counters_window_start_idx
  ON public.rate_limit_counters (window_start);

-- Lock down: RLS enabled, no policies. Service-role bypasses RLS, so this
-- denies all client traffic (anon, authenticated) while permitting the
-- edge-function service-role client.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_counters FROM PUBLIC;
REVOKE ALL ON public.rate_limit_counters FROM anon;
REVOKE ALL ON public.rate_limit_counters FROM authenticated;

COMMENT ON TABLE public.rate_limit_counters IS
  'Edge-function rate-limit counters (global across regions). '
  'Service-role only; clients have no access. '
  'Purged hourly via pg_cron — see migration 20260623120000.';


-- 2. Atomic check-and-increment RPC ---------------------------------------

CREATE OR REPLACE FUNCTION public.check_and_increment_rate_limit(
  p_bucket          text,
  p_window_seconds  integer,
  p_limit           integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start  timestamptz;
  v_count         integer;
  v_window_end    timestamptz;
BEGIN
  -- Defensive bounds — never trust caller input.
  IF p_window_seconds IS NULL OR p_window_seconds <= 0 THEN
    RAISE EXCEPTION 'p_window_seconds must be positive';
  END IF;
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RAISE EXCEPTION 'p_limit must be positive';
  END IF;
  IF p_bucket IS NULL OR length(p_bucket) = 0 OR length(p_bucket) > 255 THEN
    RAISE EXCEPTION 'p_bucket must be a non-empty string ≤ 255 chars';
  END IF;

  -- Floor `now()` to the start of the current window. For windowSeconds=60,
  -- this gives a minute-aligned window. For 3600, an hour-aligned window.
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );
  v_window_end := v_window_start + make_interval(secs => p_window_seconds);

  -- Atomic increment. ON CONFLICT … RETURNING gives us the post-increment
  -- count without a second round trip.
  INSERT INTO public.rate_limit_counters (bucket, window_start, count)
  VALUES (p_bucket, v_window_start, 1)
  ON CONFLICT (bucket, window_start)
  DO UPDATE SET count = public.rate_limit_counters.count + 1
  RETURNING count INTO v_count;

  RETURN jsonb_build_object(
    'allowed',          v_count <= p_limit,
    'count',            v_count,
    'limit',            p_limit,
    'window_start',     v_window_start,
    'reset_in_seconds', greatest(
                          0,
                          ceil(extract(epoch from (v_window_end - now())))::int
                        )
  );
END;
$$;

-- Lock down execution. Edge functions use the service-role client.
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) TO service_role;

COMMENT ON FUNCTION public.check_and_increment_rate_limit(text, integer, integer) IS
  'Atomic INSERT … ON CONFLICT increment for rate-limit counters. '
  'Returns jsonb { allowed, count, limit, window_start, reset_in_seconds }. '
  'Called from supabase/functions/_shared/rateLimit.ts.';


-- 3. Hourly cleanup of stale windows ---------------------------------------
-- Pattern follows migration 20260621000000_audit_findings_fix.sql §P4-2:
-- idempotent unschedule + reschedule, tolerant of pg_cron not being
-- installed (e.g. local CI containers).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'rate-limit-counters-cleanup') THEN
    PERFORM cron.unschedule('rate-limit-counters-cleanup');
  END IF;
  PERFORM cron.schedule(
    'rate-limit-counters-cleanup',
    '0 * * * *',
    $cmd$DELETE FROM public.rate_limit_counters
         WHERE window_start < now() - interval '24 hours'$cmd$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available: %. Skipping rate-limit-counters-cleanup reschedule.', SQLERRM;
END $$;
