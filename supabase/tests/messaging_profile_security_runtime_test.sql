BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(28);

SELECT ok(
  NOT (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.get_public_profile_summaries(uuid[])'::regprocedure
  ),
  'the public profile summary RPC is SECURITY INVOKER'
);

SELECT ok(
  has_function_privilege(
    'anon',
    'public.get_public_profile_summaries(uuid[])',
    'EXECUTE'
  ),
  'anon can execute the public profile summary RPC'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.get_public_profile_summaries(uuid[])',
    'EXECUTE'
  ),
  'authenticated can execute the public profile summary RPC'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.profiles_public', 'SELECT'),
  'anon has no table-wide profiles_public SELECT grant'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.profiles_public', 'SELECT'),
  'authenticated has no table-wide profiles_public SELECT grant'
);

SELECT is(
  (
    SELECT array_agg(column_name ORDER BY column_name)::text
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'profiles_public'
      AND grantee = 'anon'
      AND privilege_type = 'SELECT'
  ),
  '{avatar_url,display_name,owner_participant_type,user_id}',
  'anon can select only the deliberate public profile projection'
);

SELECT is(
  (
    SELECT array_agg(column_name ORDER BY column_name)::text
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'profiles_public'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
  ),
  '{avatar_url,display_name,owner_participant_type,user_id}',
  'authenticated can select only the deliberate public profile projection'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'profiles_public'
      AND grantee = 'anon'
      AND privilege_type = 'SELECT'
      AND column_name IN ('first_name', 'last_name', 'role')
  ),
  'anon cannot select private profile fields'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM information_schema.column_privileges
    WHERE table_schema = 'public'
      AND table_name = 'profiles_public'
      AND grantee = 'authenticated'
      AND privilege_type = 'SELECT'
      AND column_name IN ('first_name', 'last_name', 'role')
  ),
  'authenticated cannot select private profile fields'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('91000000-0000-4000-8000-000000000001'),
  ('91000000-0000-4000-8000-000000000002'),
  ('91000000-0000-4000-8000-000000000003');

INSERT INTO public.profiles (
  user_id,
  display_name,
  avatar_url,
  first_name,
  last_name,
  role,
  is_platform_admin
)
VALUES
  (
    '91000000-0000-4000-8000-000000000001',
    'Agent Card',
    'https://example.test/agent.png',
    'Private Agent',
    'Surname',
    'agent',
    false
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    'Seller Card',
    'https://example.test/seller.png',
    'Private Seller',
    'Surname',
    'seller',
    false
  ),
  (
    '91000000-0000-4000-8000-000000000003',
    'Outside User',
    NULL,
    'Private Outside',
    'Surname',
    'buyer',
    false
  );

INSERT INTO public.conversations (id, participant_a, participant_b)
VALUES (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002'
);

SET LOCAL session_replication_role = origin;

UPDATE public.profiles
SET display_name = display_name
WHERE user_id IN (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  '91000000-0000-4000-8000-000000000003'
);

INSERT INTO realtime.messages (
  id,
  topic,
  extension,
  payload,
  event,
  private
)
VALUES (
  '93000000-0000-4000-8000-000000000001',
  'typing:92000000-0000-4000-8000-000000000001',
  'broadcast',
  '{}'::jsonb,
  'typing',
  true
);

SELECT is(
  (
    SELECT to_jsonb(profile_public) ->> 'owner_participant_type'
    FROM public.profiles_public AS profile_public
    WHERE user_id = '91000000-0000-4000-8000-000000000001'
  ),
  'agent',
  'the public projection preserves the coarse agent owner type'
);

SELECT is(
  (
    SELECT to_jsonb(profile_public) ->> 'owner_participant_type'
    FROM public.profiles_public AS profile_public
    WHERE user_id = '91000000-0000-4000-8000-000000000002'
  ),
  'seller',
  'the public projection preserves the coarse seller owner type'
);

SET LOCAL ROLE anon;

SELECT results_eq(
  $$
    SELECT user_id, display_name, avatar_url, owner_participant_type
    FROM public.get_public_profile_summaries(
      ARRAY['91000000-0000-4000-8000-000000000001'::uuid]
    )
  $$,
  $$
    VALUES (
      '91000000-0000-4000-8000-000000000001'::uuid,
      'Agent Card'::text,
      'https://example.test/agent.png'::text,
      'agent'::text
    )
  $$,
  'anon listing owner cards retain their public summary fields'
);

SELECT is(
  (
    SELECT array_agg(profile_key ORDER BY profile_key)::text
    FROM public.get_public_profile_summaries(
      ARRAY['91000000-0000-4000-8000-000000000001'::uuid]
    ) AS profile_summary
    CROSS JOIN LATERAL jsonb_object_keys(to_jsonb(profile_summary)) AS profile_key
  ),
  '{avatar_url,display_name,owner_participant_type,user_id}',
  'anon RPC results contain no arbitrary private profile fields'
);

