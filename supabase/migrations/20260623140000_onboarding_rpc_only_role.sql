-- =============================================================================
-- 20260623140000_onboarding_rpc_only_role.sql
-- =============================================================================
-- Force all role changes through `complete_onboarding_role()`.
--
-- Problem: today there are TWO paths to set `profiles.role`:
--   (1) The validated SECURITY DEFINER RPC `complete_onboarding_role()`.
--   (2) A direct UPDATE allowed by the `profiles_update` RLS policy from
--       migration 20260622010000, which permits any of the five
--       "onboarding" roles (buyer/seller/agent/developer/professional)
--       to be self-assigned without going through the RPC's checks
--       (e.g. developer requires city, professional requires phone +
--       a `professionals` row).
--
-- Two paths = two surfaces that have to stay correct. This migration
-- closes path (2) by:
--   - Marking the RPC's UPDATE with a session-local sentinel so the
--     guard trigger can recognise its own modifications.
--   - Tightening `profiles_guard_admin_and_role()` so role changes by
--     non-admin sessions raise unless the sentinel is set.
--
-- Safe rollout:
--   - Onboarding.tsx already calls the RPC (verified
--     src/pages/Onboarding.tsx:84). No client change needed.
--   - Admins can still change roles via direct UPDATE (admin override
--     in trigger).
--   - The session-local config auto-resets at end of transaction
--     (set_config(..., is_local => true)), so it cannot leak across
--     requests on a pooled connection.
-- =============================================================================

-- 1. Update the RPC to set the sentinel before its UPDATE -------------------

CREATE OR REPLACE FUNCTION public.complete_onboarding_role(
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
  v_uid uuid;
BEGIN
  v_uid := (SELECT auth.uid());
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE user_id = v_uid) THEN
    RAISE EXCEPTION 'profile_not_found';
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

  IF p_role = 'developer'::public.user_role THEN
    IF NULLIF(trim(COALESCE(p_display_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_display_name_required';
    END IF;
    IF NULLIF(trim(COALESCE(p_city, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_city_required';
    END IF;
  END IF;

  IF p_role = 'professional'::public.user_role THEN
    IF NULLIF(trim(COALESCE(p_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'professional_phone_required';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.professionals pr WHERE pr.user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'professional_profile_required';
    END IF;
  END IF;

  -- Sentinel for the guard trigger. is_local => true means it auto-clears
  -- at end of transaction; cannot leak across pooled requests.
  PERFORM set_config('maiprop.onboarding_rpc_active', 'true', true);

  UPDATE public.profiles
  SET
    role = p_role,
    participant_type = p_participant_type,
    display_name = COALESCE(NULLIF(trim(p_display_name), ''), display_name),
    city = COALESCE(NULLIF(trim(p_city), ''), city),
    phone = COALESCE(NULLIF(trim(p_phone), ''), phone),
    updated_at = now()
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;


-- 2. Tighten the guard trigger ----------------------------------------------

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
    -- Admins can change anyone's role via direct UPDATE for moderation /
    -- support workflows. Skip remaining gates for admin sessions.
    IF v_is_admin THEN
      -- Allow.
      NULL;
    ELSE
      -- Non-admin sessions: role changes are ONLY permitted via the
      -- complete_onboarding_role RPC, which sets the session sentinel.
      -- Direct UPDATEs that bypass the RPC (e.g. via supabase-js) get
      -- rejected with a clear error so the bug surfaces during dev.
      IF NOT v_via_rpc THEN
        RAISE EXCEPTION
          'role_change_via_direct_update_not_permitted: '
          'use rpc("complete_onboarding_role", {...}) instead';
      END IF;

      -- Within the RPC, admin/investor/institutional are still admin-only
      -- regardless. (The RPC validates these too, but defence-in-depth.)
      IF NEW.role IN (
        'admin'::public.user_role,
        'investor'::public.user_role,
        'institutional'::public.user_role
      ) THEN
        RAISE EXCEPTION
          'role_not_self_assignable: %', NEW.role;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_guard_admin_and_role() IS
  'BEFORE UPDATE trigger on public.profiles. Enforces:'
  '  - is_platform_admin column flips are admin-only.'
  '  - role changes by non-admin sessions MUST go through the '
  '    complete_onboarding_role() RPC (detected via the '
  '    maiprop.onboarding_rpc_active session-local config).'
  '  - admin/investor/institutional roles are never self-assignable.';

-- The trigger should already exist from earlier migrations; recreate for
-- safety in case it was dropped.
DROP TRIGGER IF EXISTS profiles_guard_admin_and_role_trg ON public.profiles;
CREATE TRIGGER profiles_guard_admin_and_role_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_admin_and_role();


-- 3. Tighten the UPDATE policy ----------------------------------------------
-- The policy now expresses ONLY the ownership rule. The trigger handles
-- the role-change invariant. Defence in depth, single responsibility.

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (
    (SELECT auth.uid()) = user_id
    OR public.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR public.has_platform_admin((SELECT auth.uid()))
  );
