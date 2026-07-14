BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(4);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002');

INSERT INTO public.profiles (user_id, role)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'buyer'),
  ('a1000000-0000-4000-8000-000000000002', 'seller');

INSERT INTO public.conversations (id, participant_a, participant_b)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000002'
);

INSERT INTO public.messages (id, conversation_id, sender_id, content)
VALUES
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001',
    'participant A message'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'participant B message'
  );

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO public.message_attachments (
      id,
      message_id,
      storage_path,
      filename
    ) VALUES (
      'a4000000-0000-4000-8000-000000000001',
      'a3000000-0000-4000-8000-000000000001',
      'a1000000-0000-4000-8000-000000000001/own-file.pdf',
      'own-file.pdf'
    )
  $$,
  'a sender can attach a file to their own message'
);

SELECT throws_ok(
  $$
    INSERT INTO public.message_attachments (
      id,
      message_id,
      storage_path,
      filename
    ) VALUES (
      'a4000000-0000-4000-8000-000000000002',
      'a3000000-0000-4000-8000-000000000002',
      'a1000000-0000-4000-8000-000000000001/forged-file.pdf',
      'forged-file.pdf'
    )
  $$,
  '42501',
  NULL,
  'a participant cannot attach a file to another sender message'
);

RESET ROLE;

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.message_attachments
    WHERE id = 'a4000000-0000-4000-8000-000000000001'
  ),
  1,
  'the legitimate sender attachment is stored'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.message_attachments
    WHERE id = 'a4000000-0000-4000-8000-000000000002'
  ),
  0,
  'the forged participant attachment is not stored'
);

SELECT * FROM finish();
ROLLBACK;
