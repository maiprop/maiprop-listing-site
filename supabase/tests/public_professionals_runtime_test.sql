-- Run with psql -v ON_ERROR_STOP=1 on an isolated, migrated database.
-- Real roles, RLS and triggers are exercised; every fixture is rolled back.
BEGIN;
SET LOCAL plpgsql.check_asserts = on;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{}', true);

INSERT INTO auth.users (id, email) VALUES
  ('a1200000-0000-0000-0000-000000000001', 'public-professional@test.invalid'),
  ('a1200000-0000-0000-0000-000000000002', 'archived-professional@test.invalid'),
  ('a1200000-0000-0000-0000-000000000003', 'unrelated-professional@test.invalid'),
  ('a1200000-0000-0000-0000-000000000004', 'admin-professional@test.invalid');

-- Auth signup creates buyer profiles. Seed trusted roles using the existing
-- internal owner-trigger marker, then clear it before any caller assertion.
SELECT set_config('maiprop.owner_auth_trigger_active', 'true', true);
INSERT INTO public.profiles (user_id, role) VALUES
  ('a1200000-0000-0000-0000-000000000001', 'professional'),
  ('a1200000-0000-0000-0000-000000000002', 'professional'),
  ('a1200000-0000-0000-0000-000000000003', 'buyer'),
  ('a1200000-0000-0000-0000-000000000004', 'admin')
ON CONFLICT (user_id) DO UPDATE SET role = EXCLUDED.role;
SELECT set_config('maiprop.owner_auth_trigger_active', 'false', true);

INSERT INTO public.professionals (
  id, user_id, title, display_name, category, city, rating, hourly_rate,
  license_number, notes, calendar_notes, rejection_reason, archived_at
) VALUES (
  'a1210000-0000-0000-0000-000000000001',
  'a1200000-0000-0000-0000-000000000001',
  'Runtime architect', 'Public Architect', 'architect', 'Athens', 4.75, 123.45,
  'PUBLIC-LICENSE-1', 'internal-only', 'calendar-only', 'moderation-only', NULL
), (
  'a1210000-0000-0000-0000-000000000002',
  'a1200000-0000-0000-0000-000000000002',
  'Archived architect', 'Archived Architect', 'architect', 'Athens', 5, 200,
  'PUBLIC-LICENSE-2', 'archived-internal', 'archived-calendar', 'archived-moderation', now()
);

SET LOCAL ROLE anon;
DO $test$
DECLARE
  directory_ids uuid[];
  detail jsonb;
  field text;
