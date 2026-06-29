-- Add a service-role-only role-switch validation RPC. It runs the blocking
-- business checks from archive_role_data without mutating the profile, so the
-- app can avoid cancelling Stripe before Supabase confirms the switch is valid.

CREATE OR REPLACE FUNCTION public.validate_role_switch_for_user(_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.firesale_interest fi
    WHERE fi.investor_id = _user_id
      AND (
        fi.status IN ('engaged', 'won')
        OR (
          fi.status = 'reserved'
          AND COALESCE(fi.reservation_expires_at, now() + interval '100 years') > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'active_firesale_commitment_blocks_role_switch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.open_house_offers o
    JOIN public.listings l ON l.id = o.listing_id
    WHERE (o.bidder_id = _user_id OR l.owner_id = _user_id)
      AND o.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'accepted_open_house_offer_blocks_role_switch';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_role_switch_for_user(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_role_switch_for_user(UUID)
  TO service_role;

COMMENT ON FUNCTION public.validate_role_switch_for_user(UUID) IS
  'Service-role-only role-switch preflight. Verifies business blockers without changing profile state.';

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.validate_role_switch_for_user(uuid)');
BEGIN
  IF fn IS NULL THEN
    RAISE EXCEPTION 'public.validate_role_switch_for_user(uuid) was not created';
  END IF;

  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.validate_role_switch_for_user(uuid) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.validate_role_switch_for_user(uuid) must remain service-callable';
  END IF;
END $$;
