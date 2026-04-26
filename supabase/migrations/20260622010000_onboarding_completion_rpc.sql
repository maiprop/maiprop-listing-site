-- Onboarding completion hardening:
-- 1) align profiles RLS update policy with explicit self-assignable roles
-- 2) align profile guard trigger with same role model
-- 3) add SECURITY DEFINER RPC for validated onboarding role completion

-- ── 1. Profiles UPDATE policy ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND (
      -- Keep current role
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = (SELECT auth.uid()))
      -- First onboarding (role not set yet)
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = (SELECT auth.uid())) IS NULL
        AND role IN (
          'buyer'::public.user_role,
          'seller'::public.user_role,
          'agent'::public.user_role,
          'developer'::public.user_role,
          'professional'::public.user_role
        )
      )
      -- Existing self-switch among allowed participant roles
      OR role IN (
        'buyer'::public.user_role,
        'seller'::public.user_role,
        'agent'::public.user_role,
        'developer'::public.user_role,
        'professional'::public.user_role
      )
      -- Platform admin override
      OR public.has_platform_admin((SELECT auth.uid()))
    )
  );

-- ── 2. Profiles role guard trigger ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    -- Always admin-only
    IF NEW.role = 'admin'::public.user_role THEN
      IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
        NEW.role := OLD.role;
      END IF;
    END IF;

    -- Investor/institutional remain admin-gated
    IF NEW.role IN ('investor'::public.user_role, 'institutional'::public.user_role) THEN
      IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
        NEW.role := OLD.role;
      END IF;
    END IF;

    -- Buyer/seller/agent/developer/professional are self-assignable onboarding roles
  END IF;

  RETURN NEW;
END;
$$;

-- ── 3. RPC: complete onboarding role atomically ───────────────────────────────
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

REVOKE ALL ON FUNCTION public.complete_onboarding_role(public.user_role, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_onboarding_role(public.user_role, text, text, text, text) TO authenticated;
