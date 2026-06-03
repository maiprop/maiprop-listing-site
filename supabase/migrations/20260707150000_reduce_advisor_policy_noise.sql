-- Reduce Supabase advisor RLS policy noise where consolidation is mechanical
-- and business semantics can be preserved exactly:
--   - replace FOR ALL write policies with explicit INSERT/UPDATE/DELETE where
--     SELECT is already covered by a separate policy,
--   - merge public-read and owner/admin SELECT policies into one policy,
--   - merge owner/admin UPDATE/DELETE policies with OR-equivalent predicates,
--   - remove the stale unguarded listings_insert policy so listing creation is
--     governed only by listing_insert_quota.

BEGIN;

-- P0 business invariant: direct listing inserts must pass quota checks.
DROP POLICY IF EXISTS "listings_insert" ON public.listings;

-- agent_data_input_bans: admin SELECT remains in agent_data_input_bans_select.
DROP POLICY IF EXISTS "agent_data_input_bans_admin_write" ON public.agent_data_input_bans;
DROP POLICY IF EXISTS "agent_data_input_bans_admin_insert" ON public.agent_data_input_bans;
DROP POLICY IF EXISTS "agent_data_input_bans_admin_update" ON public.agent_data_input_bans;
DROP POLICY IF EXISTS "agent_data_input_bans_admin_delete" ON public.agent_data_input_bans;

CREATE POLICY "agent_data_input_bans_admin_insert"
  ON public.agent_data_input_bans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND private.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "agent_data_input_bans_admin_update"
  ON public.agent_data_input_bans
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND private.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "agent_data_input_bans_admin_delete"
  ON public.agent_data_input_bans
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND private.has_platform_admin((SELECT auth.uid()))
  );

-- ai_usage_limits: all authenticated users can SELECT limits; only admins write.
DROP POLICY IF EXISTS "ai_usage_limits_admin_write" ON public.ai_usage_limits;
DROP POLICY IF EXISTS "ai_usage_limits_admin_insert" ON public.ai_usage_limits;
DROP POLICY IF EXISTS "ai_usage_limits_admin_update" ON public.ai_usage_limits;
DROP POLICY IF EXISTS "ai_usage_limits_admin_delete" ON public.ai_usage_limits;

CREATE POLICY "ai_usage_limits_admin_insert"
  ON public.ai_usage_limits
  FOR INSERT
  TO authenticated
  WITH CHECK (private.has_platform_admin((SELECT auth.uid())));

CREATE POLICY "ai_usage_limits_admin_update"
  ON public.ai_usage_limits
  FOR UPDATE
  TO authenticated
  USING (private.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (private.has_platform_admin((SELECT auth.uid())));

CREATE POLICY "ai_usage_limits_admin_delete"
  ON public.ai_usage_limits
  FOR DELETE
  TO authenticated
  USING (private.has_platform_admin((SELECT auth.uid())));

-- Articles: public can read published articles; admins can read drafts too.
DROP POLICY IF EXISTS "articles_admin_select" ON public.articles;
DROP POLICY IF EXISTS "articles_public_select" ON public.articles;
DROP POLICY IF EXISTS "articles_select" ON public.articles;

CREATE POLICY "articles_select"
  ON public.articles
  FOR SELECT
  TO public
  USING (
    published = true
    OR private.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

-- Leads: owner and admin access are equivalent to the previous two policies.
DROP POLICY IF EXISTS "Admin select all leads" ON public.leads;
DROP POLICY IF EXISTS "Users select own leads" ON public.leads;
DROP POLICY IF EXISTS "leads_select" ON public.leads;

CREATE POLICY "leads_select"
  ON public.leads
  FOR SELECT
  TO public
  USING (
    owner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = (SELECT auth.uid())
        AND profiles.role = 'admin'::user_role
    )
  );

DROP POLICY IF EXISTS "Admins can update leads" ON public.leads;
DROP POLICY IF EXISTS "Users update own leads" ON public.leads;
DROP POLICY IF EXISTS "leads_update" ON public.leads;

CREATE POLICY "leads_update"
  ON public.leads
  FOR UPDATE
  TO public
  USING (
    owner_id = (SELECT auth.uid())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND private.has_role((SELECT auth.uid()), 'admin'::app_role)
    )
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND private.has_role((SELECT auth.uid()), 'admin'::app_role)
    )
  );

-- Marketing leads: preserve public submission policies, consolidate read/write.
DROP POLICY IF EXISTS "Admin select all leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "Admins can read all leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "leads_select" ON public.marketing_leads;
DROP POLICY IF EXISTS "marketing_leads_admin_select" ON public.marketing_leads;
DROP POLICY IF EXISTS "marketing_leads_select" ON public.marketing_leads;

CREATE POLICY "marketing_leads_select"
  ON public.marketing_leads
  FOR SELECT
  TO public
  USING (
    owner_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = (SELECT auth.uid())
        AND (
          profiles.role = 'admin'::user_role
          OR profiles.is_platform_admin = true
        )
    )
    OR private.has_role((SELECT auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins can update leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "leads_update" ON public.marketing_leads;
DROP POLICY IF EXISTS "marketing_leads_update" ON public.marketing_leads;

CREATE POLICY "marketing_leads_update"
  ON public.marketing_leads
  FOR UPDATE
  TO public
  USING (
    owner_id = (SELECT auth.uid())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND private.has_role((SELECT auth.uid()), 'admin'::app_role)
    )
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND private.has_role((SELECT auth.uid()), 'admin'::app_role)
    )
  );

