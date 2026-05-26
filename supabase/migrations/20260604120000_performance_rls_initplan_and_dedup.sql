-- =============================================================================
-- Performance: fix auth_rls_initplan + multiple_permissive_policies + duplicate indexes
-- + composite index for listings feed ORDER BY
--
-- Changes:
--   1. Drop 4 duplicate index pairs
--   2. Add composite index for listings feed sort (is_featured, priority_placement, created_at)
--   3. Replace bare auth.uid() with (select auth.uid()) in all RLS policies
--      → prevents per-row re-evaluation of auth.uid() (auth_rls_initplan fix)
--   4. Consolidate duplicate/overlapping permissive policies (multiple_permissive_policies fix)
-- =============================================================================


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 1. DROP DUPLICATE INDEXES
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DROP INDEX IF EXISTS public.idx_contacts_user;            -- keep idx_contacts_user_id
DROP INDEX IF EXISTS public.idx_deal_checklists_user;     -- keep idx_deal_checklists_user_id
DROP INDEX IF EXISTS public.idx_listings_is_off_market;   -- keep idx_listings_off_market
DROP INDEX IF EXISTS public.idx_portfolios_user;          -- keep idx_portfolios_user_id


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 2. COMPOSITE INDEX FOR LISTINGS FEED (slow query: ~433ms mean)
-- The main public listings query orders by is_featured DESC, priority_placement DESC,
-- created_at DESC. No existing index covers all three columns together.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE INDEX IF NOT EXISTS idx_listings_feed_sort
  ON public.listings (is_featured DESC, priority_placement DESC, created_at DESC)
  WHERE status = 'active';


-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- 3. RLS POLICY REWRITES
-- Convention: new policy names are snake_case without spaces.
-- All bare auth.uid() replaced with (select auth.uid()).
-- Duplicate permissive policies on the same table+command consolidated.
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


-- ── profiles ─────────────────────────────────────────────────────────────────
-- Was: 3 SELECT policies + separate INSERT + multiple UPDATE versions → now 1 each

DROP POLICY IF EXISTS "Users can read own profile"                    ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can read public profile fields" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile"                    ON public.profiles;
DROP POLICY IF EXISTS "Platform admin can view all profiles"          ON public.profiles;

CREATE POLICY "profiles_select" ON public.profiles FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR public.has_platform_admin((select auth.uid()))
  );

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT
  WITH CHECK (
    (select auth.uid()) = user_id
    AND role = 'individual'::public.user_role
  );

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = (select auth.uid()))
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = (select auth.uid()))
          = 'individual'::public.user_role
        AND role IN (
          'seller_landlord'::public.user_role,
          'professional'::public.user_role,
          'investor'::public.user_role,
          'institutional'::public.user_role,
          'developer'::public.user_role,
          'agent'::public.user_role
        )
      )
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = (select auth.uid()))
          = 'seller_landlord'::public.user_role
        AND role = 'individual'::public.user_role
      )
    )
  );


-- ── listings ─────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Active listings are public" ON public.listings;
DROP POLICY IF EXISTS "listings_select"        ON public.listings;
DROP POLICY IF EXISTS "Owners can insert listings"  ON public.listings;
DROP POLICY IF EXISTS "Owners can update listings"  ON public.listings;
DROP POLICY IF EXISTS "Owners can delete listings"  ON public.listings;

CREATE POLICY "listings_select" ON public.listings FOR SELECT
  USING (
    (
      status = 'active'::public.listing_status
      AND COALESCE(is_off_market, false) = false
    )
    OR (select auth.uid()) = owner_id
  );

CREATE POLICY "listings_insert" ON public.listings FOR INSERT
  WITH CHECK ((select auth.uid()) = owner_id);

CREATE POLICY "listings_update" ON public.listings FOR UPDATE
  USING ((select auth.uid()) = owner_id);

CREATE POLICY "listings_delete" ON public.listings FOR DELETE
  USING ((select auth.uid()) = owner_id);


-- ── listing_images ───────────────────────────────────────────────────────────
-- The ALL policy's SELECT branch overlaps with "Listing images are public" (SELECT true).
-- Leave the public SELECT; fix the owner ALL policy's auth.uid() call.
DROP POLICY IF EXISTS "Listing owners can manage images" ON public.listing_images;

