BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(30);

SELECT has_function(
  'public',
  'can_access_video_room',
  ARRAY['text'],
  'video room authorization RPC exists'
);

SELECT ok(
  (
    SELECT prosecdef
    FROM pg_proc
    WHERE oid = 'public.can_access_video_room(text)'::regprocedure
  ),
  'video room authorization runs as SECURITY DEFINER'
);

SELECT is(
  (
    SELECT provolatile
    FROM pg_proc
    WHERE oid = 'public.can_access_video_room(text)'::regprocedure
  ),
  's'::"char",
  'video room authorization is STABLE'
);

SELECT is(
  (
    SELECT array_to_string(proconfig, ',')
    FROM pg_proc
    WHERE oid = 'public.can_access_video_room(text)'::regprocedure
  ),
  'search_path=""',
  'video room authorization has an empty search path'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_proc AS procedure
    CROSS JOIN LATERAL aclexplode(procedure.proacl) AS privilege
    WHERE procedure.oid = 'public.can_access_video_room(text)'::regprocedure
      AND privilege.grantee = 0
      AND privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute video room authorization'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.can_access_video_room(text)',
    'EXECUTE'
  ),
  'anon cannot execute video room authorization'
);

SELECT ok(
  has_function_privilege(
    'authenticated',
    'public.can_access_video_room(text)',
    'EXECUTE'
  ),
  'authenticated can execute video room authorization'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.can_access_video_room(text)',
    'EXECUTE'
  ),
  'service role can execute video room authorization'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policy
    WHERE polrelid = 'realtime.messages'::regclass
      AND polname IN (
        'realtime_messages_participant_select',
        'realtime_messages_participant_insert'
      )
  ),
  2,
  'Realtime messages has exactly the two consolidated participant policies'
);

SELECT is(
  (
    SELECT array_agg(polname ORDER BY polname)::text
    FROM pg_policy
    WHERE polrelid = 'realtime.messages'::regclass
      AND polname IN (
        'realtime_messages_participant_select',
        'realtime_messages_participant_insert'
      )
      AND polroles = ARRAY['authenticated'::regrole::oid]
  ),
  '{realtime_messages_participant_insert,realtime_messages_participant_select}',
  'both consolidated Realtime policies are scoped to authenticated users'
);

SELECT is(
  (
    SELECT array_agg(polname || ':' || polcmd::text ORDER BY polname)::text
    FROM pg_policy
    WHERE polrelid = 'realtime.messages'::regclass
      AND polname IN (
        'realtime_messages_participant_select',
        'realtime_messages_participant_insert'
      )
  ),
  '{realtime_messages_participant_insert:a,realtime_messages_participant_select:r}',
  'the consolidated Realtime policies cover insert and select only'
);

SELECT ok(
  (
    SELECT
      pg_get_expr(polqual, polrelid) LIKE '%can_access_typing_topic%'
      AND pg_get_expr(polqual, polrelid) LIKE '%can_access_video_room%'
      AND pg_get_expr(polqual, polrelid) LIKE '%broadcast%'
      AND pg_get_expr(polqual, polrelid) LIKE '%presence%'
    FROM pg_policy
    WHERE polrelid = 'realtime.messages'::regclass
      AND polname = 'realtime_messages_participant_select'
  ),
  'Realtime select policy preserves typing and video authorization'
);

SELECT ok(
  (
    SELECT
      pg_get_expr(polwithcheck, polrelid) LIKE '%can_access_typing_topic%'
      AND pg_get_expr(polwithcheck, polrelid) LIKE '%can_access_video_room%'
      AND pg_get_expr(polwithcheck, polrelid) LIKE '%broadcast%'
      AND pg_get_expr(polwithcheck, polrelid) LIKE '%presence%'
    FROM pg_policy
    WHERE polrelid = 'realtime.messages'::regclass
      AND polname = 'realtime_messages_participant_insert'
  ),
  'Realtime insert policy preserves typing and video authorization'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('a1000000-0000-4000-8000-000000000001'),
  ('a1000000-0000-4000-8000-000000000002'),
  ('a1000000-0000-4000-8000-000000000003');

INSERT INTO public.profiles (user_id, display_name, role)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001',
    'Room owner',
    'agent'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'Room requester',
    'buyer'
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'Room outsider',
    'buyer'
  );

INSERT INTO public.listings (
  id,
  owner_id,
  title,
  city,
  price,
  sqm,
  property_type,
  listing_type,
  status
)
VALUES (
  'a2000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'Video room test listing',
  'Athens',
  250000,
  85,
  'apartment',
  'sale',
  'active'
);

INSERT INTO public.viewings (
  id,
  listing_id,
  requester_id,
  owner_id,
  viewing_type,
  status,
  scheduled_at
)
VALUES
  (
    'a3000000-0000-4000-8000-000000000001',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'video',
    'confirmed',
    now() + interval '1 day'
  ),
  (
    'a3000000-0000-4000-8000-000000000002',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'video',
    'pending',
    now() + interval '2 days'
  ),
  (
    'a3000000-0000-4000-8000-000000000003',
    'a2000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'a1000000-0000-4000-8000-000000000001',
    'in_person',
    'confirmed',
    now() + interval '3 days'
  );

