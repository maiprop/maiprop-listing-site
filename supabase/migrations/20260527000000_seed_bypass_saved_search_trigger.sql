-- Allow service role (auth.uid() IS NULL) to bypass saved search limit trigger.
-- Mirrors the pattern used for listing and viewing limit triggers.

CREATE OR REPLACE FUNCTION public.check_saved_search_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
  v_alert_count INT;
  v_alert_limit INT;
BEGIN
  -- Service role (auth.uid() IS NULL) bypasses limit checks (used by seed scripts / admin tools)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_saved_search_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM public.saved_searches WHERE user_id = NEW.user_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'saved_search_limit_reached' USING HINT = 'Upgrade to Pro for more saved searches';
  END IF;

  RETURN NEW;
END;
$$;
