-- Message delivery is one database transaction. Browser callers cannot leave
-- a visible message without its attachment metadata, and retrying the same
-- client delivery id returns the committed message instead of duplicating it.

CREATE UNIQUE INDEX IF NOT EXISTS idx_message_attachments_message_storage
  ON public.message_attachments (message_id, storage_path);

CREATE OR REPLACE FUNCTION private.send_message_with_attachments_for_actor(
  p_conversation_id uuid,
  p_content text,
  p_client_delivery_id uuid,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS public.messages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id uuid := (SELECT auth.uid());
  v_message public.messages;
  v_attachments jsonb := COALESCE(p_attachments, '[]'::jsonb);
  v_requested_attachments jsonb := '[]'::jsonb;
  v_existing_attachments jsonb := '[]'::jsonb;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_conversation_id IS NULL OR p_client_delivery_id IS NULL THEN
    RAISE EXCEPTION 'invalid_message_delivery' USING ERRCODE = '22023';
  END IF;

  IF p_content IS NULL OR length(p_content) > 4000 THEN
    RAISE EXCEPTION 'invalid_message_content' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_attachments) <> 'array'
     OR jsonb_array_length(v_attachments) > 10 THEN
    RAISE EXCEPTION 'invalid_message_attachments' USING ERRCODE = '22023';
  END IF;

  IF btrim(p_content) = '' AND jsonb_array_length(v_attachments) = 0 THEN
    RAISE EXCEPTION 'empty_message' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_attachments) AS attachment(value)
    WHERE jsonb_typeof(attachment.value) <> 'object'
      OR COALESCE(attachment.value->>'storage_path', '') = ''
      OR length(attachment.value->>'storage_path') > 1024
      OR COALESCE(attachment.value->>'filename', '') = ''
      OR length(attachment.value->>'filename') > 240
      OR length(COALESCE(attachment.value->>'mime_type', '')) > 160
  ) THEN
    RAISE EXCEPTION 'invalid_message_attachments' USING ERRCODE = '22023';
  END IF;

  IF (
    SELECT count(*) <> count(DISTINCT attachment.value->>'storage_path')
    FROM jsonb_array_elements(v_attachments) AS attachment(value)
  ) THEN
    RAISE EXCEPTION 'duplicate_message_attachment' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'storage_path', normalized.storage_path,
        'filename', normalized.filename,
        'mime_type', normalized.mime_type
      )
      ORDER BY normalized.storage_path, normalized.filename, normalized.mime_type
    ),
    '[]'::jsonb
  )
  INTO v_requested_attachments
  FROM (
    SELECT
      attachment.value->>'storage_path' AS storage_path,
      attachment.value->>'filename' AS filename,
      NULLIF(attachment.value->>'mime_type', '') AS mime_type
    FROM jsonb_array_elements(v_attachments) AS attachment(value)
  ) AS normalized;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.id = p_conversation_id
      AND conversation.closed_at IS NULL
      AND v_actor_id IN (conversation.participant_a, conversation.participant_b)
  ) THEN
    RAISE EXCEPTION 'conversation_not_available' USING ERRCODE = '42501';
  END IF;

  SELECT message.*
  INTO v_message
  FROM public.messages AS message
  WHERE message.sender_id = v_actor_id
    AND message.client_delivery_id = p_client_delivery_id;

  IF FOUND THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'storage_path', attachment.storage_path,
          'filename', attachment.filename,
          'mime_type', attachment.mime_type
        )
        ORDER BY attachment.storage_path, attachment.filename, attachment.mime_type
      ),
      '[]'::jsonb
    )
    INTO v_existing_attachments
    FROM public.message_attachments AS attachment
    WHERE attachment.message_id = v_message.id;

    IF v_message.conversation_id IS DISTINCT FROM p_conversation_id
       OR v_message.content IS DISTINCT FROM p_content
       OR v_existing_attachments IS DISTINCT FROM v_requested_attachments THEN
      RAISE EXCEPTION 'message_delivery_id_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN v_message;
  END IF;

  BEGIN
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      receiver_id,
      client_delivery_id
    )
    VALUES (
      p_conversation_id,
      v_actor_id,
      p_content,
      NULL,
      p_client_delivery_id
    )
    RETURNING * INTO v_message;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT message.*
      INTO v_message
      FROM public.messages AS message
      WHERE message.sender_id = v_actor_id
        AND message.client_delivery_id = p_client_delivery_id;

      IF NOT FOUND
         OR v_message.conversation_id IS DISTINCT FROM p_conversation_id
         OR v_message.content IS DISTINCT FROM p_content THEN
        RAISE EXCEPTION 'message_delivery_id_conflict' USING ERRCODE = '23505';
      END IF;

      SELECT COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'storage_path', attachment.storage_path,
            'filename', attachment.filename,
            'mime_type', attachment.mime_type
          )
          ORDER BY attachment.storage_path, attachment.filename, attachment.mime_type
        ),
        '[]'::jsonb
      )
      INTO v_existing_attachments
      FROM public.message_attachments AS attachment
      WHERE attachment.message_id = v_message.id;

      IF v_existing_attachments IS DISTINCT FROM v_requested_attachments THEN
        RAISE EXCEPTION 'message_delivery_id_conflict' USING ERRCODE = '23505';
      END IF;
      RETURN v_message;
  END;

  INSERT INTO public.message_attachments (
    message_id,
    storage_path,
    filename,
    mime_type
  )
  SELECT
    v_message.id,
    attachment.value->>'storage_path',
    attachment.value->>'filename',
    NULLIF(attachment.value->>'mime_type', '')
  FROM jsonb_array_elements(v_attachments) AS attachment(value)
  ON CONFLICT (message_id, storage_path) DO NOTHING;

  RETURN v_message;
END;
$$;

REVOKE ALL ON FUNCTION private.send_message_with_attachments_for_actor(
  uuid, text, uuid, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.send_message_with_attachments_for_actor(
  uuid, text, uuid, jsonb
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.send_message_with_attachments(
  p_conversation_id uuid,
  p_content text,
  p_client_delivery_id uuid,
  p_attachments jsonb DEFAULT '[]'::jsonb
)
RETURNS public.messages
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT private.send_message_with_attachments_for_actor(
    p_conversation_id,
    p_content,
    p_client_delivery_id,
    p_attachments
  );
$$;

REVOKE ALL ON FUNCTION public.send_message_with_attachments(
  uuid, text, uuid, jsonb
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_message_with_attachments(
  uuid, text, uuid, jsonb
) TO authenticated, service_role;

REVOKE INSERT ON TABLE public.messages FROM authenticated;
REVOKE INSERT (
  conversation_id,
  sender_id,
  receiver_id,
  content,
  client_delivery_id
) ON public.messages FROM authenticated;
REVOKE INSERT ON TABLE public.message_attachments FROM authenticated;

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
        AND conversation.closed_at IS NULL
        AND (
          conversation.participant_a = (SELECT auth.uid())
          OR conversation.participant_b = (SELECT auth.uid())
        )
    );
$$;

REVOKE ALL ON FUNCTION private.can_access_typing_topic(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_typing_topic(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.send_message_with_attachments(uuid, text, uuid, jsonb)
  IS 'Caller-scoped, atomic and idempotent message delivery contract.';
