-- =============================================================================
-- 20260705000000_strict_release_advisor_fixes.sql
-- =============================================================================
-- Strict release remediation for live advisor findings reviewed on 2026-05-07.
--
-- Scope:
--   1. Pin search_path on functions flagged as mutable.
--   2. Reduce EXECUTE grants on high-risk SECURITY DEFINER RPCs.
--   3. Remove public project_leads SELECT access to PII-bearing rows.
--   4. Remove permissive duplicate projects policies and keep active-only public read.
--   5. Replace contact_submissions WITH CHECK true with bounded validation.
--   6. Add missing FK indexes surfaced by the performance advisor.
--   7. Drop duplicate favorites index covered by the unique constraint.
--   8. Attempt to move pg_net out of public when the extension is movable.
-- =============================================================================

-- 1. Pin mutable search_path findings ----------------------------------------

DO $$
BEGIN
  IF to_regprocedure('public.agent_data_input_max_per_month()') IS NOT NULL THEN
    ALTER FUNCTION public.agent_data_input_max_per_month()
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.agent_data_input_discount_pct_per_input()') IS NOT NULL THEN
    ALTER FUNCTION public.agent_data_input_discount_pct_per_input()
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.guard_sensitive_profile_columns()') IS NOT NULL THEN
    ALTER FUNCTION public.guard_sensitive_profile_columns()
      SET search_path = public, pg_temp;
  END IF;

  IF to_regprocedure('public.tg_agent_data_inputs_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.tg_agent_data_inputs_updated_at()
      SET search_path = public, pg_temp;
  END IF;
END $$;


-- 2. Reduce high-risk SECURITY DEFINER execute grants ------------------------
-- Keep user-callable RPCs on authenticated only. Keep service-role-only Stripe
-- credit application off anon/authenticated entirely.

DO $$
BEGIN
  IF to_regprocedure('public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.admin_review_agent_data_input(uuid,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) FROM anon;
    GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.agent_data_input_quota(uuid)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.agent_data_input_quota(UUID) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.agent_data_input_quota(UUID) FROM anon;
    GRANT EXECUTE ON FUNCTION public.agent_data_input_quota(UUID) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.submit_agent_data_input(DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.submit_agent_data_input(DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM anon;
    GRANT EXECUTE ON FUNCTION public.submit_agent_data_input(DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;
  END IF;

  IF to_regprocedure('public.apply_verified_data_input_discount(uuid,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT) FROM anon;
    REVOKE ALL ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.apply_verified_data_input_discount(UUID, TEXT) TO service_role;
  END IF;
END $$;


-- 3. project_leads contains PII; remove public active-project SELECT ----------

DROP POLICY IF EXISTS "project_leads_select" ON public.project_leads;
DROP POLICY IF EXISTS "Project leads follow project access" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_or_admin_select" ON public.project_leads;

CREATE POLICY "project_leads_owner_or_admin_select"
  ON public.project_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_leads.project_id
        AND (
          p.owner_id = (SELECT auth.uid())
          OR public.has_platform_admin((SELECT auth.uid()))
        )
    )
  );


-- 4. projects: keep active public read, remove stale always-true duplicate ----

DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner" ON public.projects;
DROP POLICY IF EXISTS "Public can view active projects" ON public.projects;
DROP POLICY IF EXISTS "Owners can manage projects" ON public.projects;

CREATE POLICY "projects_select"
  ON public.projects
  FOR SELECT
  TO public
  USING (
    status = 'active'
    OR owner_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "projects_owner"
  ON public.projects
  FOR ALL
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));


-- 5. contact_submissions: bounded public insert instead of WITH CHECK true ----

DROP POLICY IF EXISTS "Anyone can submit contact form" ON public.contact_submissions;

CREATE POLICY "Anyone can submit contact form"
  ON public.contact_submissions
  FOR INSERT
  TO public
  WITH CHECK (
    email IS NOT NULL
    AND length(trim(email)) BETWEEN 3 AND 320
    AND position('@' in email) > 1
    AND length(coalesce(message, '')) <= 2000
    AND length(coalesce(listing_title, '')) <= 500
    AND length(coalesce(company, '')) <= 200
    AND length(coalesce(name, '')) <= 200
  );


-- 6. Advisor FK indexes ------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_agent_data_input_bans_banned_by
  ON public.agent_data_input_bans (banned_by);
CREATE INDEX IF NOT EXISTS idx_agent_data_inputs_reviewed_by
  ON public.agent_data_inputs (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_auction_alerts_user_id
  ON public.auction_alerts (user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_listing_id
  ON public.contacts (listing_id);
CREATE INDEX IF NOT EXISTS idx_favorites_listing_id
  ON public.favorites (listing_id);
CREATE INDEX IF NOT EXISTS idx_firesale_requests_user_id
  ON public.firesale_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_requests_user_id
  ON public.invitation_requests (user_id);
CREATE INDEX IF NOT EXISTS idx_leads_professional_id
  ON public.leads (professional_id);
CREATE INDEX IF NOT EXISTS idx_leads_project_id
  ON public.leads (project_id);
CREATE INDEX IF NOT EXISTS idx_listing_view_events_viewer_id
  ON public.listing_view_events (viewer_id);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_leads' AND column_name = 'listing_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_marketing_leads_listing_id
      ON public.marketing_leads (listing_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_leads' AND column_name = 'owner_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_marketing_leads_owner_id
      ON public.marketing_leads (owner_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_leads' AND column_name = 'professional_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_marketing_leads_professional_id
      ON public.marketing_leads (professional_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'marketing_leads' AND column_name = 'project_id'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_marketing_leads_project_id
      ON public.marketing_leads (project_id);
  END IF;
END;
$$;
CREATE INDEX IF NOT EXISTS idx_messages_receiver_id
  ON public.messages (receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id
  ON public.messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_open_house_offers_decided_by
  ON public.open_house_offers (decided_by);
CREATE INDEX IF NOT EXISTS idx_open_house_registrations_approved_by
  ON public.open_house_registrations (approved_by);
CREATE INDEX IF NOT EXISTS idx_professional_reviews_reviewer_id
  ON public.professional_reviews (reviewer_id);
CREATE INDEX IF NOT EXISTS idx_project_units_listing_id
  ON public.project_units (listing_id);
CREATE INDEX IF NOT EXISTS idx_project_views_viewer_id
  ON public.project_views (viewer_id);
CREATE INDEX IF NOT EXISTS idx_usage_ai_valuations_listing_id
  ON public.usage_ai_valuations (listing_id);
CREATE INDEX IF NOT EXISTS idx_usage_priority_ads_listing_id
  ON public.usage_priority_ads (listing_id);
CREATE INDEX IF NOT EXISTS idx_usage_property_reports_listing_id
  ON public.usage_property_reports (listing_id);
CREATE INDEX IF NOT EXISTS idx_viewings_owner_id
  ON public.viewings (owner_id);


-- 7. Duplicate index cleanup -------------------------------------------------

DROP INDEX IF EXISTS public.idx_favorites_user_listing;


-- 8. Revoke direct RPC access to trigger/admin/internal SECURITY DEFINER funcs -

DO $$
DECLARE
  fn regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.agent_data_inputs_check_insert()'::regprocedure,
    'public.agent_data_inputs_guard_admin_columns()'::regprocedure,
    'public.auto_grant_owner_privileges()'::regprocedure,
    'public.check_ai_call_monthly_limit_trigger()'::regprocedure,
    'public.check_auction_alert_limit()'::regprocedure,
    'public.check_auction_alert_on_update()'::regprocedure,
    'public.check_listing_limit()'::regprocedure,
    'public.check_priority_ad_limit()'::regprocedure,
    'public.check_priority_ad_monthly_limit()'::regprocedure,
    'public.check_report_limit()'::regprocedure,
    'public.check_report_monthly_limit()'::regprocedure,
    'public.check_saved_search_alert_on_update()'::regprocedure,
    'public.check_saved_search_limit()'::regprocedure,
    'public.check_valuation_limit()'::regprocedure,
    'public.check_valuation_monthly_limit()'::regprocedure,
    'public.check_viewing_limit()'::regprocedure,
    'public.contact_submissions_rate_limit()'::regprocedure,
    'public.guard_message_receiver_update()'::regprocedure,
    'public.notify_oh_registration_status_change()'::regprocedure,
    'public.professionals_guard_subscription_tier()'::regprocedure,
    'public.profiles_guard_admin_and_role()'::regprocedure,
    'public.sync_firesale_investor_feed()'::regprocedure,
    'public.sync_professional_rating()'::regprocedure,
    'public.sync_profiles_public()'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.grant_platform_admin(UUID) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.grant_platform_admin(UUID) TO service_role;

  REVOKE ALL ON FUNCTION public.grant_platform_admin_by_email(TEXT) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.grant_platform_admin_by_email(TEXT) TO service_role;

  REVOKE ALL ON FUNCTION public.seed_grant_agent_role(UUID[]) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.seed_grant_agent_role(UUID[]) TO service_role;

  REVOKE ALL ON FUNCTION public.seed_grant_role(UUID[], TEXT) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.seed_grant_role(UUID[], TEXT) TO service_role;

  REVOKE ALL ON FUNCTION public.enqueue_email(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.enqueue_email(TEXT, JSONB) TO service_role;

  REVOKE ALL ON FUNCTION public.read_email_batch(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.read_email_batch(TEXT, INTEGER, INTEGER) TO service_role;

  REVOKE ALL ON FUNCTION public.delete_email(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.delete_email(TEXT, BIGINT) TO service_role;

  REVOKE ALL ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.move_to_dlq(TEXT, TEXT, BIGINT, JSONB) TO service_role;

  REVOKE ALL ON FUNCTION public.expire_featured_listings() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.expire_featured_listings() TO service_role;

  REVOKE ALL ON FUNCTION public.expire_past_auctions() FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.expire_past_auctions() TO service_role;
END $$;

DO $$
BEGIN
  REVOKE ALL ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.complete_onboarding_role(public.user_role, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.authoritative_role() FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.authoritative_role() TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.authoritative_role(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.authoritative_role(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_agent_data_input_status(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_agent_data_input_status(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_agent_monthly_input_count(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_agent_monthly_input_count(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_ai_call_monthly_limit(UUID, TEXT) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_ai_call_monthly_limit(UUID, TEXT) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_auction_alert_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_auction_alert_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_listing_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_listing_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_priority_ad_monthly_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_report_monthly_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_report_monthly_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_saved_search_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_saved_search_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_search_alert_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_search_alert_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_valuation_monthly_limit(UUID) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_valuation_monthly_limit(UUID) TO authenticated, service_role;

  REVOKE ALL ON FUNCTION public.get_viewing_limit(UUID, BOOLEAN) FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.get_viewing_limit(UUID, BOOLEAN) TO authenticated, service_role;
END $$;


-- 9. Remove public bucket listing policies -----------------------------------

DROP POLICY IF EXISTS "Email assets are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Firesale photos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "project_media_select" ON storage.objects;
DROP POLICY IF EXISTS "Property images are publicly accessible" ON storage.objects;


-- 10. Split helper-based public policies and remove anon RPC grants ----------

DROP POLICY IF EXISTS articles_select ON public.articles;
DROP POLICY IF EXISTS articles_public_select ON public.articles;
DROP POLICY IF EXISTS articles_admin_select ON public.articles;
CREATE POLICY articles_public_select
  ON public.articles
  FOR SELECT
  TO public
  USING (published = true);
CREATE POLICY articles_admin_select
  ON public.articles
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
DROP POLICY IF EXISTS articles_insert ON public.articles;
CREATE POLICY articles_insert
  ON public.articles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Platform admin can read submissions" ON public.contact_submissions;
CREATE POLICY "Platform admin can read submissions"
  ON public.contact_submissions
  FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS firesale_interest_admin ON public.firesale_interest;
CREATE POLICY firesale_interest_admin
  ON public.firesale_interest
  FOR ALL
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS investor_subscriptions_insert ON public.investor_subscriptions;
CREATE POLICY investor_subscriptions_insert
  ON public.investor_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));
DROP POLICY IF EXISTS investor_subscriptions_select ON public.investor_subscriptions;
CREATE POLICY investor_subscriptions_select
  ON public.investor_subscriptions
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id) OR public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS invitation_requests_select ON public.invitation_requests;
CREATE POLICY invitation_requests_select
  ON public.invitation_requests
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id) OR public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS listing_reports_select ON public.listing_reports;
CREATE POLICY listing_reports_select
  ON public.listing_reports
  FOR SELECT
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS pricing_configs_insert ON public.pricing_configs;
CREATE POLICY pricing_configs_insert
  ON public.pricing_configs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id) OR public.has_platform_admin((SELECT auth.uid())));
DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (((SELECT auth.uid()) = user_id) OR public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (((SELECT auth.uid()) = user_id) OR public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS projects_select ON public.projects;
DROP POLICY IF EXISTS projects_public_select ON public.projects;
DROP POLICY IF EXISTS projects_owner_admin_select ON public.projects;
CREATE POLICY projects_public_select
  ON public.projects
  FOR SELECT
  TO public
  USING (status = 'active');
CREATE POLICY projects_owner_admin_select
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()) OR public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS sync_log_select ON public.sync_log;
CREATE POLICY sync_log_select
  ON public.sync_log
  FOR SELECT
  TO authenticated
  USING (public.has_role((SELECT auth.uid()), 'agent'::public.user_role) OR public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS user_roles_insert ON public.user_roles;
CREATE POLICY user_roles_insert
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role((SELECT auth.uid()), 'admin'::public.app_role));
DROP POLICY IF EXISTS user_roles_select ON public.user_roles;
CREATE POLICY user_roles_select
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (((SELECT auth.uid()) = user_id) OR public.has_role((SELECT auth.uid()), 'admin'::public.app_role));

DROP POLICY IF EXISTS professionals_insert ON public.professionals;
CREATE POLICY professionals_insert
  ON public.professionals
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);
DROP POLICY IF EXISTS professionals_update ON public.professionals;
CREATE POLICY professionals_update
  ON public.professionals
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS professional_services_owner ON public.professional_services;
CREATE POLICY professional_services_owner
  ON public.professional_services
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_services.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_services.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS professional_availability_owner ON public.professional_availability;
CREATE POLICY professional_availability_owner
  ON public.professional_availability
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_availability.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.professionals
      WHERE professionals.id = professional_availability.professional_id
        AND professionals.user_id = (SELECT auth.uid())
    )
  );

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)',
    'public.admin_review_agent_data_input(uuid,text,text)',
    'public.agent_data_input_quota(uuid)',
    'public.check_ai_quota(text)',
    'public.check_listing_quota()',
    'public.complete_onboarding_role(public.user_role,text,text,text,text)',
    'public.get_agent_data_input_status(uuid)',
    'public.get_agent_monthly_input_count(uuid)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_report_monthly_limit(uuid)',
    'public.get_saved_search_limit(uuid)',
    'public.get_search_alert_limit(uuid)',
    'public.get_valuation_monthly_limit(uuid)',
    'public.get_viewing_limit(uuid,boolean)',
    'public.has_buy_side_role(uuid)',
    'public.has_platform_admin(uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.has_role(uuid,public.user_role)',
    'public.has_sell_side_role(uuid)',
    'public.is_pro(uuid)',
    'public.record_ai_call(text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.get_professionals_with_priority(text)',
    'public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)',
    'public.admin_review_agent_data_input(uuid,text,text)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.agent_data_input_quota(uuid)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)',
    'public.get_agent_data_input_status(uuid)',
    'public.get_agent_monthly_input_count(uuid)',
    'public.check_ai_quota(text)',
    'public.record_ai_call(text)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_report_monthly_limit(uuid)',
    'public.get_saved_search_limit(uuid)',
    'public.get_search_alert_limit(uuid)',
    'public.get_valuation_monthly_limit(uuid)',
    'public.get_viewing_limit(uuid,boolean)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.increment_listing_views(uuid)',
    'public.record_listing_view_event(uuid,uuid)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.complete_onboarding_role(public.user_role,text,text,text,text)');
BEGIN
  IF fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END IF;
END $$;

DO $$
DECLARE
  fn regprocedure := to_regprocedure('public.is_pro(uuid)');
BEGIN
  IF fn IS NOT NULL THEN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END IF;
END $$;


-- 11. pg_net extension schema ------------------------------------------------

DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS extensions;

  IF EXISTS (
    SELECT 1
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE e.extname = 'pg_net'
      AND n.nspname = 'public'
  ) THEN
    ALTER EXTENSION pg_net SET SCHEMA extensions;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_net schema move skipped: %', SQLERRM;
END $$;