INSERT INTO public.professionals (
  id,
  user_id,
  category,
  title,
  verified
)
VALUES (
  'a4000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'real_estate_agent',
  'Video consultation professional',
  true
);

INSERT INTO public.consultation_requests (
  id,
  professional_id,
  requester_id,
  requester_name,
  requester_email,
  request_type,
  status,
  meeting_type
)
VALUES
  (
    'a5000000-0000-4000-8000-000000000001',
    'a4000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'Room requester',
    'requester@example.test',
    'consultation',
    'confirmed',
    'video'
  ),
  (
    'a5000000-0000-4000-8000-000000000002',
    'a4000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'Room requester',
    'requester@example.test',
    'consultation',
    'pending',
    'video'
  ),
  (
    'a5000000-0000-4000-8000-000000000003',
    'a4000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000002',
    'Room requester',
    'requester@example.test',
    'consultation',
    'confirmed',
    'in_person'
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
  'a6000000-0000-4000-8000-000000000001',
  'video:viewing:a3000000-0000-4000-8000-000000000001',
  'broadcast',
  '{}'::jsonb,
  'room-test',
  true
);

SET LOCAL session_replication_role = origin;

SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:viewing:a3000000-0000-4000-8000-000000000001'
  ),
  true,
  'confirmed video viewing requester can access the room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'private:video:viewing:a3000000-0000-4000-8000-000000000001'
  ),
  true,
  'confirmed video viewing owner can access the private room topic'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:viewing:a3000000-0000-4000-8000-000000000001'
  ),
  false,
  'outsider cannot access a confirmed video viewing room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:viewing:a3000000-0000-4000-8000-000000000002'
  ),
  false,
  'pending video viewing does not authorize room access'
);

SELECT is(
  public.can_access_video_room(
    'video:viewing:a3000000-0000-4000-8000-000000000003'
  ),
  false,
  'in-person viewing does not authorize room access'
);

SELECT is(
  public.can_access_video_room(
    'video:consultation:a5000000-0000-4000-8000-000000000001'
  ),
  true,
  'confirmed video consultation requester can access the room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'realtime:video:consultation:a5000000-0000-4000-8000-000000000001'
  ),
  true,
  'confirmed video consultation professional can access the room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:consultation:a5000000-0000-4000-8000-000000000001'
  ),
  false,
  'outsider cannot access a confirmed video consultation room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:consultation:a5000000-0000-4000-8000-000000000002'
  ),
  false,
  'pending video consultation does not authorize room access'
);

SELECT is(
  public.can_access_video_room(
    'video:consultation:a5000000-0000-4000-8000-000000000003'
  ),
  false,
  'in-person consultation does not authorize room access'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:professional:a4000000-0000-4000-8000-000000000001'
  ),
  true,
  'professional can access their legacy professional room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  public.can_access_video_room(
    'video:professional:a4000000-0000-4000-8000-000000000001'
  ),
  false,
  'non-owner cannot access a professional room'
);

SELECT is(
  public.can_access_video_room('video:viewing:not-a-uuid'),
  false,
  'malformed room topics fail closed'
);

SELECT set_config(
  'realtime.topic',
  'video:viewing:a3000000-0000-4000-8000-000000000001',
  true
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM realtime.messages
    WHERE id = 'a6000000-0000-4000-8000-000000000001'
  ),
  1,
  'confirmed viewing participant can subscribe to the video room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
SELECT set_config(
  'realtime.topic',
  'video:viewing:a3000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT is(
  (
    SELECT count(*)::integer
    FROM realtime.messages
    WHERE id = 'a6000000-0000-4000-8000-000000000001'
  ),
  0,
  'outsider cannot subscribe to the video room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000002',
  true
);
SELECT set_config(
  'realtime.topic',
  'video:viewing:a3000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT lives_ok(
  $$
    INSERT INTO realtime.messages (topic, extension, payload, event, private)
    VALUES (
      'video:viewing:a3000000-0000-4000-8000-000000000001',
      'broadcast',
      '{}'::jsonb,
      'participant-publish',
      true
    )
  $$,
  'confirmed viewing participant can publish to the video room'
);

RESET ROLE;
SELECT set_config(
  'request.jwt.claim.sub',
  'a1000000-0000-4000-8000-000000000003',
  true
);
SELECT set_config(
  'realtime.topic',
  'video:viewing:a3000000-0000-4000-8000-000000000001',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO realtime.messages (topic, extension, payload, event, private)
    VALUES (
      'video:viewing:a3000000-0000-4000-8000-000000000001',
      'broadcast',
      '{}'::jsonb,
      'outsider-publish',
      true
    )
  $$,
  '42501',
  NULL,
  'outsider cannot publish to the video room'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