CREATE POLICY "listing_images_owner" ON public.listing_images FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE id = listing_id AND owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE id = listing_id AND owner_id = (select auth.uid())
    )
  );


-- ── favorites ─────────────────────────────────────────────────────────────────
-- Was: 4 separate policies (SELECT/INSERT/UPDATE/DELETE) → now 1 ALL
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Users can add favorites"            ON public.favorites;
DROP POLICY IF EXISTS "Users can update favorites"         ON public.favorites;
DROP POLICY IF EXISTS "Users can remove favorites"         ON public.favorites;

CREATE POLICY "favorites_owner" ON public.favorites FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── conversations ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants can view conversations"       ON public.conversations;
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;

CREATE POLICY "conversations_select" ON public.conversations FOR SELECT
  USING (
    (select auth.uid()) = participant_a
    OR (select auth.uid()) = participant_b
  );

CREATE POLICY "conversations_insert" ON public.conversations FOR INSERT
  WITH CHECK (
    (select auth.uid()) = participant_a
    OR (select auth.uid()) = participant_b
  );


-- ── messages ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "messages_select" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;

CREATE POLICY "messages_select" ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.closed_at IS NULL
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
    )
  );

CREATE POLICY "messages_insert" ON public.messages FOR INSERT
  WITH CHECK (
    (select auth.uid()) = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND c.closed_at IS NULL
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
    )
  );


-- ── viewings ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Viewings visible to requester and owner"     ON public.viewings;
DROP POLICY IF EXISTS "Authenticated users can request viewings"    ON public.viewings;
DROP POLICY IF EXISTS "Users can update their viewings"             ON public.viewings;

CREATE POLICY "viewings_select" ON public.viewings FOR SELECT
  USING (
    (select auth.uid()) = requester_id
    OR (select auth.uid()) = owner_id
  );

CREATE POLICY "viewings_insert" ON public.viewings FOR INSERT
  WITH CHECK ((select auth.uid()) = requester_id);

CREATE POLICY "viewings_update" ON public.viewings FOR UPDATE
  USING (
    (select auth.uid()) = owner_id
    OR (select auth.uid()) = requester_id
  );


-- ── saved_searches ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can view their own saved searches"   ON public.saved_searches;
DROP POLICY IF EXISTS "Users can create their own saved searches" ON public.saved_searches;
DROP POLICY IF EXISTS "Users can update their own saved searches" ON public.saved_searches;
DROP POLICY IF EXISTS "Users can delete their own saved searches" ON public.saved_searches;

CREATE POLICY "saved_searches_owner" ON public.saved_searches FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── auction_alerts ────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can manage their own auction alerts" ON public.auction_alerts;

CREATE POLICY "auction_alerts_owner" ON public.auction_alerts FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── professionals ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can create their own professional profile" ON public.professionals;
DROP POLICY IF EXISTS "Users can update their own professional profile" ON public.professionals;

CREATE POLICY "professionals_insert" ON public.professionals FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "professionals_update" ON public.professionals FOR UPDATE
  USING ((select auth.uid()) = user_id);


-- ── professional_services ─────────────────────────────────────────────────────
-- Multiple permissive SELECT: public SELECT (true) + ALL owner policy (includes SELECT).
-- Fix auth.uid() in the ALL policy; leave public SELECT as-is.
DROP POLICY IF EXISTS "Professionals can manage own services" ON public.professional_services;

CREATE POLICY "professional_services_owner" ON public.professional_services FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = professional_id AND user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = professional_id AND user_id = (select auth.uid())
    )
  );


-- ── professional_availability ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "Professionals can manage own availability" ON public.professional_availability;

CREATE POLICY "professional_availability_owner" ON public.professional_availability FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = professional_id AND user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = professional_id AND user_id = (select auth.uid())
    )
  );


-- ── consultation_requests ─────────────────────────────────────────────────────
-- Multiple INSERT versions + multiple SELECT versions → consolidate
DROP POLICY IF EXISTS "Anyone can create consultation requests"        ON public.consultation_requests;
DROP POLICY IF EXISTS "Consultation requests insert (auth identity)"  ON public.consultation_requests;
DROP POLICY IF EXISTS "Consultation requests insert (anon no-identity)" ON public.consultation_requests;
DROP POLICY IF EXISTS "Consultation requests with identity check"     ON public.consultation_requests;
DROP POLICY IF EXISTS "Requesters can view own requests"              ON public.consultation_requests;
DROP POLICY IF EXISTS "Professionals can view their requests"         ON public.consultation_requests;
DROP POLICY IF EXISTS "Professionals can update request status"       ON public.consultation_requests;

