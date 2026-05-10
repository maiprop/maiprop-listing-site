-- Slice 1 — Typology switch cleanup
--
-- Fixes the following issues identified in the typology audit:
--
--   SW-1  SettingsSection clears participant_type and bio but leaves role
--         stale, so getParticipantTypeFromProfile() falls back to role and
--         keeps the user in their old typology until onboarding completes.
--   SW-2  Role-specific data (professional profile + child rows, developer
--         projects) stays attached and PUBLICLY READABLE after a switch.
--   SW-3  Re-entering the same role after a round-trip is not idempotent —
--         the existing professionals row is reused but services/availability
--         are appended, creating duplicates.
--
-- Design:
--
--   1. profiles.role_switch_in_progress_at — sentinel column set by
--      begin_role_switch() and cleared by complete_onboarding_role_for_user().
--      The role column itself is NOT NULL DEFAULT 'individual', so we can't
--      null it; instead app code consults this sentinel.
--
--   2. archived_at on professionals + projects — soft-archive flag set when
--      the user switches AWAY from a role. Public SELECT policies hide
--      archived rows; the owner and platform admin can still read them so
--      switching back restores the row.
--
--   3. Child tables (professional_services, professional_availability,
--      consultation_requests) are filtered transitively via the parent
--      professionals row in their public SELECT policies — no per-table
--      column needed.
--
--   4. Three new SECURITY DEFINER RPCs:
--        - begin_role_switch()          : caller-context, called from the
--                                         dashboard Settings page when the
--                                         user clicks "Switch role".
--        - archive_role_data(uid, role) : service-role only, called from
--                                         complete_onboarding_role_for_user.
--        - unarchive_role_data(uid, r)  : service-role only, called from
--                                         complete_onboarding_role_for_user
--                                         to restore previously-archived rows
--                                         when the user re-enters a role.
--
--   5. complete_onboarding_role_for_user is updated to:
--        - read the OLD role + role_switch_in_progress_at flag,
--        - unarchive the destination role's rows BEFORE running the
--          professional_profile_required prerequisite check (so the existing
--          archived professionals row satisfies it),
--        - archive the previous role's rows after validation,
--        - clear role_switch_in_progress_at on completion.

-- ── 1. profiles.role_switch_in_progress_at ────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_switch_in_progress_at timestamptz;

COMMENT ON COLUMN public.profiles.role_switch_in_progress_at IS
  'Set by begin_role_switch() when the user initiates a typology switch from '
  'the dashboard Settings page. Cleared by complete_onboarding_role_for_user() '
  'on commit. While set, app code treats the user as ''in transition'' and '
  'avoids falling back to the (still-stale) role column for typology resolution.';

-- ── 2. archived_at columns ────────────────────────────────────────────────────
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.professionals.archived_at IS
  'Soft-archive flag set when the user switches away from the professional '
  'typology. Public SELECT hides archived rows; owner + platform admin can '
  'still read them so re-switching back to professional restores the row.';

CREATE INDEX IF NOT EXISTS idx_professionals_archived_at
  ON public.professionals (user_id) WHERE archived_at IS NOT NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.projects.archived_at IS
  'Soft-archive flag set when the developer switches away from the developer '
  'typology. Same access semantics as professionals.archived_at.';

CREATE INDEX IF NOT EXISTS idx_projects_archived_at
  ON public.projects (owner_id) WHERE archived_at IS NOT NULL;

-- ── 3. Public SELECT policies — hide archived rows ────────────────────────────
-- professionals: public can see non-archived rows; owner + admin always.
DROP POLICY IF EXISTS "Professionals are publicly viewable" ON public.professionals;
CREATE POLICY "Professionals are publicly viewable"
  ON public.professionals FOR SELECT
  USING (
    archived_at IS NULL
    OR (select auth.uid()) = user_id
    OR public.has_platform_admin((select auth.uid()))
  );

-- professional_services: filter via parent. Existing public SELECT policy was
-- defined in the original 20260309194824 migration as "Professional services
-- are publicly viewable". Tighten it now to exclude services owned by
-- archived professionals.
DROP POLICY IF EXISTS "Professional services are publicly viewable" ON public.professional_services;
DROP POLICY IF EXISTS "Services are publicly viewable" ON public.professional_services;
CREATE POLICY "Professional services are publicly viewable"
  ON public.professional_services FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_services.professional_id
        AND (
          p.archived_at IS NULL
          OR p.user_id = (select auth.uid())
          OR public.has_platform_admin((select auth.uid()))
        )
    )
  );

-- professional_availability: same shape.
DROP POLICY IF EXISTS "Availability is publicly viewable" ON public.professional_availability;
CREATE POLICY "Availability is publicly viewable"
  ON public.professional_availability FOR SELECT
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_availability.professional_id
        AND (
          p.archived_at IS NULL
          OR p.user_id = (select auth.uid())
          OR public.has_platform_admin((select auth.uid()))
        )
    )
  );

