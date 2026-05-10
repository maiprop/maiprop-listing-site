-- Slice 1 — projects soft-archive RLS fix
--
-- Migration 20260510120000_typology_switch_cleanup.sql added an `archived_at`
-- column to public.projects and a SELECT policy that filters out archived rows
-- from the public directory. However:
--
--   - 20260604120000_performance_rls_initplan_and_dedup.sql:437-443 drops the
--     "Projects are publicly viewable" policy and recreates it as
--     `projects_select USING (true)`.
--   - 20260705000000_strict_release_advisor_fixes.sql:107-120 drops projects_select
--     again and recreates a combined SELECT policy.
--   - 20260705000000_strict_release_advisor_fixes.sql:449-461 drops projects_select
--     a final time and replaces it with two split policies:
--         projects_public_select       USING (status = 'active')
--         projects_owner_admin_select  USING (owner_id = uid() OR has_platform_admin)
--
-- Net effect: the final SELECT policy on public.projects does NOT carry the
-- `archived_at IS NULL` filter, so when a developer soft-archives via
-- begin_role_switch() / archive_role_data() the projects row is set archived
-- but remains publicly visible — defeating the soft-archive contract.
--
-- This migration runs AFTER 20260705000000 and re-creates the public SELECT
-- policy with the archive-aware filter, while leaving the owner/admin SELECT
-- intact so the owner can still see their own archived rows (so re-entering
-- the developer role can unarchive them).
--
-- Safe to re-apply: all CREATE/DROP statements use IF EXISTS guards.

DROP POLICY IF EXISTS "projects_public_select" ON public.projects;
CREATE POLICY "projects_public_select"
  ON public.projects
  FOR SELECT
  TO public
  USING (
    status = 'active'
    AND archived_at IS NULL
  );

-- Owner/admin SELECT: leave as-is (no archived filter so they can still see
-- archived rows). Re-create defensively to ensure idempotency.
DROP POLICY IF EXISTS "projects_owner_admin_select" ON public.projects;
CREATE POLICY "projects_owner_admin_select"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );
