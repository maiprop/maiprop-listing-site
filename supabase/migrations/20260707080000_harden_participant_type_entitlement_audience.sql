-- Harden entitlement audience against user-writable participant_type drift.
--
-- Keep this after 20260707070000_audience_scoped_pro_entitlements.sql so the
-- SQL Pro helpers inherit the stricter profile_pricing_audience() resolver
-- without editing the migration owned by the audience-scoped entitlement work.

CREATE OR REPLACE FUNCTION public.profile_pricing_audience(
  p_role public.user_role,
  p_participant_type text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN 'participant'
    WHEN p_role IN (
      'agent'::public.user_role,
      'developer'::public.user_role,
      'professional'::public.user_role,
      'investor'::public.user_role,
      'institutional'::public.user_role
    ) THEN p_role::text
    WHEN p_role = 'admin'::public.user_role THEN 'agent'
    WHEN p_role IS NULL AND p_participant_type IN ('buyer', 'seller', 'participant', 'pro', 'user') THEN 'participant'
    ELSE NULL
  END
$$;

COMMENT ON FUNCTION public.profile_pricing_audience(public.user_role, text) IS
  'Normalizes authoritative profiles.role to pricing_configs.audience. participant_type is only a legacy fallback for participant audience values.';

REVOKE ALL ON FUNCTION public.profile_pricing_audience(public.user_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_pricing_audience(public.user_role, text) TO authenticated, service_role;

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
  v_is_admin boolean := public.has_platform_admin((SELECT auth.uid()));
BEGIN
  -- is_platform_admin column flips remain admin-only.
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT v_is_admin THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
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
  'BEFORE UPDATE trigger on public.profiles. Enforces admin-only privileged fields, RPC-only role and non-null participant_type changes, and role/participant_type alignment for self-service onboarding.';

DROP TRIGGER IF EXISTS profiles_guard_admin_and_role ON public.profiles;
DROP TRIGGER IF EXISTS profiles_guard_admin_and_role_trg ON public.profiles;
CREATE TRIGGER profiles_guard_admin_and_role_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_admin_and_role();

DO $$
BEGIN
  IF public.profile_pricing_audience('buyer'::public.user_role, 'developer') <> 'participant' THEN
    RAISE EXCEPTION 'buyer role must not inherit developer participant_type audience';
  END IF;

  IF public.profile_pricing_audience('developer'::public.user_role, 'buyer') <> 'developer' THEN
    RAISE EXCEPTION 'developer role must remain developer audience despite participant_type mismatch';
  END IF;

  IF public.profile_pricing_audience(NULL::public.user_role, 'developer') IS NOT NULL THEN
    RAISE EXCEPTION 'participant_type fallback must not grant high-trust/professional audience without role';
  END IF;

  IF public.profile_pricing_audience(NULL::public.user_role, 'seller') <> 'participant' THEN
    RAISE EXCEPTION 'legacy seller participant_type fallback should map only to participant audience';
  END IF;
END $$;
