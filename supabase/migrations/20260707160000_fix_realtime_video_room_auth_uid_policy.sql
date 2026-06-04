-- Keep private Realtime channel authorization restrictive while avoiding unsafe
-- UUID casts across the shared realtime.messages policy set. PostgreSQL can
-- reorder boolean expressions, so topic IDs must be extracted safely before
-- comparing them to uuid columns.

CREATE OR REPLACE FUNCTION public.uuid_from_realtime_topic(p_topic text, p_prefix text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path = public, pg_temp
AS $$
DECLARE
  bare_prefix text := p_prefix || ':';
  private_prefix text := 'private:' || p_prefix || ':';
  realtime_private_prefix text := 'realtime:private:' || p_prefix || ':';
  candidate text;
BEGIN
  IF p_topic IS NULL OR p_prefix IS NULL OR p_prefix = '' THEN
    RETURN NULL;
  END IF;

  IF left(p_topic, char_length(bare_prefix)) = bare_prefix THEN
    candidate := substr(p_topic, char_length(bare_prefix) + 1);
  ELSIF left(p_topic, char_length(private_prefix)) = private_prefix THEN
    candidate := substr(p_topic, char_length(private_prefix) + 1);
  ELSIF left(p_topic, char_length(realtime_private_prefix)) = realtime_private_prefix THEN
    candidate := substr(p_topic, char_length(realtime_private_prefix) + 1);
  ELSE
    RETURN NULL;
  END IF;

  IF candidate ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN candidate::uuid;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.uuid_from_realtime_topic(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.uuid_from_realtime_topic(text, text) TO authenticated, service_role;

DROP POLICY IF EXISTS "video_room_channel_select" ON realtime.messages;
DROP POLICY IF EXISTS "video_room_channel_insert" ON realtime.messages;
DROP POLICY IF EXISTS "typing_channel_participant_select" ON realtime.messages;
DROP POLICY IF EXISTS "typing_channel_participant_insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug_video_topic_select" ON realtime.messages;
DROP POLICY IF EXISTS "debug_video_topic_insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug_authenticated_true_select" ON realtime.messages;
DROP POLICY IF EXISTS "debug_authenticated_true_insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug_topic_column_select" ON realtime.messages;
DROP POLICY IF EXISTS "debug_topic_column_insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug_uuid_topic_select" ON realtime.messages;
DROP POLICY IF EXISTS "debug_uuid_topic_insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug_probe_select" ON realtime.messages;
DROP POLICY IF EXISTS "debug_probe_insert" ON realtime.messages;
DROP POLICY IF EXISTS "debug_condition_select" ON realtime.messages;
DROP POLICY IF EXISTS "debug_condition_insert" ON realtime.messages;

DROP FUNCTION IF EXISTS public.debug_realtime_policy_probe(text, text, text, text, boolean);
DROP TABLE IF EXISTS public.debug_realtime_policy_logs;

CREATE POLICY "video_room_channel_select"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND (
      EXISTS (
        SELECT 1
        FROM public.viewings v
        WHERE v.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:viewing')
          AND v.viewing_type = 'video'::public.viewing_type
          AND v.status = 'confirmed'::public.viewing_status
          AND (v.owner_id = (SELECT auth.uid()) OR v.requester_id = (SELECT auth.uid()))
      )
      OR EXISTS (
        SELECT 1
        FROM public.consultation_requests cr
        JOIN public.professionals p ON p.id = cr.professional_id
        WHERE cr.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:consultation')
          AND cr.request_type = 'consultation'
          AND cr.status = 'confirmed'
          AND cr.meeting_type = 'video'
          AND (p.user_id = (SELECT auth.uid()) OR cr.requester_id = (SELECT auth.uid()))
      )
      OR EXISTS (
        SELECT 1
        FROM public.professionals p
        WHERE p.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:professional')
          AND p.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "video_room_channel_insert"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND (
      EXISTS (
        SELECT 1
        FROM public.viewings v
        WHERE v.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:viewing')
          AND v.viewing_type = 'video'::public.viewing_type
          AND v.status = 'confirmed'::public.viewing_status
          AND (v.owner_id = (SELECT auth.uid()) OR v.requester_id = (SELECT auth.uid()))
      )
      OR EXISTS (
        SELECT 1
        FROM public.consultation_requests cr
        JOIN public.professionals p ON p.id = cr.professional_id
        WHERE cr.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:consultation')
          AND cr.request_type = 'consultation'
          AND cr.status = 'confirmed'
          AND cr.meeting_type = 'video'
          AND (p.user_id = (SELECT auth.uid()) OR cr.requester_id = (SELECT auth.uid()))
      )
      OR EXISTS (
        SELECT 1
        FROM public.professionals p
        WHERE p.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'video:professional')
          AND p.user_id = (SELECT auth.uid())
      )
    )
  );

CREATE POLICY "typing_channel_participant_select"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension = 'presence'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'typing')
        AND ((SELECT auth.uid()) = c.participant_a OR (SELECT auth.uid()) = c.participant_b)
    )
  );

CREATE POLICY "typing_channel_participant_insert"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'presence'
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = public.uuid_from_realtime_topic((SELECT realtime.topic()), 'typing')
        AND ((SELECT auth.uid()) = c.participant_a OR (SELECT auth.uid()) = c.participant_b)
    )
  );
