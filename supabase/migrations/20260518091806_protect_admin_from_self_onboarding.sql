-- Keep platform admins out of the public onboarding role-switch path.
--
-- The canonical admin signal is profiles.role = 'admin'. The legacy
-- is_platform_admin column is intentionally ignored by has_platform_admin(),
-- so an admin profile that gets self-switched to seller/buyer loses report
-- quota and admin access even if the old flag remains true.

CREATE OR REPLACE FUNCTION public.complete_onboarding_role_for_user(
  p_user_id uuid,
  p_role public.user_role,
  p_participant_type text,
  p_display_name text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_phone text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_role public.user_role;
  v_was_switching boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role, role_switch_in_progress_at IS NOT NULL
    INTO v_old_role, v_was_switching
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  IF v_old_role = 'admin'::public.user_role THEN
    RAISE EXCEPTION 'admin_role_locked';
  END IF;

  IF p_participant_type NOT IN ('buyer','seller','agent','developer','professional') THEN
    RAISE EXCEPTION 'invalid_participant_type';
  END IF;

  IF p_role::text <> p_participant_type THEN
    RAISE EXCEPTION 'role_participant_mismatch';
  END IF;

  IF p_role NOT IN (
    'buyer'::public.user_role,
    'seller'::public.user_role,
    'agent'::public.user_role,
    'developer'::public.user_role,
    'professional'::public.user_role
  ) THEN
    RAISE EXCEPTION 'role_not_allowed';
  END IF;

  PERFORM public.unarchive_role_data(p_user_id, p_role::text);

  IF p_role = 'professional'::public.user_role THEN
    IF nullif(trim(coalesce(p_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'professional_phone_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals pr
      WHERE pr.user_id = p_user_id AND pr.archived_at IS NULL
    ) THEN
      RAISE EXCEPTION 'professional_profile_required';
    END IF;
  END IF;

  IF p_role = 'developer'::public.user_role THEN
    IF nullif(trim(coalesce(p_display_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_display_name_required';
    END IF;
    IF nullif(trim(coalesce(p_city, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_city_required';
    END IF;
  END IF;

  IF v_was_switching AND v_old_role::text IS DISTINCT FROM p_role::text THEN
    PERFORM public.archive_role_data(p_user_id, v_old_role::text);
  END IF;

  PERFORM set_config('maiprop.onboarding_rpc_active', 'true', true);

  UPDATE public.profiles
  SET
    role = p_role,
    participant_type = p_participant_type,
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    role_switch_in_progress_at = NULL,
    updated_at = now()
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text)
  TO service_role;

COMMENT ON FUNCTION public.complete_onboarding_role_for_user(uuid, public.user_role, text, text, text, text) IS
  'Completes public onboarding/account switching for non-admin buyer, seller, agent, developer, and professional accounts. Existing admin profiles are locked out of self-service role demotion.';

DO $$
DECLARE
  v_admin_uid uuid;
  v_disabled_guard_trg boolean := false;
  v_disabled_legacy_guard boolean := false;
BEGIN
  SELECT id
    INTO v_admin_uid
  FROM auth.users
  WHERE lower(email) = 'admin@maiprop.co'
  LIMIT 1;

  IF v_admin_uid IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role_trg'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role_trg';
      v_disabled_guard_trg := true;
    END IF;

    IF EXISTS (
      SELECT 1
      FROM pg_trigger
      WHERE tgrelid = 'public.profiles'::regclass
        AND tgname = 'profiles_guard_admin_and_role'
    ) THEN
      EXECUTE 'ALTER TABLE public.profiles DISABLE TRIGGER profiles_guard_admin_and_role';
      v_disabled_legacy_guard := true;
    END IF;

    UPDATE public.profiles
    SET
      role = CASE
        WHEN user_id = v_admin_uid THEN 'admin'::public.user_role
        WHEN role = 'admin'::public.user_role THEN 'agent'::public.user_role
        ELSE role
      END,
      participant_type = CASE
        WHEN user_id = v_admin_uid THEN NULL
        WHEN role = 'admin'::public.user_role THEN 'agent'
        ELSE participant_type
      END,
      is_platform_admin = false,
      role_switch_in_progress_at = CASE
        WHEN user_id = v_admin_uid THEN NULL
        ELSE role_switch_in_progress_at
      END,
      updated_at = now()
    WHERE user_id = v_admin_uid
       OR role = 'admin'::public.user_role
       OR is_platform_admin IS DISTINCT FROM false;

    IF to_regclass('public.user_roles') IS NOT NULL THEN
      DELETE FROM public.user_roles
      WHERE role::text = 'admin'
        AND user_id <> v_admin_uid;

      EXECUTE
        'INSERT INTO public.user_roles (user_id, role) VALUES ($1, ''admin'') ON CONFLICT DO NOTHING'
        USING v_admin_uid;
    END IF;
  END IF;

  IF v_disabled_guard_trg THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;
  IF v_disabled_legacy_guard THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
  END IF;
EXCEPTION WHEN OTHERS THEN
  IF v_disabled_guard_trg THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role_trg';
  END IF;
  IF v_disabled_legacy_guard THEN
    EXECUTE 'ALTER TABLE public.profiles ENABLE TRIGGER profiles_guard_admin_and_role';
  END IF;
  RAISE;
END $$;

DO $$
DECLARE
  v_admin_uid uuid;
  v_is_admin boolean;
  v_report_limit integer;
BEGIN
  SELECT id
    INTO v_admin_uid
  FROM auth.users
  WHERE lower(email) = 'admin@maiprop.co'
  LIMIT 1;

  IF v_admin_uid IS NULL THEN
    RETURN;
  END IF;

  SELECT public.has_platform_admin(v_admin_uid)
    INTO v_is_admin;

  IF v_is_admin IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'admin@maiprop.co was not repaired to platform admin';
  END IF;

  IF to_regprocedure('public.get_report_monthly_limit(uuid)') IS NOT NULL THEN
    SELECT public.get_report_monthly_limit(v_admin_uid)
      INTO v_report_limit;

    IF COALESCE(v_report_limit, 0) < 999 THEN
      RAISE EXCEPTION 'admin@maiprop.co report limit was not repaired';
    END IF;
  END IF;
END $$;
