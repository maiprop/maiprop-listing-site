-- ── expire_past_auctions ─────────────────────────────────────────────────────
-- Marks OS-sourced auction listings as 'expired' once their auction_date
-- has passed (UTC calendar day). Runs daily at 02:00 UTC via pg_cron.
--
-- Only touches rows with listing_type = 'auction', status = 'active', and a
-- non-null auction_date that is strictly before today. Date-TBD auctions
-- (auction_date IS NULL) are left untouched so they keep appearing until
-- they are either assigned a date and expire naturally, or deleted by a
-- manual admin action.
--
-- Setting status → 'expired' is preferred over hard-deletion because:
--   • preserves the row for audit / analytics queries on sync_log joins
--   • keeps the os_auction: tag intact so future syncs can update-in-place
--     rather than re-insert if OS resurfaces the listing (e.g. rescheduled)
--   • the useAuctionListings hook already filters .eq("status","active")
--     so expired rows are invisible to end users immediately
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.expire_past_auctions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.listings
  SET    status     = 'expired',
         updated_at = now()
  WHERE  listing_type = 'auction'
    AND  status       = 'active'
    AND  auction_date IS NOT NULL
    AND  (auction_date AT TIME ZONE 'UTC')::date < (now() AT TIME ZONE 'UTC')::date;

  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Revoke direct execution from all roles; only the cron job (via
-- pg_cron's superuser context) invokes it.
REVOKE ALL ON FUNCTION public.expire_past_auctions() FROM PUBLIC;

-- ── pg_cron schedule ─────────────────────────────────────────────────────────
-- Runs at 02:00 UTC every day. Wrapped in DO block so the migration does not
-- fail if pg_cron is not available in this environment (e.g. local dev).
DO $$
BEGIN
  -- Remove any pre-existing job with the same name before (re-)creating it
  -- so this migration is idempotent.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-past-auctions') THEN
    PERFORM cron.unschedule('expire-past-auctions');
  END IF;

  PERFORM cron.schedule(
    'expire-past-auctions',
    '0 2 * * *',
    'SELECT public.expire_past_auctions()'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %. Skipping expire-past-auctions schedule.', SQLERRM;
END;
$$;
