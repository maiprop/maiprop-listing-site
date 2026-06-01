-- Add a service-role-only role-switch RPC for the begin-role-switch Edge
-- Function. The Edge Function verifies the caller JWT and passes the verified
-- user id explicitly, avoiding direct browser execution of the caller-context
-- begin_role_switch() RPC.

CREATE OR REPLACE FUNCTION public.begin_role_switch_for_user(_user_id UUID)
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
  WHERE user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.archive_role_data(_user_id, v_role::text);

  UPDATE public.profiles
  SET
    participant_type = NULL,
    bio = NULL,
    role_switch_in_progress_at = now(),
    updated_at = now()
  WHERE user_id = _user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_role_switch_for_user(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_role_switch_for_user(UUID)
  TO service_role;

COMMENT ON FUNCTION public.begin_role_switch_for_user(UUID) IS
  'Service-role-only role-switch initiator. The begin-role-switch Edge Function verifies the caller JWT and passes the verified user id explicitly.';

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.begin_role_switch_for_user(uuid)');
BEGIN
  IF fn IS NULL THEN
    RAISE EXCEPTION 'public.begin_role_switch_for_user(uuid) was not created';
  END IF;

  IF has_function_privilege('anon', fn, 'EXECUTE')
     OR has_function_privilege('authenticated', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.begin_role_switch_for_user(uuid) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.begin_role_switch_for_user(uuid) must remain service-callable';
  END IF;
END $$;
