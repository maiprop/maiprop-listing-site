-- Ensure seed_grant_role exists (idempotent), then backward-compat wrapper
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

CREATE OR REPLACE FUNCTION public.seed_grant_agent_role(user_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.seed_grant_role(user_ids, 'agent');
END;
$$;
