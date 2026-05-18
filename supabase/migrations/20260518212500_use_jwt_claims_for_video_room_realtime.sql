-- Some Realtime authorizer contexts can evaluate private channel policies as a
-- generic role while still exposing the caller JWT in request.jwt.claims. Scope
-- video-room authorization to authenticated JWT claims directly so room joins do
-- not depend on role remapping.

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
          AND (
            (SELECT realtime.topic()) LIKE 'video:professional:%'
            OR (SELECT realtime.topic()) LIKE 'private:video:professional:%'
            OR (SELECT realtime.topic()) LIKE 'realtime:private:video:professional:%'
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:viewing:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                    ''
                  )::uuid
                  AND (
                    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
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
          AND (
            (SELECT realtime.topic()) LIKE 'video:professional:%'
            OR (SELECT realtime.topic()) LIKE 'private:video:professional:%'
            OR (SELECT realtime.topic()) LIKE 'realtime:private:video:professional:%'
            OR (
              (
                (SELECT realtime.topic()) LIKE 'video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'private:video:viewing:%'
                OR (SELECT realtime.topic()) LIKE 'realtime:private:video:viewing:%'
              )
              AND NULLIF(
                REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                ''
              ) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = NULLIF(
                    REGEXP_REPLACE((SELECT realtime.topic()), '^(realtime:)?(private:)?video:viewing:', ''),
                    ''
                  )::uuid
                  AND (
                    COALESCE(NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', '')::uuid
                  ) IN (v.owner_id, v.requester_id)
              )
            )
          )
        )
    $POL$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping video-room JWT-claim policies';
  END IF;
END $$;
