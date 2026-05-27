-- Ensure seed_grant_role exists (idempotent), then backward-compat wrapper
CREATE OR REPLACE FUNCTION public.seed_grant_role(user_ids uuid[], target_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_role public.user_role := target_role::public.user_role;
  v_trigger_name text;
  v_disabled_triggers text[] := '{}';
BEGIN
  FOR v_trigger_name IN
    SELECT tgname
    FROM pg_trigger
    WHERE tgrelid = 'public.profiles'::regclass
      AND tgname IN ('profiles_guard_admin_and_role', 'profiles_guard_admin_and_role_trg')
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DISABLE TRIGGER %I', v_trigger_name);
    v_disabled_triggers := array_append(v_disabled_triggers, v_trigger_name);
  END LOOP;

  UPDATE public.profiles
  SET
    role = v_target_role,
    participant_type = CASE
      WHEN v_target_role = 'admin'::public.user_role THEN 'agent'
      ELSE v_target_role::text
    END,
    is_platform_admin = CASE
      WHEN v_target_role = 'admin'::public.user_role THEN true
      ELSE is_platform_admin
    END
  WHERE user_id = ANY(user_ids);

  FOREACH v_trigger_name IN ARRAY v_disabled_triggers LOOP
    EXECUTE format('ALTER TABLE public.profiles ENABLE TRIGGER %I', v_trigger_name);
  END LOOP;
EXCEPTION
  WHEN OTHERS THEN
    FOREACH v_trigger_name IN ARRAY v_disabled_triggers LOOP
      EXECUTE format('ALTER TABLE public.profiles ENABLE TRIGGER %I', v_trigger_name);
    END LOOP;
    RAISE;
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