CREATE POLICY "consultation_requests_insert_auth" ON public.consultation_requests
  FOR INSERT TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

CREATE POLICY "consultation_requests_insert_anon" ON public.consultation_requests
  FOR INSERT TO anon
  WITH CHECK (requester_id IS NULL);

CREATE POLICY "consultation_requests_select" ON public.consultation_requests FOR SELECT
  USING (
    (select auth.uid()) = requester_id
    OR EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = professional_id AND user_id = (select auth.uid())
    )
  );

CREATE POLICY "consultation_requests_update" ON public.consultation_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals
      WHERE id = professional_id AND user_id = (select auth.uid())
    )
  );


-- ── leads ─────────────────────────────────────────────────────────────────────
-- Multiple SELECT: owner + admin → consolidate into 1 with OR
DROP POLICY IF EXISTS "Users select own leads"  ON public.leads;
DROP POLICY IF EXISTS "Users insert own leads"  ON public.leads;
DROP POLICY IF EXISTS "Users update own leads"  ON public.leads;
DROP POLICY IF EXISTS "Users delete own leads"  ON public.leads;
DROP POLICY IF EXISTS "Admin select all leads"  ON public.leads;

CREATE POLICY "leads_select" ON public.leads FOR SELECT
  USING (
    owner_id = (select auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = (select auth.uid())
        AND (role = 'admin'::public.user_role OR is_platform_admin = true)
    )
  );

CREATE POLICY "leads_insert" ON public.leads FOR INSERT
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "leads_update" ON public.leads FOR UPDATE
  USING (owner_id = (select auth.uid()))
  WITH CHECK (owner_id = (select auth.uid()));

CREATE POLICY "leads_delete" ON public.leads FOR DELETE
  USING (owner_id = (select auth.uid()));


-- ── investor_subscriptions ────────────────────────────────────────────────────
-- Multiple SELECT: user + admin → consolidate
DROP POLICY IF EXISTS "Users can view their own subscription"          ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Platform admin can view all subscriptions"      ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Admins can view all subscriptions"              ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Platform admin can insert investor subscriptions" ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Admins can insert investor subscriptions"       ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Platform admin can update all subscriptions"    ON public.investor_subscriptions;

CREATE POLICY "investor_subscriptions_select" ON public.investor_subscriptions FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR public.has_platform_admin((select auth.uid()))
  );

CREATE POLICY "investor_subscriptions_insert" ON public.investor_subscriptions FOR INSERT
  WITH CHECK (public.has_platform_admin((select auth.uid())));

CREATE POLICY "investor_subscriptions_update" ON public.investor_subscriptions FOR UPDATE
  USING (public.has_platform_admin((select auth.uid())));


-- ── invitation_requests ───────────────────────────────────────────────────────
-- Multiple INSERT + multiple SELECT → consolidate
DROP POLICY IF EXISTS "Authenticated can request invitation"       ON public.invitation_requests;
DROP POLICY IF EXISTS "Anyone can submit invitation request"       ON public.invitation_requests;
DROP POLICY IF EXISTS "Platform admin can view invitation requests" ON public.invitation_requests;
DROP POLICY IF EXISTS "Platform admin can update invitation requests" ON public.invitation_requests;
DROP POLICY IF EXISTS "Users can view own invitation request"      ON public.invitation_requests;

CREATE POLICY "invitation_requests_insert_auth" ON public.invitation_requests
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id OR user_id IS NULL);

CREATE POLICY "invitation_requests_insert_anon" ON public.invitation_requests
  FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "invitation_requests_select" ON public.invitation_requests FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR public.has_platform_admin((select auth.uid()))
  );

CREATE POLICY "invitation_requests_update" ON public.invitation_requests FOR UPDATE
  USING (public.has_platform_admin((select auth.uid())));


-- ── listing_reports ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Authenticated can report"        ON public.listing_reports;
DROP POLICY IF EXISTS "Platform admin can view reports" ON public.listing_reports;

CREATE POLICY "listing_reports_insert" ON public.listing_reports FOR INSERT
  WITH CHECK ((select auth.uid()) = reporter_id);