BEGIN
  SELECT array_agg(id ORDER BY subscription_tier DESC NULLS LAST, rating DESC NULLS LAST)
  INTO directory_ids FROM public.public_professionals
  WHERE id IN ('a1210000-0000-0000-0000-000000000001', 'a1210000-0000-0000-0000-000000000002')
    AND category = 'architect';
  ASSERT directory_ids = ARRAY['a1210000-0000-0000-0000-000000000001'::uuid],
    'anonymous category directory must include only the active fixture';

  SELECT to_jsonb(p) INTO detail FROM public.public_professionals p
    WHERE id = 'a1210000-0000-0000-0000-000000000001';
  ASSERT detail ->> 'display_name' = 'Public Architect', 'anonymous detail must be readable';
  ASSERT detail ->> 'user_id' = 'a1200000-0000-0000-0000-000000000001', 'public owner identifier compatibility';
  ASSERT detail ->> 'license_number' = 'PUBLIC-LICENSE-1', 'public license compatibility';
  ASSERT (detail ->> 'rating')::numeric = 4.75 AND (detail ->> 'hourly_rate')::numeric = 123.45,
    'public numeric values must retain precision';
  ASSERT (SELECT count(*) FROM jsonb_object_keys(detail)) = 25, 'public projection must contain exactly 25 fields';
  ASSERT NOT detail ?| ARRAY['notes', 'calendar_notes', 'rejection_reason', 'archived_at'],
    'public detail must not serialize private fields';
  ASSERT NOT EXISTS (SELECT 1 FROM public.public_professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000002'), 'archived detail must be absent';
  ASSERT NOT EXISTS (SELECT 1 FROM public.public_professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000001' AND category = 'lawyer'),
    'category filter must exclude other categories';
  ASSERT (SELECT count(*) FROM public.get_public_professionals()
    WHERE id IN ('a1210000-0000-0000-0000-000000000001', 'a1210000-0000-0000-0000-000000000002')) = 1,
    'direct projection RPC must apply the same archive boundary';

  FOREACH field IN ARRAY ARRAY['notes', 'calendar_notes', 'rejection_reason', 'archived_at'] LOOP
    BEGIN
      EXECUTE format('SELECT %I FROM public.public_professionals', field);
      RAISE EXCEPTION 'private field % unexpectedly exposed by view', field;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
    BEGIN
      EXECUTE format('SELECT %I FROM public.get_public_professionals()', field);
      RAISE EXCEPTION 'private field % unexpectedly exposed by RPC', field;
    EXCEPTION WHEN undefined_column THEN NULL;
    END;
  END LOOP;
  BEGIN
    PERFORM notes, calendar_notes, rejection_reason FROM public.professionals;
    RAISE EXCEPTION 'anonymous raw-table SELECT unexpectedly permitted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END;
$test$;
RESET ROLE;

-- A signed-in non-owner must use the same public interface, not the raw row.
SELECT set_config('request.jwt.claim.sub', 'a1200000-0000-0000-0000-000000000003', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT NOT EXISTS (SELECT notes, calendar_notes, rejection_reason FROM public.professionals
    WHERE id IN ('a1210000-0000-0000-0000-000000000001', 'a1210000-0000-0000-0000-000000000002')),
    'unrelated authenticated caller must not read raw professional fields';
  ASSERT EXISTS (SELECT 1 FROM public.public_professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000001'), 'signed-in public detail remains available';
  UPDATE public.professionals SET bio = 'unauthorized' WHERE id = 'a1210000-0000-0000-0000-000000000001';
  ASSERT NOT FOUND, 'unrelated caller must not update another professional';
END;
$test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1200000-0000-0000-0000-000000000001', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT (SELECT notes = 'internal-only' AND calendar_notes = 'calendar-only'
    AND rejection_reason = 'moderation-only' FROM public.professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000001'), 'owner management read must retain private fields';
  ASSERT NOT EXISTS (SELECT 1 FROM public.professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000002'), 'owner must not read another raw professional';
  UPDATE public.professionals SET bio = 'owner edit' WHERE id = 'a1210000-0000-0000-0000-000000000001';
  ASSERT FOUND, 'owner profile updates must still work through SELECT RLS';
END;
$test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1200000-0000-0000-0000-000000000002', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT (SELECT notes = 'archived-internal' FROM public.professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000002'), 'archived owner management read must remain available';
  ASSERT NOT EXISTS (SELECT 1 FROM public.public_professionals
    WHERE id = 'a1210000-0000-0000-0000-000000000002'), 'ownership must not expose archived public detail';
END;
$test$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', 'a1200000-0000-0000-0000-000000000004', true);
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  ASSERT private.has_platform_admin(auth.uid()), 'admin fixture must use the authoritative role';
  ASSERT (SELECT count(*) FROM public.professionals
    WHERE id IN ('a1210000-0000-0000-0000-000000000001', 'a1210000-0000-0000-0000-000000000002')
      AND notes IS NOT NULL AND calendar_notes IS NOT NULL AND rejection_reason IS NOT NULL) = 2,
    'admin must read active and archived management records';
  UPDATE public.professionals SET notes = 'admin edit' WHERE id = 'a1210000-0000-0000-0000-000000000001';
  ASSERT FOUND, 'admin management updates must remain available';
END;
$test$;
RESET ROLE;

DO $test$
BEGIN
  ASSERT NOT has_table_privilege('anon', 'public.professionals', 'SELECT'), 'anon receives no raw-table grant';
  ASSERT NOT has_function_privilege('anon', 'private.has_platform_admin(uuid)', 'EXECUTE'),
    'anon receives no private admin-helper grant';
  ASSERT has_table_privilege('service_role', 'public.public_professionals', 'SELECT')
    AND has_function_privilege('service_role', 'public.get_public_professionals()', 'EXECUTE'),
    'service role retains the public interface';
  ASSERT (SELECT reloptions @> ARRAY['security_invoker=true', 'security_barrier=true']
    FROM pg_class WHERE oid = 'public.public_professionals'::regclass), 'public view must enforce its invoker boundary';
  ASSERT (SELECT prosecdef AND proconfig @> ARRAY['search_path=""']
    FROM pg_proc WHERE oid = 'public.get_public_professionals()'::regprocedure),
    'constrained definer function must use an empty search path';
END;
$test$;
ROLLBACK;
\echo 'PASS: public Professionals directory/detail, private-field denials, owner/admin management, unrelated denial; fixtures rolled back'
