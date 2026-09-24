BEGIN;

-- The service-side registration RPC deliberately runs without an end-user JWT
-- and carries the admitted requester in this transaction-local marker. Keep
-- the legacy authenticated path unchanged while applying the same existing
-- monthly entitlement to the service path.
CREATE OR REPLACE FUNCTION public.check_open_house_rsvp_monthly_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ := date_trunc('month', now())::timestamptz;
  v_actor UUID := auth.uid();
  v_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_registration_rpc', TRUE), '');
BEGIN
  IF v_actor IS NOT NULL THEN
    IF NEW.requester_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'open_house_rsvp_requester_mismatch'
        USING HINT = 'Open-house RSVPs must be created for the authenticated user';
    END IF;
  ELSIF v_rpc_context IS DISTINCT FROM NEW.requester_id::TEXT THEN
    -- Ordinary no-subject INSERTs still reach the unchanged insert guard,
    -- which rejects them with use_create_open_house_registration_rpc.
    RETURN NEW;
  END IF;

  v_limit := public.get_open_house_rsvp_monthly_limit(NEW.requester_id);
  IF v_limit >= 999 THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('open_house_rsvp:' || NEW.requester_id::TEXT || ':' || to_char(v_month_start, 'YYYY-MM'), 0)
  );

  SELECT COUNT(*)::INTEGER
    INTO v_count
  FROM public.open_house_registrations r
  WHERE r.requester_id = NEW.requester_id
    AND r.created_at >= v_month_start
    AND r.status NOT IN ('cancelled', 'rejected');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'open_house_rsvp_limit_reached'
      USING HINT = 'Upgrade to Pro for unlimited open-house RSVPs';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
