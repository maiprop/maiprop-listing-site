-- Make listing quota checks race-resistant.
-- RLS calls this function during INSERT; without a per-owner lock, concurrent
-- inserts can both count the same existing rows and exceed the user's cap.

CREATE OR REPLACE FUNCTION public.check_listing_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_role TEXT;
  v_is_pro BOOLEAN;
  v_limit INT;
  v_count INT;
BEGIN
  IF v_actor IS NULL THEN
    RETURN FALSE;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('listing_quota:' || v_actor::text));

  SELECT
    COALESCE(p.role, 'buyer'),
    public.has_audience_scoped_pro_entitlement(p.user_id)
      OR COALESCE(p.force_pro_access, FALSE)
      OR public.has_platform_admin(p.user_id)
  INTO v_role, v_is_pro
  FROM public.profiles p
  WHERE p.user_id = v_actor;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_limit := public.get_listing_limit(v_role, v_is_pro);

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.listings
  WHERE owner_id = v_actor
    AND COALESCE(status::text, 'active') NOT IN (
      'deleted',
      'archived',
      'closed',
      'expired',
      'cancelled',
      'withdrawn'
    );

  RETURN v_count < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION private.check_listing_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.check_listing_quota();
END;
$$;

REVOKE ALL ON FUNCTION public.check_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_listing_quota() TO authenticated, service_role;
REVOKE ALL ON FUNCTION private.check_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated, service_role;

COMMENT ON FUNCTION public.check_listing_quota()
  IS 'Race-resistant listing quota guard; locks per owner and ignores terminal listing statuses.';

DO $$
DECLARE
  v_source text;
BEGIN
  SELECT pg_get_functiondef('public.check_listing_quota()'::regprocedure)
  INTO v_source;

  IF v_source NOT LIKE '%pg_advisory_xact_lock%' THEN
    RAISE EXCEPTION 'check_listing_quota must lock per owner';
  END IF;

  IF v_source NOT LIKE '%NOT IN%' OR v_source NOT LIKE '%deleted%' THEN
    RAISE EXCEPTION 'check_listing_quota must ignore terminal listings';
  END IF;
END $$;
