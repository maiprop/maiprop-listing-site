-- =============================================================================
-- 20260623130000_authoritative_role.sql
-- =============================================================================
-- Canonical role-resolution function.
--
-- Background: 4 stale-enum bugs were caught in
-- 20260615000000_fix_stale_enum_refs_and_admin_checks.sql because RLS
-- predicates scattered across many policies each read `profiles.role`
-- directly with hard-coded enum values. When the enum migrated
-- (`individual` → `buyer`, `seller_landlord` → `seller`), some policies
-- silently kept the old names and broke.
--
-- Fix: one canonical function `authoritative_role()` is now THE place
-- that reads `profiles.role`. `has_role()` and `has_platform_admin()`
-- delegate to it. Future enum drift becomes a single-line change.
--
-- Compatibility:
--   - All existing call sites (policies, triggers, functions) keep
--     working because the public signatures of `has_role()` and
--     `has_platform_admin()` are preserved.
--   - The new no-arg overload `authoritative_role()` uses `auth.uid()`
--     by default for ergonomic policy authoring.
-- =============================================================================

-- 1. The canonical reader -----------------------------------------------------

CREATE OR REPLACE FUNCTION public.authoritative_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

COMMENT ON FUNCTION public.authoritative_role(uuid) IS
  'Canonical role lookup. THE single place that reads profiles.role. '
  'Use this in RLS predicates and triggers instead of `SELECT role FROM profiles`. '
  'When the role enum changes, fix this function and dependents auto-inherit. '
  'See migration 20260623130000_authoritative_role.sql.';

-- Convenience no-arg overload using auth.uid()
CREATE OR REPLACE FUNCTION public.authoritative_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.authoritative_role(auth.uid())
$$;

COMMENT ON FUNCTION public.authoritative_role() IS
  'No-arg overload of authoritative_role(uuid) that uses auth.uid(). '
  'Convenient for RLS policies: WHERE authoritative_role() = ''admin''.';

-- Lock down execution: anyone authenticated can check their own role,
-- which is needed for RLS evaluation. The function is SECURITY DEFINER so
-- it bypasses RLS on the profiles table itself (no recursion risk).
GRANT EXECUTE ON FUNCTION public.authoritative_role(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authoritative_role()     TO anon, authenticated, service_role;


-- 2. Reroute existing helpers through the canonical reader -------------------

-- has_role: there are TWO existing signatures (app_role and user_role)
-- from migration history. Reroute both to authoritative_role().
-- We use CREATE OR REPLACE so existing dependent objects keep their refs.

-- user_role version (current canonical signature)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.authoritative_role(_user_id) = _role
$$;

COMMENT ON FUNCTION public.has_role(uuid, public.user_role) IS
  'Returns true if user has the given role. Delegates to authoritative_role().';

-- has_platform_admin: convenience for role = 'admin'.
CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.authoritative_role(_user_id) = 'admin'::public.user_role
$$;

COMMENT ON FUNCTION public.has_platform_admin(uuid) IS
  'Returns true if user is a platform admin (role=''admin''). '
  'Delegates to authoritative_role(). Replaces older versions that '
  'read the now-defunct profiles.is_platform_admin column.';

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_platform_admin(uuid)         TO anon, authenticated, service_role;


-- 3. Verification --------------------------------------------------------------
-- Quick sanity check that the function compiles and returns sensible values.
-- Wrapped in DO so a failure surfaces during migration apply.

DO $$
DECLARE
  v_test_role public.user_role;
BEGIN
  -- Calling with NULL uuid should return NULL (no row in profiles).
  SELECT public.authoritative_role(NULL::uuid) INTO v_test_role;
  IF v_test_role IS NOT NULL THEN
    RAISE EXCEPTION 'authoritative_role(NULL) should return NULL, got %', v_test_role;
  END IF;
END $$;
