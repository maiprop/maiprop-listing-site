BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002');

INSERT INTO public.profiles (user_id, role)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'buyer'),
  ('b1000000-0000-4000-8000-000000000002', 'seller');

INSERT INTO public.conversations (id, participant_a, participant_b)
VALUES (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000002'
);

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    SELECT public.send_message_with_attachments(
      'b2000000-0000-4000-8000-000000000001',
      'first delivery',
      'b4000000-0000-4000-8000-000000000001',
      '[{"storage_path":"messages/test/document.pdf","filename":"document.pdf","mime_type":"application/pdf"}]'::jsonb
    )
  $$,
  'a participant can atomically deliver a message and its attachment metadata'
);

SELECT lives_ok(
  $$
    SELECT public.send_message_with_attachments(
      'b2000000-0000-4000-8000-000000000001',
      'first delivery',
      'b4000000-0000-4000-8000-000000000001',
      '[{"storage_path":"messages/test/document.pdf","filename":"document.pdf","mime_type":"application/pdf"}]'::jsonb
    )
  $$,
  'retrying the same delivery contract returns the committed message'
);

SELECT throws_ok(
  $$
    SELECT public.send_message_with_attachments(
      'b2000000-0000-4000-8000-000000000001',
      'conflicting retry',
      'b4000000-0000-4000-8000-000000000001',
      '[]'::jsonb
    )
  $$,
  '23505',
  NULL,
  'the same delivery identity cannot be reused for different content or attachments'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.messages
    WHERE sender_id = 'b1000000-0000-4000-8000-000000000001'
      AND client_delivery_id = 'b4000000-0000-4000-8000-000000000001'
  ),
  1,
  'one durable message remains for a retried delivery identity'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.message_attachments AS attachment
    JOIN public.messages AS message ON message.id = attachment.message_id
    WHERE message.sender_id = 'b1000000-0000-4000-8000-000000000001'
      AND message.client_delivery_id = 'b4000000-0000-4000-8000-000000000001'
      AND attachment.storage_path = 'messages/test/document.pdf'
  ),
  1,
  'one attachment metadata row remains for the retried delivery identity'
);

SELECT throws_ok(
  $$
    INSERT INTO public.messages (
      conversation_id,
      sender_id,
      content,
      client_delivery_id
    ) VALUES (
      'b2000000-0000-4000-8000-000000000001',
      'b1000000-0000-4000-8000-000000000001',
      'direct browser insert',
      'b4000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  NULL,
  'authenticated callers cannot bypass the atomic delivery RPC'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
