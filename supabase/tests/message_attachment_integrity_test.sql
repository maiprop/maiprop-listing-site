BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(6);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000003');

INSERT INTO public.profiles (user_id, role)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'buyer'),
  ('a1000000-0000-4000-8000-000000000002', 'seller'),
  ('a1000000-0000-4000-8000-000000000003', 'buyer');

INSERT INTO public.conversations (id, participant_a, participant_b)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002'
);

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.message_attachments (
      message_id,
      storage_path,
      filename
    ) VALUES (
      'a3000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001/direct-file.pdf',
      'direct-file.pdf'
    )
  $$,
  '42501',
  NULL,
  'authenticated callers cannot insert attachment metadata directly'
);

SELECT lives_ok(
  $$
    SELECT public.send_message_with_attachments(
      'a2000000-0000-4000-8000-000000000001',
      'participant A message',
      'a4000000-0000-4000-8000-000000000001',
      '[{"storage_path":"a1000000-0000-4000-8000-000000000001/own-file.pdf","filename":"own-file.pdf","mime_type":"application/pdf"}]'::jsonb
    )
  $$,
  'a participant can atomically deliver a message with attachment metadata'
);

RESET ROLE;

SELECT is(
  (
    SELECT sender_id
    FROM public.messages
    WHERE client_delivery_id = 'a4000000-0000-4000-8000-000000000001'
  ),
  'a1000000-0000-4000-8000-000000000001'::uuid,
  'the delivery RPC binds the message sender to the authenticated participant'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.message_attachments AS attachment
    JOIN public.messages AS message ON message.id = attachment.message_id
    WHERE message.client_delivery_id = 'a4000000-0000-4000-8000-000000000001'
      AND attachment.storage_path = 'a1000000-0000-4000-8000-000000000001/own-file.pdf'
  ),
  1,
  'the attachment metadata is committed with the message'
);

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    SELECT public.send_message_with_attachments(
      'a2000000-0000-4000-8000-000000000001',
      'outsider message',
      'a4000000-0000-4000-8000-000000000002',
      '[]'::jsonb
    )
  $$,
  '42501',
  'conversation_not_available',
  'a nonparticipant cannot deliver a message to the conversation'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.messages
    WHERE client_delivery_id = 'a4000000-0000-4000-8000-000000000002'
  ),
  0,
  'a rejected outsider delivery leaves no message behind'
);

SELECT * FROM finish();
ROLLBACK;
