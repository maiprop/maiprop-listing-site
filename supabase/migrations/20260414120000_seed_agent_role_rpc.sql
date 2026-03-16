-- Primary: seed_grant_role for all role types
CREATE OR REPLACE FUNCTION public.seed_grant_role(user_ids uuid[], target_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role;
  UPDATE public.profiles SET role = target_role::public.user_role WHERE user_id = ANY(user_ids);
  ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role;
END;
$$;
COMMENT ON FUNCTION public.seed_grant_role IS 'Seed-only: grants role to given user IDs. Use with service_role only.';
