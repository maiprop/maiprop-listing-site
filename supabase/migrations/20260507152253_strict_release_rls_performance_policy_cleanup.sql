-- Strict release performance cleanup for RLS policies.
-- This migration is intentionally conservative:
-- 1. Drop legacy duplicate policies where an equivalent optimized policy already exists.
-- 2. Wrap request-level auth helpers in SELECT subqueries so Postgres can initPlan them.
-- 3. Do not change the business-level access model.

-- Legacy duplicate policies replaced by newer optimized policies.
DROP POLICY IF EXISTS "Authenticated users can create conversations" ON public.conversations;
DROP POLICY IF EXISTS "Participants can view conversations" ON public.conversations;
DROP POLICY IF EXISTS "Users can manage their own favorites" ON public.favorites;
DROP POLICY IF EXISTS "Owners can manage listing images" ON public.listing_images;
DROP POLICY IF EXISTS "Participants can insert message attachments" ON public.message_attachments;
DROP POLICY IF EXISTS "Participants can view message attachments" ON public.message_attachments;
DROP POLICY IF EXISTS "Conversation participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "Participants can view messages" ON public.messages;
DROP POLICY IF EXISTS "Users can send messages" ON public.messages;
DROP POLICY IF EXISTS "Users can update received messages" ON public.messages;

-- firesale_interest --------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.firesale_interest') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Investors read own firesale interest" ON public.firesale_interest;
    CREATE POLICY "Investors read own firesale interest"
    ON public.firesale_interest
    FOR SELECT
    TO public
    USING ((SELECT auth.uid()) = investor_id);

    DROP POLICY IF EXISTS "Investors update own firesale interest" ON public.firesale_interest;
    CREATE POLICY "Investors update own firesale interest"
    ON public.firesale_interest
    FOR UPDATE
    TO public
    USING ((SELECT auth.uid()) = investor_id)
    WITH CHECK ((SELECT auth.uid()) = investor_id);

    DROP POLICY IF EXISTS "Investors delete own firesale interest" ON public.firesale_interest;
    CREATE POLICY "Investors delete own firesale interest"
    ON public.firesale_interest
    FOR DELETE
    TO public
    USING ((SELECT auth.uid()) = investor_id);

    DROP POLICY IF EXISTS "Investors with active subscription insert firesale interest" ON public.firesale_interest;
    CREATE POLICY "Investors with active subscription insert firesale interest"
    ON public.firesale_interest
    FOR INSERT
    TO public
    WITH CHECK (
      (SELECT auth.uid()) = investor_id
      AND EXISTS (
        SELECT 1
        FROM public.investor_subscriptions
        WHERE investor_subscriptions.user_id = (SELECT auth.uid())
          AND investor_subscriptions.status = ANY (ARRAY['active'::text, 'trial'::text])
      )
    );
  END IF;
END;
$$;

-- firesale_requests --------------------------------------------------------
DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals" ON public.firesale_requests;
CREATE POLICY "Eligible buyers view published Quick Sale deals"
ON public.firesale_requests
FOR SELECT
TO authenticated
USING (
  published_to_investors = true
  AND EXISTS (
    SELECT 1
    FROM public.investor_subscriptions
    WHERE investor_subscriptions.user_id = (SELECT auth.uid())
      AND investor_subscriptions.status = ANY (ARRAY['active'::text, 'trial'::text])
  )
);

-- listings -----------------------------------------------------------------
DO $$
BEGIN
  IF to_regprocedure('public.check_listing_quota()') IS NOT NULL THEN
    DROP POLICY IF EXISTS listing_insert_quota ON public.listings;
    CREATE POLICY listing_insert_quota
    ON public.listings
    FOR INSERT
    TO authenticated
    WITH CHECK (
      owner_id = (SELECT auth.uid())
      AND (SELECT public.check_listing_quota())
    );
  END IF;
END;
$$;

-- new_building_leads -------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.new_building_leads') IS NOT NULL THEN
    DROP POLICY IF EXISTS user_insert_own_new_building_lead ON public.new_building_leads;
    CREATE POLICY user_insert_own_new_building_lead
    ON public.new_building_leads
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

    DROP POLICY IF EXISTS user_or_owner_select_new_building_lead ON public.new_building_leads;
    CREATE POLICY user_or_owner_select_new_building_lead
    ON public.new_building_leads
    FOR SELECT
    TO public
    USING (
      user_id = (SELECT auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.listings l
        WHERE l.id = new_building_leads.new_building_id
          AND l.owner_id = (SELECT auth.uid())
      )
    );
  END IF;
