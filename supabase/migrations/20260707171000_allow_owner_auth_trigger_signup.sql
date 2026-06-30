-- Allow the trusted auth.users owner-grant trigger to finish profile setup
-- without weakening direct client updates to profiles.role or participant_type.

CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_via_rpc boolean := COALESCE(
    current_setting('maiprop.onboarding_rpc_active', true),
    'false'
  ) = 'true';
  v_via_owner_auth_trigger boolean := COALESCE(
    current_setting('maiprop.owner_auth_trigger_active', true),
    'false'
  ) = 'true';
  v_is_admin boolean := public.has_platform_admin((SELECT auth.uid()));
BEGIN
  -- is_platform_admin column flips remain admin-only.
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT v_is_admin THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;

  -- The owner auth trigger runs as SECURITY DEFINER immediately after a new
  -- auth.users row is inserted. It sets a local transaction marker before it
  -- writes the initial trusted owner role.
  IF v_via_owner_auth_trigger THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF v_is_admin THEN
      NULL;
    ELSE
      IF NOT v_via_rpc THEN
        RAISE EXCEPTION
          'role_change_via_direct_update_not_permitted: '
          'use rpc("complete_onboarding_role", {...}) instead';
      END IF;

      IF NEW.role IN (
        'admin'::public.user_role,
        'investor'::public.user_role,
        'institutional'::public.user_role
      ) THEN
        RAISE EXCEPTION
          'role_not_self_assignable: %', NEW.role;
      END IF;

      IF NEW.participant_type IS NULL OR NEW.role::text IS DISTINCT FROM NEW.participant_type THEN
        RAISE EXCEPTION
          'role_participant_mismatch: role % does not match participant_type %',
          NEW.role,
          NEW.participant_type;
      END IF;
    END IF;
  END IF;

  IF NEW.participant_type IS DISTINCT FROM OLD.participant_type THEN
    IF v_is_admin THEN
      NULL;
    ELSIF NEW.participant_type IS NULL
      AND NEW.role IS NOT DISTINCT FROM OLD.role
      AND NEW.role_switch_in_progress_at IS NOT NULL THEN
      -- begin_role_switch() intentionally clears participant_type before the
      -- completion RPC writes a new aligned role/participant_type pair.
      NULL;
    ELSE
      IF NOT v_via_rpc THEN
        RAISE EXCEPTION
          'participant_type_change_via_direct_update_not_permitted: '
          'use rpc("complete_onboarding_role", {...}) instead';
      END IF;

      IF NEW.participant_type IS NULL OR NEW.role::text IS DISTINCT FROM NEW.participant_type THEN
        RAISE EXCEPTION
          'role_participant_mismatch: role % does not match participant_type %',
          NEW.role,
          NEW.participant_type;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_guard_admin_and_role() IS
  'BEFORE UPDATE trigger on public.profiles. Enforces admin-only privileged fields, RPC-only role and non-null participant_type changes, role/participant_type alignment for self-service onboarding, and a narrow owner-auth-trigger exception for initial trusted owner grants.';

DROP TRIGGER IF EXISTS profiles_guard_admin_and_role ON public.profiles;
DROP TRIGGER IF EXISTS profiles_guard_admin_and_role_trg ON public.profiles;
CREATE TRIGGER profiles_guard_admin_and_role_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_admin_and_role();

CREATE OR REPLACE FUNCTION public.auto_grant_owner_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := LOWER(COALESCE(NEW.email, ''));
BEGIN
  IF v_email IN ('kr@maiprop.co', 'kostisrenios@gmail.com') THEN
    PERFORM set_config('maiprop.owner_auth_trigger_active', 'true', true);
  END IF;

  IF LOWER(COALESCE(NEW.email, '')) = 'kr@maiprop.co' THEN
    UPDATE public.profiles
    SET role = 'admin'::public.user_role,
        participant_type = NULL,
        updated_at = now()
    WHERE user_id = NEW.id;
  ELSIF LOWER(COALESCE(NEW.email, '')) = 'kostisrenios@gmail.com' THEN
    UPDATE public.profiles
    SET role = 'agent'::public.user_role,
        participant_type = 'agent',
        updated_at = now()
    WHERE user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_grant_owner_privileges() IS
  'AFTER INSERT trigger on auth.users. Grants trusted owner roles for known maiprop owner emails and marks only that trigger transaction so profiles_guard_admin_and_role accepts the initial role write.';

DROP TRIGGER IF EXISTS on_auth_user_created_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_owner
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_grant_owner_privileges();
