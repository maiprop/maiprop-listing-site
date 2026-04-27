-- =============================================================================
-- 20260628000000_fix_profiles_rls_recursion.sql
--
-- Fix: infinite recursion (42P17) on profiles UPDATE/SELECT when
-- auth.uid() IS NULL (anon users).
--
-- Root cause:
--   profiles_update USING calls has_platform_admin(auth.uid())
--   → has_platform_admin queries profiles (SECURITY DEFINER)
--   → profiles_select USING calls has_platform_admin(auth.uid())
--   → infinite recursion
--
-- Fix: guard has_platform_admin calls with auth.uid() IS NOT NULL
-- so anon requests short-circuit without entering the recursion.
--
-- Before: anon PATCH /profiles → HTTP 500 (42P17 infinite recursion)
-- After:  anon PATCH /profiles → HTTP 204 (0 rows affected, clean deny)
-- =============================================================================

-- 1. Fix profiles_select ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_select" ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  );

-- 2. Fix profiles_update ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND public.has_platform_admin((SELECT auth.uid()))
    )
  );