END;
$$;

-- properties and marketing leads ------------------------------------------
DROP POLICY IF EXISTS "Admins can insert properties" ON public.properties;
CREATE POLICY "Admins can insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "Admins can read all leads" ON public.marketing_leads;
CREATE POLICY "Admins can read all leads"
ON public.marketing_leads
FOR SELECT
TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "Authenticated users can submit leads" ON public.marketing_leads;
CREATE POLICY "Authenticated users can submit leads"
ON public.marketing_leads
FOR INSERT
TO authenticated
WITH CHECK (
  NOT (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  AND char_length(full_name) >= 2
  AND char_length(full_name) <= 200
  AND char_length(email) >= 5
  AND char_length(email) <= 254
  AND char_length(phone) >= 5
  AND char_length(phone) <= 30
  AND investment_budget >= 0
);

-- role switch history ------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.role_switch_history') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Users can read own role switch history" ON public.role_switch_history;
    CREATE POLICY "Users can read own role switch history"
    ON public.role_switch_history
    FOR SELECT
    TO public
    USING ((SELECT auth.uid()) = user_id);

    DROP POLICY IF EXISTS "Admins can read all role switch history" ON public.role_switch_history;
    CREATE POLICY "Admins can read all role switch history"
    ON public.role_switch_history
    FOR SELECT
    TO public
    USING (
      EXISTS (
        SELECT 1
        FROM public.profiles
        WHERE profiles.user_id = (SELECT auth.uid())
          AND profiles.is_platform_admin = true
      )
    );
  END IF;
END;
$$;

-- private owner alerts and profiles ----------------------------------------
DROP POLICY IF EXISTS "Users manage own private owner alerts" ON public.private_owner_ad_alerts;
CREATE POLICY "Users manage own private owner alerts"
ON public.private_owner_ad_alerts
FOR ALL
TO public
USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own participant_type" ON public.profiles;
CREATE POLICY "Users update own participant_type"
ON public.profiles
FOR UPDATE
TO public
USING ((SELECT auth.uid()) = user_id)
WITH CHECK ((SELECT auth.uid()) = user_id);

-- service-role-only internal tables ----------------------------------------
DROP POLICY IF EXISTS "Service role can insert send log" ON public.email_send_log;
CREATE POLICY "Service role can insert send log"
ON public.email_send_log
FOR INSERT
TO public
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can read send log" ON public.email_send_log;
CREATE POLICY "Service role can read send log"
ON public.email_send_log
FOR SELECT
TO public
USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can update send log" ON public.email_send_log;
CREATE POLICY "Service role can update send log"
ON public.email_send_log
FOR UPDATE
TO public
USING ((SELECT auth.role()) = 'service_role'::text)
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can manage send state" ON public.email_send_state;
CREATE POLICY "Service role can manage send state"
ON public.email_send_state
FOR ALL
TO public
USING ((SELECT auth.role()) = 'service_role'::text)
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can insert tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can insert tokens"
ON public.email_unsubscribe_tokens
FOR INSERT
TO public
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can read tokens" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can read tokens"
ON public.email_unsubscribe_tokens
FOR SELECT
TO public
USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can mark tokens as used" ON public.email_unsubscribe_tokens;
CREATE POLICY "Service role can mark tokens as used"
ON public.email_unsubscribe_tokens
FOR UPDATE
TO public
USING ((SELECT auth.role()) = 'service_role'::text)
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can insert suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can insert suppressed emails"
ON public.suppressed_emails
FOR INSERT
TO public
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS "Service role can read suppressed emails" ON public.suppressed_emails;
CREATE POLICY "Service role can read suppressed emails"
ON public.suppressed_emails
FOR SELECT
TO public
USING ((SELECT auth.role()) = 'service_role'::text);

DROP POLICY IF EXISTS sync_log_insert ON public.sync_log;
CREATE POLICY sync_log_insert
ON public.sync_log
FOR INSERT
TO public
WITH CHECK ((SELECT auth.role()) = 'service_role'::text);
