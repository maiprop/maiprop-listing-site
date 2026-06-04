-- The live database had both the legacy and current profile role guard triggers
-- active. Keep one canonical trigger and make the service-role seed helper use
-- that trigger name so fixture setup does not silently fail after trigger
-- renames.

DROP TRIGGER IF EXISTS profiles_guard_admin_and_role ON public.profiles;
DROP TRIGGER IF EXISTS profiles_guard_admin_and_role_trg ON public.profiles;

CREATE TRIGGER profiles_guard_admin_and_role_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_admin_and_role();

CREATE OR REPLACE FUNCTION public.seed_grant_role(user_ids uuid[], target_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role_trg;

  UPDATE public.profiles
  SET role = target_role::public.user_role,
      updated_at = now()
  WHERE user_id = ANY(user_ids);

  ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg;
EXCEPTION WHEN OTHERS THEN
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_grant_role(uuid[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_grant_role(uuid[], text)
  TO service_role;
