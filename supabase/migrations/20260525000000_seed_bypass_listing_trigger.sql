-- Allow service role (auth.uid() IS NULL) to bypass listing limit trigger.
-- This lets seed scripts insert listings without hitting plan-limit checks.
-- The trigger still blocks limit violations for regular users.

CREATE OR REPLACE FUNCTION public.check_listing_limit()
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

  v_limit := public.get_listing_limit(NEW.owner_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'listing_not_allowed' USING HINT = 'Your account type cannot create listings';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.listings WHERE owner_id = NEW.owner_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'listing_limit_reached' USING HINT = 'Upgrade to Pro for more listings';
  END IF;

  RETURN NEW;
END;
$$;
