-- Keep the scheduled Quick Sale reservation expiry job from monopolizing the
-- database connection pool used by Auth, PostgREST, and billing preflights.
-- The role-switch preflight already treats expired reservations as inactive by
-- comparing reservation_expires_at to now(), so the sweep does not need to run
-- inline with role switching.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) AND EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'release-expired-firesale-reservations'
  ) THEN
    PERFORM cron.unschedule('release-expired-firesale-reservations');
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Unable to temporarily unschedule firesale reservation expiry: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_firesale_interest_reserved_expiry
  ON public.firesale_interest (reservation_expires_at, deal_id, id)
  WHERE status = 'reserved'
    AND reservation_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.release_expired_firesale_reservations(p_deal_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INTEGER := 0;
  v_batch_size CONSTANT INTEGER := 250;
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtext('release_expired_firesale_reservations')) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('maiprop.firesale_system_cleanup', 'true', TRUE);
  PERFORM set_config('maiprop.audit_actor', '', TRUE);
  PERFORM set_config('maiprop.audit_action', 'reservation_expired', TRUE);

  IF p_deal_id IS NULL THEN
    WITH candidates AS (
      SELECT fi.id
      FROM public.firesale_interest fi
      WHERE fi.status = 'reserved'
        AND fi.reservation_expires_at IS NOT NULL
        AND fi.reservation_expires_at <= now()
      ORDER BY fi.reservation_expires_at, fi.id
      LIMIT v_batch_size
      FOR UPDATE SKIP LOCKED
    ),
    expired AS (
      UPDATE public.firesale_interest fi
      SET
        status = 'expired',
        reservation_expires_at = NULL,
        last_status_changed_at = now()
      FROM candidates c
      WHERE fi.id = c.id
      RETURNING fi.investor_id, fi.deal_id
    ),
    notified AS (
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        type,
        read,
        link
      )
      SELECT
        e.investor_id,
        'Quick Sale reservation expired',
        'Your first-look reservation for ' ||
          COALESCE(NULLIF(concat_ws(', ', nullif(fr.address, ''), nullif(fr.city, '')), ''), 'a Quick Sale property') ||
          ' has expired. You can rejoin the queue if the deal is still available.',
        'investor_alert',
        false,
        '/investor-dashboard'
      FROM expired e
      LEFT JOIN public.firesale_requests fr ON fr.id = e.deal_id
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM expired;
  ELSE
    WITH candidates AS (
      SELECT fi.id
      FROM public.firesale_interest fi
      WHERE fi.deal_id = p_deal_id
        AND fi.status = 'reserved'
        AND fi.reservation_expires_at IS NOT NULL
        AND fi.reservation_expires_at <= now()
      ORDER BY fi.reservation_expires_at, fi.id
      FOR UPDATE SKIP LOCKED
    ),
    expired AS (
      UPDATE public.firesale_interest fi
      SET
        status = 'expired',
        reservation_expires_at = NULL,
        last_status_changed_at = now()
      FROM candidates c
      WHERE fi.id = c.id
      RETURNING fi.investor_id, fi.deal_id
    ),
    notified AS (
      INSERT INTO public.notifications (
        user_id,
        title,
        body,
        type,
        read,
        link
      )
      SELECT
        e.investor_id,
        'Quick Sale reservation expired',
        'Your first-look reservation for ' ||
          COALESCE(NULLIF(concat_ws(', ', nullif(fr.address, ''), nullif(fr.city, '')), ''), 'a Quick Sale property') ||
          ' has expired. You can rejoin the queue if the deal is still available.',
        'investor_alert',
        false,
        '/investor-dashboard'
      FROM expired e
      LEFT JOIN public.firesale_requests fr ON fr.id = e.deal_id
      RETURNING 1
    )
    SELECT count(*) INTO v_count FROM expired;
  END IF;

  PERFORM set_config('maiprop.firesale_system_cleanup', 'false', TRUE);
  RETURN v_count;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('maiprop.firesale_system_cleanup', 'false', TRUE);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.release_expired_firesale_reservations(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_firesale_reservations(UUID)
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) THEN
    RAISE NOTICE 'cron schema is unavailable; firesale reservation expiry schedule was not installed.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'release-expired-firesale-reservations'
  ) THEN
    PERFORM cron.unschedule('release-expired-firesale-reservations');
  END IF;

  PERFORM cron.schedule(
    'release-expired-firesale-reservations',
    '*/15 * * * *',
    'SELECT public.release_expired_firesale_reservations(NULL);'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %. Skipping firesale reservation expiry schedule.', SQLERRM;
END $$;

COMMENT ON FUNCTION public.release_expired_firesale_reservations(UUID) IS
  'Expires overdue Quick Sale investor reservations in bounded batches, records audit entries, and notifies affected investors. Scheduled by pg_cron when available.';
