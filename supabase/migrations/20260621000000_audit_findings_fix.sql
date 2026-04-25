-- ============================================================
-- 20260621000000_audit_findings_fix.sql
-- Addresses P1–P4 findings from the 2026-04-20 full audit.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- P1-1: listings_insert quota bypass
-- Two permissive INSERT policies exist on listings:
--   "listings_insert"      (20260604) — no quota check (simpler, wins the OR)
--   "listing_insert_quota" (20260612) — with check_listing_quota()
-- PostgreSQL ORs permissive policies; the quota is bypassed by the first.
-- Fix: drop the unguarded policy; listing_insert_quota is sufficient.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "listings_insert" ON public.listings;


-- ─────────────────────────────────────────────────────────────
-- P1-2: messages — column-level UPDATE restriction
-- The BEFORE UPDATE trigger guard_message_receiver_update protects
-- content at runtime, but the RLS WITH CHECK clause is identical to
-- USING and places no column-level restriction.  A column-level GRANT
-- makes the schema self-enforcing regardless of trigger state.
-- ─────────────────────────────────────────────────────────────
-- Ensure read_at exists (was added via manual edits in some prod environments)
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
REVOKE UPDATE ON public.messages FROM authenticated;
GRANT  UPDATE (status, read_at) ON public.messages TO authenticated;


-- ─────────────────────────────────────────────────────────────
-- P1-3: Email infrastructure tables — unreachable service_role RLS policies
-- auth.role() = 'service_role' is never true for JWT-authenticated
-- requests.  service_role bypasses RLS entirely, so these policies
-- never fire.  Replace with explicit has_platform_admin() SELECT
-- policies so admins can read the email audit trail via the JS client.
-- ─────────────────────────────────────────────────────────────

-- email_send_log
DROP POLICY IF EXISTS "Service role can read send log"   ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "email_send_log_admin_select"
  ON public.email_send_log FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

-- email_send_state
DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "email_send_state_admin_select"
  ON public.email_send_state FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

-- suppressed_emails
DROP POLICY IF EXISTS "Service role can read suppressed emails"   ON public.suppressed_emails;
DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
CREATE POLICY "suppressed_emails_admin_select"
  ON public.suppressed_emails FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

-- email_unsubscribe_tokens
DROP POLICY IF EXISTS "Service role can read tokens"         ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can insert tokens"       ON public.email_unsubscribe_tokens;
DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "email_unsubscribe_tokens_admin_select"
  ON public.email_unsubscribe_tokens FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));


-- ─────────────────────────────────────────────────────────────
-- P2-3: sync_log_insert regression
-- 20260414130000 deliberately removed the open INSERT policy to prevent
-- client-side log pollution.  20260604120000 re-added it.  Drop again.
-- service_role (which bypasses RLS) is the only legitimate writer.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "sync_log_insert" ON public.sync_log;


-- ─────────────────────────────────────────────────────────────
-- P2-6: role_switch_history admin SELECT — dead is_platform_admin check
-- is_platform_admin is always false after the role-unification migrations.
-- The platform admin cannot read the role-switch audit trail.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can read all role switch history" ON public.role_switch_history;
CREATE POLICY "role_switch_history_admin_select"
  ON public.role_switch_history FOR SELECT
  USING (public.has_platform_admin((SELECT auth.uid())));


-- ─────────────────────────────────────────────────────────────
-- P2-7: new_building_leads — bare auth.uid() + no admin read path
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_insert_own_new_building_lead"     ON public.new_building_leads;
DROP POLICY IF EXISTS "user_or_owner_select_new_building_lead" ON public.new_building_leads;

CREATE POLICY "new_building_leads_insert"
  ON public.new_building_leads FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY "new_building_leads_select"
  ON public.new_building_leads FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = new_building_leads.new_building_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );


-- ─────────────────────────────────────────────────────────────
-- P3-1: firesale_requests — investor branch reinstated by 20260604
-- 20260318 introduced firesale_requests_investor_feed to keep sensitive
-- columns (contact details, internal notes) hidden from investors.
-- 20260604 consolidated SELECT policies and re-exposed the full table.
-- Remove the investor branch; investors read only from the sanitised feed.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "firesale_requests_select" ON public.firesale_requests;
CREATE POLICY "firesale_requests_select" ON public.firesale_requests FOR SELECT
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR public.has_platform_admin((SELECT auth.uid()))
  );


-- ─────────────────────────────────────────────────────────────
-- P3-2: admin_audit_log — inconsistent admin check
-- Uses user_roles.role = 'admin' instead of the canonical has_platform_admin().
-- A platform admin without a user_roles row cannot read the audit log.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS admin_audit_log_select ON public.admin_audit_log;
DROP POLICY IF EXISTS "admin_audit_log_select" ON public.admin_audit_log;
CREATE POLICY "admin_audit_log_select"
  ON public.admin_audit_log FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));


-- ─────────────────────────────────────────────────────────────
-- P3-3: listing_view_events + project_views — WITH CHECK (true) allows
-- insertion of view events for non-existent entities, enabling fake
-- view count inflation without going through the increment RPC.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Anyone can insert listing view" ON public.listing_view_events;
CREATE POLICY "Anyone can insert listing view"
  ON public.listing_view_events FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE id = listing_view_events.listing_id
    )
  );

DROP POLICY IF EXISTS "Anyone can insert project view" ON public.project_views;
CREATE POLICY "Anyone can insert project view"
  ON public.project_views FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_views.project_id
    )
  );


-- ─────────────────────────────────────────────────────────────
-- P4-1: profiles_public SELECT — always-true condition written as role check
-- auth.role() IN ('anon', 'authenticated') is always true.
-- Express the intent explicitly as USING (true).
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "profiles_public_select" ON public.profiles_public;
CREATE POLICY "profiles_public_select"
  ON public.profiles_public FOR SELECT
  TO anon, authenticated
  USING (true);


-- ─────────────────────────────────────────────────────────────
-- P4-2: expire-featured-listings cron — missing idempotent unschedule guard
-- Reschedule with guard to prevent duplicate jobs on re-run.
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-featured-listings') THEN
    PERFORM cron.unschedule('expire-featured-listings');
  END IF;
  PERFORM cron.schedule(
    'expire-featured-listings',
    '0 * * * *',
    'SELECT public.expire_featured_listings()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available: %. Skipping expire-featured-listings reschedule.', SQLERRM;
END $$;
