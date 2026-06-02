-- Restrict aggregate open-house capacity lookup to signed-in users.
--
-- Capacity is still enforced server-side by create_open_house_registration().
-- Guests do not need direct RPC execution before authentication, and removing
-- anon execution clears the remaining public SECURITY DEFINER advisor warning.

REVOKE ALL ON FUNCTION public.get_open_house_capacity(UUID)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_open_house_capacity(UUID)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_open_house_capacity(UUID) IS
  'Returns aggregate open-house capacity counts for signed-in users without exposing visitor registration rows through RLS.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_open_house_capacity(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute public.get_open_house_capacity(uuid)';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.get_open_house_capacity(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute public.get_open_house_capacity(uuid)';
  END IF;
END $$;
