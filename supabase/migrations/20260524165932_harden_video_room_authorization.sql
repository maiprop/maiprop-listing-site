-- Harden built-in video-room signaling. Supabase Realtime Authorization only
-- applies to client channels created with config.private = true, so this policy
-- assumes the frontend always uses private channels for mAI Prop rooms.

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
          COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
          AND realtime.messages.extension IN ('broadcast', 'presence')
          AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
                    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
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
                  AND (
                    p.user_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM public.consultation_requests cr
                      WHERE cr.professional_id = p.id
                        AND cr.requester_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                        AND cr.request_type = 'consultation'
                        AND cr.status = 'confirmed'
                    )
                  )
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
          COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'authenticated'
          AND realtime.messages.extension IN ('broadcast', 'presence')
          AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
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
                    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
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
                  AND (
                    p.user_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                    OR EXISTS (
                      SELECT 1
                      FROM public.consultation_requests cr
                      WHERE cr.professional_id = p.id
                        AND cr.requester_id = COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                        AND cr.request_type = 'consultation'
                        AND cr.status = 'confirmed'
                    )
                  )
              )
            )
          )
        )
    $POL$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping hardened video-room policies';
  END IF;
END $$;
