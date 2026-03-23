-- Allow service role (auth.uid() IS NULL) to bypass auction alert limit trigger.
-- Mirrors the pattern used for listing, viewing and saved search limit triggers.

CREATE OR REPLACE FUNCTION public.check_auction_alert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  -- Service role (auth.uid() IS NULL) bypasses limit checks (used by seed scripts / admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_auction_alert_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM public.auction_alerts WHERE user_id = NEW.user_id AND active = true;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'auction_alert_limit_reached' USING HINT = 'Upgrade to Pro for more auction alerts';
  END IF;

  RETURN NEW;
END;
$$;