SELECT lives_ok(
  $$
    SELECT user_id, display_name, avatar_url, owner_participant_type
    FROM public.profiles_public
    WHERE user_id = '91000000-0000-4000-8000-000000000001'
  $$,
  'anon can read the deliberate public profile projection directly'
);

SELECT throws_ok(
  $$
    SELECT first_name, last_name, role
    FROM public.profiles_public
    WHERE user_id = '91000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'anon cannot enumerate private profile columns'
);

RESET ROLE;
SET LOCAL ROLE authenticated;

SELECT results_eq(
  $$
    SELECT user_id, display_name, avatar_url, owner_participant_type
    FROM public.get_public_profile_summaries(
      ARRAY['91000000-0000-4000-8000-000000000002'::uuid]
    )
  $$,
  $$
    VALUES (
      '91000000-0000-4000-8000-000000000002'::uuid,
      'Seller Card'::text,
      'https://example.test/seller.png'::text,
      'seller'::text
    )
  $$,
  'authenticated listing owner cards retain their public summary fields'
);

SELECT throws_ok(
  $$
    SELECT first_name, last_name, role
    FROM public.profiles_public
    WHERE user_id = '91000000-0000-4000-8000-000000000002'
  $$,
  '42501',
  NULL,
  'authenticated cannot enumerate private profile columns'
);

RESET ROLE;

SELECT is(
  public.uuid_from_realtime_topic(
    'typing:92000000-0000-4000-8000-000000000001',
    'typing'
  ),
  '92000000-0000-4000-8000-000000000001'::uuid,
  'bare typing topics normalize to their conversation UUID'
);

SELECT is(
  public.uuid_from_realtime_topic(
    'private:typing:92000000-0000-4000-8000-000000000001',
    'typing'
  ),
  '92000000-0000-4000-8000-000000000001'::uuid,
  'private typing topics normalize to their conversation UUID'
);

SELECT is(
  public.uuid_from_realtime_topic(
    'realtime:typing:92000000-0000-4000-8000-000000000001',
    'typing'
  ),
  '92000000-0000-4000-8000-000000000001'::uuid,
  'Supabase realtime-prefixed typing topics normalize to their conversation UUID'
);

SELECT is(
  public.uuid_from_realtime_topic(
    'realtime:private:typing:92000000-0000-4000-8000-000000000001',
    'typing'
  ),
  '92000000-0000-4000-8000-000000000001'::uuid,
  'Supabase realtime/private typing topics normalize to their conversation UUID'
);

SELECT is(
  public.uuid_from_realtime_topic('typing:not-a-uuid', 'typing'),
  NULL::uuid,
  'malformed typing topics are rejected without unsafe casts'
);

SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
SELECT set_config(
  'realtime.topic',
  'realtime:typing:92000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::integer
    FROM realtime.messages
    WHERE id = '93000000-0000-4000-8000-000000000001'
  ),
  1,
  'conversation participant A can subscribe to the private typing channel'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000002',
  true
);
SELECT set_config(
  'realtime.topic',
  'private:typing:92000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::integer
    FROM realtime.messages
    WHERE id = '93000000-0000-4000-8000-000000000001'
  ),
  1,
  'conversation participant B can subscribe to the private typing channel'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000003',
  true
);
SELECT set_config(
  'realtime.topic',
  'typing:92000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::integer
    FROM realtime.messages
    WHERE id = '93000000-0000-4000-8000-000000000001'
  ),
  0,
  'a non-participant cannot subscribe to the private typing channel'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
SELECT set_config(
  'realtime.topic',
  'realtime:typing:92000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO realtime.messages (topic, extension, payload, event, private)
    VALUES (
      'typing:92000000-0000-4000-8000-000000000001',
      'broadcast',
      '{}'::jsonb,
      'typing',
      true
    )
  $$,
  'a conversation participant can publish a private typing broadcast'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000003',
  true
);
SELECT set_config(
  'realtime.topic',
  'typing:92000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO realtime.messages (topic, extension, payload, event, private)
    VALUES (
      'typing:92000000-0000-4000-8000-000000000001',
      'broadcast',
      '{}'::jsonb,
      'typing',
      true
    )
  $$,
  '42501',
  NULL,
  'a non-participant cannot publish a private typing broadcast'
);

RESET ROLE;
UPDATE public.conversations
SET closed_at = now()
WHERE id = '92000000-0000-4000-8000-000000000001';

SELECT set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);
SELECT set_config(
  'realtime.topic',
  'typing:92000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::integer
    FROM realtime.messages
    WHERE id = '93000000-0000-4000-8000-000000000001'
  ),
  0,
  'participants lose private typing-channel access after a conversation closes'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
