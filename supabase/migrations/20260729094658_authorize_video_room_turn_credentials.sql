-- Keep TURN credential issuance and Realtime room access on one authorization
-- rule. The function exposes only a boolean and derives identity from auth.uid().

CREATE OR REPLACE FUNCTION public.can_access_video_room(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.viewings AS viewing
      WHERE viewing.id = public.uuid_from_realtime_topic(
        p_topic,
        'video:viewing'
      )
        AND viewing.viewing_type = 'video'::public.viewing_type
        AND viewing.status = 'confirmed'::public.viewing_status
        AND (
          viewing.owner_id = (SELECT auth.uid())
          OR viewing.requester_id = (SELECT auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.consultation_requests AS request
      JOIN public.professionals AS professional
        ON professional.id = request.professional_id
      WHERE request.id = public.uuid_from_realtime_topic(
        p_topic,
        'video:consultation'
      )
        AND request.request_type = 'consultation'
        AND request.status = 'confirmed'
        AND request.meeting_type = 'video'
        AND (
          professional.user_id = (SELECT auth.uid())
          OR request.requester_id = (SELECT auth.uid())
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.professionals AS professional
      WHERE professional.id = public.uuid_from_realtime_topic(
        p_topic,
        'video:professional'
      )
        AND professional.user_id = (SELECT auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_video_room(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_video_room(text)
  TO authenticated, service_role;

DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS "realtime_messages_participant_select" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "realtime_messages_participant_insert" ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY "realtime_messages_participant_select"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND (
            private.can_access_typing_topic((SELECT realtime.topic()))
            OR public.can_access_video_room((SELECT realtime.topic()))
          )
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "realtime_messages_participant_insert"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND (
            private.can_access_typing_topic((SELECT realtime.topic()))
            OR public.can_access_video_room((SELECT realtime.topic()))
          )
        )
    $policy$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping video room policy consolidation';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.can_access_video_room(text) IS
  'Returns whether auth.uid() may join one scoped MaiProp video room.';
