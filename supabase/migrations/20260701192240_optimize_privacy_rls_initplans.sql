-- Optimize privacy governance RLS policies after the initial migration.
-- The first ECAS privacy migration may already be recorded in long-lived
-- staging projects, so this follow-up idempotently replaces the same policies
-- with Supabase Advisor-friendly cached authenticated-user calls.

DROP POLICY IF EXISTS "privacy_export_requests_select_own_or_admin"
  ON public.privacy_export_requests;
CREATE POLICY "privacy_export_requests_select_own_or_admin"
  ON public.privacy_export_requests
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "privacy_export_requests_insert_own"
  ON public.privacy_export_requests;
CREATE POLICY "privacy_export_requests_insert_own"
  ON public.privacy_export_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "privacy_export_requests_update_admin"
  ON public.privacy_export_requests;
CREATE POLICY "privacy_export_requests_update_admin"
  ON public.privacy_export_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "privacy_audit_log_select_admin"
  ON public.privacy_audit_log;
CREATE POLICY "privacy_audit_log_select_admin"
  ON public.privacy_audit_log
  FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));
