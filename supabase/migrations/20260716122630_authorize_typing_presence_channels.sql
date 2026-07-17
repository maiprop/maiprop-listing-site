-- Realtime evaluates private-channel policies in its own rolled-back query.
-- Use one narrow definer predicate so conversation-table RLS cannot hide a
-- valid membership during that authorization check. The function exposes only
-- a boolean for the current JWT subject and never accepts a caller-supplied ID.

CREATE OR REPLACE FUNCTION private.can_access_typing_topic(p_topic text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversations AS conversation
      WHERE conversation.id = public.uuid_from_realtime_topic(p_topic, 'typing')
        AND (
          conversation.participant_a = (SELECT auth.uid())
          OR conversation.participant_b = (SELECT auth.uid())
        )
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_typing_topic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_typing_topic(text)
  TO authenticated, service_role;

DO $block$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'GRANT SELECT, INSERT ON realtime.messages TO authenticated';
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_select" ON realtime.messages';
    EXECUTE 'DROP POLICY IF EXISTS "typing_channel_participant_insert" ON realtime.messages';

    EXECUTE $policy$
      CREATE POLICY "typing_channel_participant_select"
        ON realtime.messages
        FOR SELECT
        TO authenticated
        USING (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND private.can_access_typing_topic((SELECT realtime.topic()))
        )
    $policy$;

    EXECUTE $policy$
      CREATE POLICY "typing_channel_participant_insert"
        ON realtime.messages
        FOR INSERT
        TO authenticated
        WITH CHECK (
          realtime.messages.extension IN ('broadcast', 'presence')
          AND private.can_access_typing_topic((SELECT realtime.topic()))
        )
    $policy$;
  ELSE
    RAISE NOTICE 'realtime.messages not present - skipping typing presence policies';
  END IF;
END;
$block$;

COMMENT ON FUNCTION private.can_access_typing_topic(text) IS
  'Returns whether the current JWT user participates in the conversation encoded by a private typing topic.';
