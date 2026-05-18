-- Authorize private Supabase Realtime channels used by the in-app maiProp
-- video rooms. Professional rooms are authenticated-only fallback rooms;
-- viewing rooms are restricted to the viewing requester and listing owner.

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

    EXECUTE 'DROP POLICY IF EXISTS "video_room_channel_select" ON realtime.messages';
    EXECUTE $POL$
      CREATE POLICY "video_room_channel_select"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND (
            realtime.topic() LIKE 'video:professional:%'
            OR (
              realtime.topic() LIKE 'video:viewing:%'
              AND SUBSTRING(realtime.topic() FROM 15) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = SUBSTRING(realtime.topic() FROM 15)::uuid
                  AND (SELECT auth.uid()) IN (v.owner_id, v.requester_id)
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
        TO authenticated
        WITH CHECK (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND (
            realtime.topic() LIKE 'video:professional:%'
            OR (
              realtime.topic() LIKE 'video:viewing:%'
              AND SUBSTRING(realtime.topic() FROM 15) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              AND EXISTS (
                SELECT 1
                FROM public.viewings v
                WHERE v.id = SUBSTRING(realtime.topic() FROM 15)::uuid
                  AND (SELECT auth.uid()) IN (v.owner_id, v.requester_id)
              )
            )
          )
        )
    $POL$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping video-room RLS policies';
  END IF;
END $$;
