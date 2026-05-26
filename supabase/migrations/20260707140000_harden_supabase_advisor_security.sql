-- Harden live Supabase advisor findings after the already-applied future
-- migration chain. Keep app-facing RPCs callable only by the roles that use
-- them, remove bucket enumeration policies, and make realtime RLS expressions
-- planner-friendly without changing video room authorization semantics.

-- 1. Pin mutable function search_path findings.
DO $$
DECLARE
  fn regprocedure;
BEGIN
  fn := to_regprocedure('public.agent_data_input_discount_pct_per_input()');
  IF fn IS NOT NULL THEN
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, pg_temp', fn);
  END IF;
END $$;


-- 2. Trigger/cron/internal SECURITY DEFINER functions must not be directly
-- executable through the Data API. Triggers and scheduled jobs run with their
-- owning/service context, so end-user EXECUTE grants are unnecessary exposure.
DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.agent_data_inputs_validate_closing_date()',
    'public.audit_firesale_interest_mutation()',
    'public.enforce_professional_pro_consultation_request()',
    'public.guard_open_house_registration_insert()',
    'public.guard_open_house_registration_update()',
    'public.handle_new_user()',
    'public.invoke_send_saved_search_alerts_cron()',
    'public.profiles_guard_account_moderation()',
    'public.sync_profile_role_from_investor_subscription()',
    'public.admin_review_agent_data_input(uuid,text,text)',
    'public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;


-- 3. App-facing SECURITY DEFINER RPCs keep authenticated access where the
-- frontend still calls them, but lose PUBLIC/anon/default EXECUTE.
DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_ban_reported_content_owner(uuid,text)',
    'public.admin_broadcast_notification(text,text,text,text,text)',
    'public.admin_resolve_listing_report(uuid)',
    'public.admin_set_firesale_investor_publication(uuid,boolean)',
    'public.admin_suspend_reported_listing(uuid,text)',
    'public.admin_update_firesale_interest_workflow(uuid,text,integer,boolean,text,numeric)',
    'public.admin_update_firesale_pipeline_deal(uuid,text,text,numeric)',
    'public.authoritative_role()',
    'public.authoritative_role(uuid)',
    'public.begin_role_switch()',
    'public.can_review_professional(uuid,uuid)',
    'public.check_ai_quota(text)',
    'public.check_listing_quota()',
    'public.complete_onboarding_role(public.user_role,text,text,text,text)',
    'public.create_open_house_registration(uuid,integer,text,text,text,text,text,boolean,boolean,boolean)',
    'public.get_agent_monthly_input_count(uuid)',
    'public.get_ai_call_monthly_limit(uuid,text)',
    'public.get_auction_alert_limit(uuid)',
    'public.get_auction_listing_visible_limit(uuid)',
    'public.get_contact_monthly_limit(uuid)',
    'public.get_listing_limit(uuid)',
    'public.get_my_role()',
    'public.get_open_house_rsvp_monthly_limit(uuid)',
    'public.get_priority_ad_monthly_limit(uuid)',
    'public.get_professionals_per_category_limit(uuid)',
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
    'public.record_role_switch_audit(text,text,text,boolean,boolean)',
    'public.release_expired_firesale_reservations(uuid)',
    'public.reserve_ai_quota(text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text)',
    'public.submit_agent_data_input(date,text,text,text,numeric,text,text,text,text,text,text,text)',
    'public.submit_firesale_interest(uuid,text,numeric,text)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn);
    END IF;
  END LOOP;
END $$;


-- 4. Public buckets still serve objects by URL, but storage.objects SELECT
-- policies allow API bucket listing. Remove the broad list/read policies.
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Listing images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Property images are publicly accessible" ON storage.objects;


