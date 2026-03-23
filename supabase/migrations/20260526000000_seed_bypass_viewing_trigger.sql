-- Allow service role (auth.uid() IS NULL) to bypass viewing limit trigger.
-- This lets seed scripts insert viewings without hitting plan-limit checks.
-- The trigger still blocks limit violations for regular users.

CREATE OR REPLACE FUNCTION public.check_viewing_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_requester INT;
  v_limit_owner INT;
  v_count_requester INT;
  v_count_owner INT;
  v_month_start TIMESTAMPTZ;
BEGIN
  -- Service role (auth.uid() IS NULL) bypasses limit checks (used by seed scripts / admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', now())::timestamptz;

  -- Check requester (buyer) limit
  v_limit_requester := public.get_viewing_limit(NEW.requester_id, true);
  IF v_limit_requester < 999 THEN
    SELECT COUNT(*) INTO v_count_requester FROM public.viewings
    WHERE requester_id = NEW.requester_id AND created_at >= v_month_start;
    IF v_count_requester >= v_limit_requester THEN
      RAISE EXCEPTION 'viewing_limit_reached' USING HINT = 'Upgrade to Pro for more viewings per month';
    END IF;
  END IF;

  -- Check owner (agent) limit - viewings on their listings
  v_limit_owner := public.get_viewing_limit(NEW.owner_id, false);
  IF v_limit_owner < 999 THEN
    SELECT COUNT(*) INTO v_count_owner FROM public.viewings
    WHERE owner_id = NEW.owner_id AND created_at >= v_month_start;
    IF v_count_owner >= v_limit_owner THEN
      RAISE EXCEPTION 'viewing_limit_reached' USING HINT = 'Listing owner has reached viewing limit. Upgrade to Pro for more.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