DROP POLICY IF EXISTS "Admins can delete leads" ON public.marketing_leads;
DROP POLICY IF EXISTS "leads_delete" ON public.marketing_leads;
DROP POLICY IF EXISTS "marketing_leads_delete" ON public.marketing_leads;

CREATE POLICY "marketing_leads_delete"
  ON public.marketing_leads
  FOR DELETE
  TO public
  USING (
    owner_id = (SELECT auth.uid())
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND private.has_role((SELECT auth.uid()), 'admin'::app_role)
    )
  );

-- Messages: preserve sender edits and receiver mark-read as one OR policy.
DROP POLICY IF EXISTS "messages_receiver_mark_read" ON public.messages;
DROP POLICY IF EXISTS "messages_sender_update" ON public.messages;
DROP POLICY IF EXISTS "messages_update" ON public.messages;

CREATE POLICY "messages_update"
  ON public.messages
  FOR UPDATE
  TO public
  USING (
    sender_id = (SELECT auth.uid())
    OR (
      sender_id <> (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (
            c.participant_a = (SELECT auth.uid())
            OR c.participant_b = (SELECT auth.uid())
          )
      )
    )
  )
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    OR (
      sender_id <> (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.conversations c
        WHERE c.id = messages.conversation_id
          AND (
            c.participant_a = (SELECT auth.uid())
            OR c.participant_b = (SELECT auth.uid())
          )
      )
    )
  );

-- Professional directory SELECT policies: public visible rows plus owner/admin.
DROP POLICY IF EXISTS "Professionals are publicly viewable" ON public.professionals;
DROP POLICY IF EXISTS "Professionals are viewable by owner or admin" ON public.professionals;
DROP POLICY IF EXISTS "professionals_select" ON public.professionals;

CREATE POLICY "professionals_select"
  ON public.professionals
  FOR SELECT
  TO public
  USING (
    archived_at IS NULL
    OR (SELECT auth.uid()) = user_id
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Professional services are publicly viewable" ON public.professional_services;
DROP POLICY IF EXISTS "Professional services are viewable by owner or admin" ON public.professional_services;
DROP POLICY IF EXISTS "professional_services_select" ON public.professional_services;

CREATE POLICY "professional_services_select"
  ON public.professional_services
  FOR SELECT
  TO public
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_services.professional_id
        AND (
          p.archived_at IS NULL
          OR p.user_id = (SELECT auth.uid())
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "Availability is publicly viewable" ON public.professional_availability;
DROP POLICY IF EXISTS "Availability is viewable by owner or admin" ON public.professional_availability;
DROP POLICY IF EXISTS "professional_availability_select" ON public.professional_availability;

CREATE POLICY "professional_availability_select"
  ON public.professional_availability
  FOR SELECT
  TO public
  USING (
    is_active = true
    AND EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_availability.professional_id
        AND (
          p.archived_at IS NULL
          OR p.user_id = (SELECT auth.uid())
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

-- Professional reviews: preserve owner and admin write access with one policy.
DROP POLICY IF EXISTS "reviews_admin_delete" ON public.professional_reviews;
DROP POLICY IF EXISTS "reviews_delete_own" ON public.professional_reviews;
DROP POLICY IF EXISTS "reviews_delete" ON public.professional_reviews;

CREATE POLICY "reviews_delete"
  ON public.professional_reviews
  FOR DELETE
  TO public
  USING (
    (SELECT auth.uid()) = reviewer_id
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "reviews_admin_update" ON public.professional_reviews;
DROP POLICY IF EXISTS "reviews_update_own" ON public.professional_reviews;
DROP POLICY IF EXISTS "reviews_update" ON public.professional_reviews;

CREATE POLICY "reviews_update"
  ON public.professional_reviews
  FOR UPDATE
  TO public
  USING (
    (SELECT auth.uid()) = reviewer_id
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = reviewer_id
    OR private.has_platform_admin((SELECT auth.uid()))
  );

-- Projects: public active projects plus owner/admin visibility; owner writes remain.
DROP POLICY IF EXISTS "projects_public_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_admin_select" ON public.projects;
DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_update" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_delete" ON public.projects;

CREATE POLICY "projects_select"
  ON public.projects
  FOR SELECT
  TO public
  USING (
    (status = 'active'::text AND archived_at IS NULL)
    OR owner_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "projects_owner_insert"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "projects_owner_update"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

CREATE POLICY "projects_owner_delete"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- Project leads: owner writes remain; owner/admin SELECT remains separate.
DROP POLICY IF EXISTS "project_leads_owner" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_insert" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_update" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_delete" ON public.project_leads;

CREATE POLICY "project_leads_owner_insert"
  ON public.project_leads
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_leads.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_leads_owner_update"
  ON public.project_leads
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_leads.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_leads.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_leads_owner_delete"
  ON public.project_leads
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_leads.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

-- Role-switch history: users read own rows; platform admins read all rows.
DROP POLICY IF EXISTS "Admins can read all role switch history" ON public.role_switch_history;
DROP POLICY IF EXISTS "Users can read own role switch history" ON public.role_switch_history;
DROP POLICY IF EXISTS "role_switch_history_select" ON public.role_switch_history;

CREATE POLICY "role_switch_history_select"
  ON public.role_switch_history
  FOR SELECT
  TO public
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.user_id = (SELECT auth.uid())
        AND profiles.is_platform_admin = true
    )
  );

-- Profiles: profiles_update already allows owner/admin updates.
DROP POLICY IF EXISTS "Users update own participant_type" ON public.profiles;

COMMIT;