CREATE POLICY "listing_reports_select" ON public.listing_reports FOR SELECT
  USING (public.has_platform_admin((select auth.uid())));


-- ── contacts (3 duplicate ALL policies → 1) ───────────────────────────────────
DROP POLICY IF EXISTS "Users can manage own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users manage own contacts"     ON public.contacts;
DROP POLICY IF EXISTS "contacts_owner_only"           ON public.contacts;
DROP POLICY IF EXISTS "contacts_owner"                ON public.contacts;

CREATE POLICY "contacts_owner" ON public.contacts FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── deal_checklists (2 → 1) ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own checklists"     ON public.deal_checklists;
DROP POLICY IF EXISTS "Users can manage own checklists" ON public.deal_checklists;
DROP POLICY IF EXISTS "deal_checklists_owner"           ON public.deal_checklists;

CREATE POLICY "deal_checklists_owner" ON public.deal_checklists FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── portfolios (2 → 1) ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own portfolios"     ON public.portfolios;
DROP POLICY IF EXISTS "Users can manage own portfolios" ON public.portfolios;
DROP POLICY IF EXISTS "portfolios_owner"                ON public.portfolios;

CREATE POLICY "portfolios_owner" ON public.portfolios FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── contact_tasks ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users manage own contact tasks" ON public.contact_tasks;

CREATE POLICY "contact_tasks_owner" ON public.contact_tasks FOR ALL
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);


-- ── projects (multiple duplicate SELECT + ALL → 1 SELECT + 1 ALL) ────────────
DROP POLICY IF EXISTS "Projects are publicly viewable"  ON public.projects;
DROP POLICY IF EXISTS "Owners manage own projects"      ON public.projects;
DROP POLICY IF EXISTS "Anyone can view active projects" ON public.projects;
DROP POLICY IF EXISTS "projects_public_select"          ON public.projects;
DROP POLICY IF EXISTS "projects_owner"                  ON public.projects;

CREATE POLICY "projects_select" ON public.projects FOR SELECT USING (true);

CREATE POLICY "projects_owner" ON public.projects FOR ALL
  USING ((select auth.uid()) = owner_id)
  WITH CHECK ((select auth.uid()) = owner_id);


-- ── project_media ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Project media follows project access" ON public.project_media;
DROP POLICY IF EXISTS "Owners can manage project media"      ON public.project_media;

CREATE POLICY "project_media_select" ON public.project_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id
        AND (status = 'active' OR owner_id = (select auth.uid()))
    )
  );

CREATE POLICY "project_media_owner" ON public.project_media FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  );


-- ── project_units ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Project units follow project access" ON public.project_units;
DROP POLICY IF EXISTS "Owners can manage project units"     ON public.project_units;

CREATE POLICY "project_units_select" ON public.project_units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id
        AND (status = 'active' OR owner_id = (select auth.uid()))
    )
  );

CREATE POLICY "project_units_owner" ON public.project_units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  );


-- ── project_leads ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Project leads follow project access" ON public.project_leads;
DROP POLICY IF EXISTS "Owners can manage project leads"     ON public.project_leads;

CREATE POLICY "project_leads_select" ON public.project_leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id
        AND (status = 'active' OR owner_id = (select auth.uid()))
    )
  );

CREATE POLICY "project_leads_owner" ON public.project_leads FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  );


-- ── project_views ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owners can see project views" ON public.project_views;

CREATE POLICY "project_views_select" ON public.project_views FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects
      WHERE id = project_id AND owner_id = (select auth.uid())
    )
  );


-- ── notifications ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own notifications"   ON public.notifications;
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;

CREATE POLICY "notifications_select" ON public.notifications FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "notifications_update" ON public.notifications FOR UPDATE
  USING ((select auth.uid()) = user_id);


-- ── usage tables ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users see own valuation usage"    ON public.usage_ai_valuations;
DROP POLICY IF EXISTS "Users insert own valuation usage" ON public.usage_ai_valuations;

CREATE POLICY "usage_ai_valuations_select" ON public.usage_ai_valuations FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "usage_ai_valuations_insert" ON public.usage_ai_valuations FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users see own report usage"    ON public.usage_property_reports;
DROP POLICY IF EXISTS "Users insert own report usage" ON public.usage_property_reports;

