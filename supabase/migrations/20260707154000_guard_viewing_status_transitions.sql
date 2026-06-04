-- Enforce viewing status transitions at the database boundary.
-- Requesters may cancel their own viewing requests, but only listing owners can
-- confirm or complete a viewing. This keeps video-room access host-approved
-- even if a client bypasses the dashboard UI and calls the Data API directly.

CREATE OR REPLACE FUNCTION public.guard_viewing_status_transitions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('confirmed', 'completed') AND v_actor <> OLD.owner_id THEN
      RAISE EXCEPTION 'Only the listing owner can confirm or complete a viewing'
        USING ERRCODE = '42501';
    END IF;

    IF NEW.status = 'cancelled' AND v_actor NOT IN (OLD.owner_id, OLD.requester_id) THEN
      RAISE EXCEPTION 'Only the listing owner or requester can cancel a viewing'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_viewing_status_transitions ON public.viewings;
CREATE TRIGGER trg_guard_viewing_status_transitions
  BEFORE UPDATE ON public.viewings
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_viewing_status_transitions();

COMMENT ON FUNCTION public.guard_viewing_status_transitions()
  IS 'Prevents requester-side confirmation/completion of viewings while preserving requester cancellation.';