-- 5. Recreate realtime video-room policies with current_setting() wrapped in
-- scalar SELECTs so Supabase's auth_rls_initplan advisor can cache the claim
-- lookup per statement.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'realtime' AND table_name = 'messages'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    BEGIN
      EXECUTE 'GRANT USAGE ON SCHEMA realtime TO authenticated';
      EXECUTE 'GRANT SELECT, INSERT ON realtime.messages TO authenticated';
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_select" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "video_room_channel_select"
        ON realtime.messages
        FOR SELECT
        TO public
        USING (
          COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'role', '') = 'authenticated'
          AND realtime.messages.extension IN ('broadcast', 'presence')
          AND COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (
            (
              (
                (SELECT realtime.topic()) LIKE 'video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:viewing:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                    ''
                  )::uuid
                  AND v.viewing_type = 'video'
                  AND v.status = 'confirmed'
                  AND (
                    COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:consultation:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.consultation_requests cr
                JOIN public.professionals p ON p.id = cr.professional_id
                WHERE cr.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                    ''
                  )::uuid
                  AND cr.request_type = 'consultation'
                  AND cr.status = 'confirmed'
                  AND cr.meeting_type = 'video'
                  AND (
                    p.user_id = COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
                    OR cr.requester_id = COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
                  )
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:professional:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.professionals p
                WHERE p.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                    ''
                  )::uuid
                  AND p.user_id = COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
              )
            )
          )
        )
    $POL$;

    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_insert" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "video_room_channel_insert"
        ON realtime.messages
        FOR INSERT
        TO public
        WITH CHECK (
          COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'role', '') = 'authenticated'
          AND realtime.messages.extension IN ('broadcast', 'presence')
          AND COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          AND (
            (
              (
                (SELECT realtime.topic()) LIKE 'video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:viewing:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                    ''
                  )::uuid
                  AND v.viewing_type = 'video'
                  AND v.status = 'confirmed'
                  AND (
                    COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:consultation:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:consultation:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.consultation_requests cr
                JOIN public.professionals p ON p.id = cr.professional_id
                WHERE cr.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:consultation:', ''),
                    ''
                  )::uuid
                  AND cr.request_type = 'consultation'
                  AND cr.status = 'confirmed'
                  AND cr.meeting_type = 'video'
                  AND (
                    p.user_id = COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
                    OR cr.requester_id = COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
                  )
              )
            )
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:professional:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:professional:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.professionals p
                WHERE p.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:professional:', ''),
                    ''
                  )::uuid
                  AND p.user_id = COALESCE(NULLIF((SELECT current_setting('request.jwt.claims', true)), '')::jsonb ->> 'sub', '')::uuid
              )
            )
          )
        )
    $POL$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping scoped video-room policies';
  END IF;
END $$;


-- 6. Apply-time assertions for the highest-value advisor regressions.
DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname IN (
        'Avatars are publicly accessible',
        'Listing images are publicly accessible',
        'Property images are publicly accessible'
      )
  ) THEN
    RAISE EXCEPTION 'broad public storage.objects SELECT policies must not remain';
  END IF;

  FOREACH sig IN ARRAY ARRAY[
    'public.agent_data_inputs_validate_closing_date()',
    'public.audit_firesale_interest_mutation()',
    'public.enforce_professional_pro_consultation_request()',
    'public.guard_open_house_registration_insert()',
    'public.guard_open_house_registration_update()',
    'public.handle_new_user()',
    'public.invoke_send_saved_search_alerts_cron()',
    'public.profiles_guard_account_moderation()',
    'public.sync_profile_role_from_investor_subscription()',
    'public.admin_review_agent_data_input(uuid,text,text)',
    'public.admin_review_agent_data_input(uuid,text,text,boolean,uuid)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      IF has_function_privilege('anon', fn::oid, 'EXECUTE')
         OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
        RAISE EXCEPTION 'internal SECURITY DEFINER function remains API-executable: %', sig;
      END IF;
    END IF;
  END LOOP;

  fn := to_regprocedure('public.get_open_house_capacity(uuid)');
  IF fn IS NOT NULL AND NOT has_function_privilege('anon', fn::oid, 'EXECUTE') THEN
    RAISE EXCEPTION 'public.get_open_house_capacity(uuid) intentionally remains anon-callable for public listing capacity';
  END IF;
END $$;