-- projects: hide archived rows from the public.
DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects;
CREATE POLICY "Projects are publicly viewable"
  ON public.projects FOR SELECT
  USING (
    archived_at IS NULL
    OR (select auth.uid()) = owner_id
    OR public.has_platform_admin((select auth.uid()))
  );

-- ── 4. begin_role_switch() — caller-context RPC ───────────────────────────────
-- Called from SettingsSection.handleSwitchRole.
--
-- Atomic: clears participant_type + bio AND archives the leaving role's
-- public-facing data in a single transaction, so the user disappears from
-- the public directory the moment they click "switch role".
CREATE OR REPLACE FUNCTION public.begin_role_switch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (select auth.uid());
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  -- Archive role-specific public-facing data for the leaving role.
  IF v_role = 'professional'::public.user_role THEN
    UPDATE public.professionals
    SET archived_at = now(), updated_at = now()
    WHERE user_id = v_uid AND archived_at IS NULL;
  ELSIF v_role = 'developer'::public.user_role THEN
    UPDATE public.projects
    SET archived_at = now(), updated_at = now()
    WHERE owner_id = v_uid AND archived_at IS NULL;
  END IF;

  -- Clear typology pointers and stamp the in-progress sentinel.
  -- We cannot clear the role column itself (NOT NULL DEFAULT 'individual'),
  -- so app code consults role_switch_in_progress_at instead of falling back
  -- to role when participant_type is NULL.
  UPDATE public.profiles
  SET
    participant_type = NULL,
    bio = NULL,
    role_switch_in_progress_at = now(),
    updated_at = now()
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_role_switch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_role_switch() TO authenticated;

COMMENT ON FUNCTION public.begin_role_switch() IS
  'Initiates a typology switch for the calling user. Clears participant_type + '
  'bio, stamps role_switch_in_progress_at, and soft-archives role-specific '
  'public-facing rows (professionals, projects) for the leaving role. Called '
  'from the dashboard Settings page; complete_onboarding_role_for_user() '
  'finalises the switch by clearing the sentinel and unarchiving the '
  'destination role''s rows when applicable.';

-- ── 5. archive_role_data / unarchive_role_data — service-role helpers ────────
CREATE OR REPLACE FUNCTION public.archive_role_data(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'archive_role_data_user_id_required';
  END IF;

  IF p_role = 'professional' THEN
    UPDATE public.professionals
    SET archived_at = now(), updated_at = now()
    WHERE user_id = p_user_id AND archived_at IS NULL;
  ELSIF p_role = 'developer' THEN
    UPDATE public.projects
    SET archived_at = now(), updated_at = now()
    WHERE owner_id = p_user_id AND archived_at IS NULL;
  END IF;
  -- buyer / seller / agent / investor / institutional: no role-specific
  -- public-facing rows to archive at this time. Future migrations can
  -- extend this when those roles gain dedicated tables (e.g. agent_profiles).
END;
$$;

REVOKE ALL ON FUNCTION public.archive_role_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_role_data(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.unarchive_role_data(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'unarchive_role_data_user_id_required';
  END IF;

  IF p_role = 'professional' THEN
    UPDATE public.professionals
    SET archived_at = NULL, updated_at = now()
    WHERE user_id = p_user_id AND archived_at IS NOT NULL;
  ELSIF p_role = 'developer' THEN
    UPDATE public.projects
    SET archived_at = NULL, updated_at = now()
    WHERE owner_id = p_user_id AND archived_at IS NOT NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.unarchive_role_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unarchive_role_data(uuid, text) TO service_role;

-- ── 6. complete_onboarding_role_for_user — switch-aware ──────────────────────
-- Replaces 20260623140000_onboarding_rpc_only_role.sql:
--   - Reads OLD role + role_switch_in_progress_at sentinel.
--   - Unarchives destination-role rows BEFORE the prerequisite check so the
--     existing archived professionals row (if the user is switching back to
--     professional) satisfies professional_profile_required.
--   - Archives the previous role's rows after validation passes.
--   - Clears role_switch_in_progress_at on commit.
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
    IF nullif(trim(coalesce(p_display_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_display_name_required';
    END IF;
    IF nullif(trim(coalesce(p_city, '')), '') IS NULL THEN
      RAISE EXCEPTION 'developer_city_required';
    END IF;
  END IF;

  -- Restore destination-role rows (idempotent — no-op when the user is
  -- onboarding into this role for the first time).
  PERFORM public.unarchive_role_data(p_user_id, p_role::text);

  -- Professional prerequisite — checked AFTER unarchive so a re-entering
  -- professional satisfies it via their previously-archived row.
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

  -- Archive the leaving role's data when switching to a new role.
  IF v_was_switching AND v_old_role::text IS DISTINCT FROM p_role::text THEN
    PERFORM public.archive_role_data(p_user_id, v_old_role::text);
  END IF;

  -- Sentinel for the guard trigger (allows role changes via this RPC).
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