CREATE POLICY "usage_property_reports_select" ON public.usage_property_reports FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "usage_property_reports_insert" ON public.usage_property_reports FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users see own priority ad usage"    ON public.usage_priority_ads;
DROP POLICY IF EXISTS "Users insert own priority ad usage" ON public.usage_priority_ads;

CREATE POLICY "usage_priority_ads_select" ON public.usage_priority_ads FOR SELECT
  USING ((select auth.uid()) = user_id);

CREATE POLICY "usage_priority_ads_insert" ON public.usage_priority_ads FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);


-- ── open_house_settings ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Open house settings: public read"  ON public.open_house_settings;
DROP POLICY IF EXISTS "Open house settings: owner manage" ON public.open_house_settings;

CREATE POLICY "open_house_settings_select" ON public.open_house_settings FOR SELECT
  USING (true);

CREATE POLICY "open_house_settings_owner" ON public.open_house_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.owner_id = (select auth.uid())
    )
  );


-- ── open_house_registrations ──────────────────────────────────────────────────
-- Multiple permissive SELECT (ALL + owner SELECT) + multiple UPDATE (ALL + owner UPDATE)
DROP POLICY IF EXISTS "OH regs: requester read/insert/update own"          ON public.open_house_registrations;
DROP POLICY IF EXISTS "OH regs: owner read/update all for their listing"   ON public.open_house_registrations;
DROP POLICY IF EXISTS "OH regs: owner update (approval, attendance)"       ON public.open_house_registrations;

CREATE POLICY "oh_regs_requester" ON public.open_house_registrations FOR ALL
  USING (requester_id = (select auth.uid()))
  WITH CHECK (requester_id = (select auth.uid()));

CREATE POLICY "oh_regs_owner_select" ON public.open_house_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id
        AND l.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "oh_regs_owner_update" ON public.open_house_registrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id
        AND l.owner_id = (select auth.uid())
    )
  );


-- ── open_house_offers ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "OH offers: bidder insert own, read own"          ON public.open_house_offers;
DROP POLICY IF EXISTS "OH offers: owner read/update for their listing"  ON public.open_house_offers;
DROP POLICY IF EXISTS "OH offers: owner update (reveal, accept, reject)" ON public.open_house_offers;

CREATE POLICY "oh_offers_bidder" ON public.open_house_offers FOR ALL
  USING (bidder_id = (select auth.uid()))
  WITH CHECK (bidder_id = (select auth.uid()));

CREATE POLICY "oh_offers_owner_select" ON public.open_house_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_offers.listing_id
        AND l.owner_id = (select auth.uid())
    )
  );

CREATE POLICY "oh_offers_owner_update" ON public.open_house_offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_offers.listing_id
        AND l.owner_id = (select auth.uid())
    )
  );


-- ── firesale_requests ─────────────────────────────────────────────────────────
-- Multiple SELECT (user + admin + investors) + multiple UPDATE → consolidate
DROP POLICY IF EXISTS "Users can view own firesale requests"         ON public.firesale_requests;
DROP POLICY IF EXISTS "Platform admin can view all firesale requests" ON public.firesale_requests;
DROP POLICY IF EXISTS "Admins can view all firesale requests"        ON public.firesale_requests;
DROP POLICY IF EXISTS "Subscribed investors view firesale deal feed" ON public.firesale_requests;
DROP POLICY IF EXISTS "Anyone can submit a firesale request"         ON public.firesale_requests;
DROP POLICY IF EXISTS "Users can update own firesale requests"       ON public.firesale_requests;
DROP POLICY IF EXISTS "Platform admin can update firesale requests"  ON public.firesale_requests;

CREATE POLICY "firesale_requests_select" ON public.firesale_requests FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR public.has_platform_admin((select auth.uid()))
    OR (
      published_to_investors = true
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = (select auth.uid())
          AND role::text IN ('investor', 'institutional')
      )
      AND EXISTS (
        SELECT 1 FROM public.investor_subscriptions
        WHERE user_id = (select auth.uid())
          AND status IN ('active', 'trial')
      )
    )
  );

CREATE POLICY "firesale_requests_insert" ON public.firesale_requests FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

CREATE POLICY "firesale_requests_update" ON public.firesale_requests FOR UPDATE
  USING (
    (select auth.uid()) = user_id
    OR public.has_platform_admin((select auth.uid()))
  );


