-- Restrict the reservation expiry sweeper to trusted execution contexts.
--
-- release_expired_firesale_reservations mutates firesale_interest rows and
-- creates notifications. It is scheduled through pg_cron, and admin workflow
-- RPCs can invoke it from SECURITY DEFINER context, so normal authenticated
-- users do not need direct EXECUTE access.

REVOKE ALL ON FUNCTION public.release_expired_firesale_reservations(UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.release_expired_firesale_reservations(UUID)
  TO service_role;

COMMENT ON FUNCTION public.release_expired_firesale_reservations(UUID) IS
  'Expires overdue Quick Sale investor reservations, records audit entries, and notifies affected investors. Direct Data API execution is service-role only; pg_cron/admin workflows run from trusted contexts.';

DO $$
BEGIN
  IF has_function_privilege('authenticated', 'public.release_expired_firesale_reservations(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute release_expired_firesale_reservations directly';
  END IF;

  IF has_function_privilege('anon', 'public.release_expired_firesale_reservations(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute release_expired_firesale_reservations directly';
  END IF;
END $$;