-- ── firesale_requests_investor_feed ──────────────────────────────────────────
DROP POLICY IF EXISTS "Eligible investors view firesale feed" ON public.firesale_requests_investor_feed;
DROP POLICY IF EXISTS "Platform admin read firesale feed"     ON public.firesale_requests_investor_feed;

CREATE POLICY "firesale_feed_select" ON public.firesale_requests_investor_feed FOR SELECT
  TO authenticated
  USING (
    public.has_platform_admin((select auth.uid()))
    OR (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = (select auth.uid())
          AND role::text IN ('investor', 'institutional')
      )
      AND EXISTS (
        SELECT 1 FROM public.investor_subscriptions
        WHERE user_id = (select auth.uid())
          AND status IN ('active', 'trial')
      )
    )
  );


-- ── firesale_interest (2 ALL → 1 user ALL + 1 admin ALL) ─────────────────────
-- Both policies are ALL but for different subjects — NOT duplicates, keep both.
-- Just fix bare auth.uid().
DROP POLICY IF EXISTS "Investors manage own firesale interest" ON public.firesale_interest;
DROP POLICY IF EXISTS "Admins manage all firesale interest"   ON public.firesale_interest;

CREATE POLICY "firesale_interest_investor" ON public.firesale_interest FOR ALL
  USING ((select auth.uid()) = investor_id)
  WITH CHECK ((select auth.uid()) = investor_id);

CREATE POLICY "firesale_interest_admin" ON public.firesale_interest FOR ALL
  USING (public.has_platform_admin((select auth.uid())));


-- ── articles ─────────────────────────────────────────────────────────────────
-- Multiple SELECT: "Published articles are publicly readable" + "Admins can read all articles" → 1
DROP POLICY IF EXISTS "Published articles are publicly readable" ON public.articles;
DROP POLICY IF EXISTS "Admins can read all articles"             ON public.articles;
DROP POLICY IF EXISTS "Admins can insert articles"               ON public.articles;
DROP POLICY IF EXISTS "Admins can update articles"               ON public.articles;
DROP POLICY IF EXISTS "Admins can delete articles"               ON public.articles;

CREATE POLICY "articles_select" ON public.articles FOR SELECT
  USING (
    published = true
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

CREATE POLICY "articles_insert" ON public.articles FOR INSERT
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));

CREATE POLICY "articles_update" ON public.articles FOR UPDATE
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));

CREATE POLICY "articles_delete" ON public.articles FOR DELETE
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));


-- ── user_roles ────────────────────────────────────────────────────────────────
-- Multiple SELECT: "Admins can read all roles" + "Users can read own roles" → 1
DROP POLICY IF EXISTS "Admins can read all roles"   ON public.user_roles;
DROP POLICY IF EXISTS "Users can read own roles"    ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update user roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete user roles" ON public.user_roles;

CREATE POLICY "user_roles_select" ON public.user_roles FOR SELECT
  USING (
    (select auth.uid()) = user_id
    OR public.has_role((select auth.uid()), 'admin'::public.app_role)
  );

CREATE POLICY "user_roles_insert" ON public.user_roles FOR INSERT
  WITH CHECK (public.has_role((select auth.uid()), 'admin'::public.app_role));

CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));

CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE
  USING (public.has_role((select auth.uid()), 'admin'::public.app_role));


-- ── listing_view_events ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Owners can see listing view events" ON public.listing_view_events;

CREATE POLICY "listing_view_events_select" ON public.listing_view_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings
      WHERE id = listing_id AND owner_id = (select auth.uid())
    )
  );


-- ── message_attachments ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Participants can view message attachments"   ON public.message_attachments;
DROP POLICY IF EXISTS "Participants can insert message attachments" ON public.message_attachments;

CREATE POLICY "message_attachments_select" ON public.message_attachments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
    )
  );

CREATE POLICY "message_attachments_insert" ON public.message_attachments FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id
        AND (c.participant_a = (select auth.uid()) OR c.participant_b = (select auth.uid()))
    )
  );


-- ── sync_log ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can view sync logs" ON public.sync_log;
DROP POLICY IF EXISTS "Allow sync log inserts"    ON public.sync_log;

CREATE POLICY "sync_log_select" ON public.sync_log FOR SELECT
  USING (public.has_role((select auth.uid()), 'agent'::public.user_role));

CREATE POLICY "sync_log_insert" ON public.sync_log FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');
