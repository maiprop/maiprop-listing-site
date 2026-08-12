BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(10);

SELECT ok(
  (
    SELECT with_check ~* 'projects' AND with_check ~* 'owner_id'
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
      AND policyname = 'listing_insert_quota'
  ),
  'listing INSERT RLS requires the referenced project owner to match'
);

SELECT ok(
  (
    SELECT with_check ~* 'projects' AND with_check ~* 'owner_id'
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
      AND policyname = 'listings_update'
  ),
  'listing UPDATE RLS requires the referenced project owner to match'
);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users (id)
VALUES
  ('b1000000-0000-4000-8000-000000000001'),
  ('b1000000-0000-4000-8000-000000000002');

INSERT INTO public.profiles (user_id, role, force_pro_access)
VALUES
  ('b1000000-0000-4000-8000-000000000001', 'developer', true),
  ('b1000000-0000-4000-8000-000000000002', 'developer', true);

INSERT INTO public.projects (id, owner_id, name, status)
VALUES
  ('b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 'Foreign RLS project', 'active'),
  ('b2000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000001', 'Foreign trigger project', 'active'),
  ('b2000000-0000-4000-8000-000000000003', 'b1000000-0000-4000-8000-000000000001', 'Foreign RPC project', 'active'),
  ('b2000000-0000-4000-8000-000000000004', 'b1000000-0000-4000-8000-000000000002', 'Owned canonical project', 'active'),
  ('b2000000-0000-4000-8000-000000000005', 'b1000000-0000-4000-8000-000000000001', 'Project without listing', 'active'),
  ('b2000000-0000-4000-8000-000000000006', 'b1000000-0000-4000-8000-000000000001', 'Foreign update project', 'active');

INSERT INTO public.listings (
  id,
  owner_id,
  title,
  city,
  price,
  sqm,
  property_type,
  listing_type,
  status,
  project_id
)
VALUES
  (
    'b3000000-0000-4000-8000-000000000001',
    'b1000000-0000-4000-8000-000000000002',
    'Standalone update fixture',
    'Athens',
    100000,
    80,
    'apartment',
    'sale',
    'active',
    NULL
  ),
  (
    'b3000000-0000-4000-8000-000000000002',
    'b1000000-0000-4000-8000-000000000002',
    'Invalid RPC fixture',
    'Athens',
    110000,
    85,
    'apartment',
    'new_build',
    'active',
    'b2000000-0000-4000-8000-000000000003'
  );

SET LOCAL session_replication_role = origin;
SELECT set_config(
  'request.jwt.claim.sub',
  'b1000000-0000-4000-8000-000000000002',
  true
);
SET LOCAL ROLE authenticated;

SELECT throws_ok(
  $$
    INSERT INTO public.listings (
      id,
      owner_id,
      title,
      city,
      price,
      sqm,
      property_type,
      listing_type,
      status,
      project_id
    ) VALUES (
      'b3000000-0000-4000-8000-000000000003',
      'b1000000-0000-4000-8000-000000000002',
      'Cross-owner RLS insert',
      'Athens',
      120000,
      90,
      'apartment',
      'new_build',
      'active',
      'b2000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501',
  NULL,
  'a developer cannot insert a listing against another developer project'
);

SELECT throws_ok(
  $$
    UPDATE public.listings
    SET
      project_id = 'b2000000-0000-4000-8000-000000000006',
      listing_type = 'new_build'
    WHERE id = 'b3000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  NULL,
  'a developer cannot move an owned listing onto another developer project'
);

SELECT throws_ok(
  $$
    INSERT INTO public.listings (
      id,
      owner_id,
      title,
      city,
      price,
      sqm,
      property_type,
      listing_type,
      status,
      project_id
    ) VALUES (
      'b3000000-0000-4000-8000-000000000004',
      'b1000000-0000-4000-8000-000000000002',
      'Owned canonical listing',
      'Athens',
      130000,
      95,
      'apartment',
      'new_build',
      'active',
      'b2000000-0000-4000-8000-000000000004'
    )
  $$,
  '42501',
  NULL,
  'authenticated browser callers cannot bypass the server listing mutation boundary'
);

SELECT throws_ok(
  $$
    SELECT public.activate_listing_promotion(
      'b3000000-0000-4000-8000-000000000002',
      'spotlight',
      'cross-owner-project-rpc'
    )
  $$,
  '23514',
  'listing_project_owner_mismatch',
  'promotion activation rejects a cross-owner canonical project listing'
);

RESET ROLE;

SELECT throws_ok(
  $$
    INSERT INTO public.listings (
      id,
      owner_id,
      title,
      city,
      price,
      sqm,
      property_type,
      listing_type,
      status,
      project_id
    ) VALUES (
      'b3000000-0000-4000-8000-000000000005',
      'b1000000-0000-4000-8000-000000000002',
      'Cross-owner privileged insert',
      'Athens',
      140000,
      100,
      'apartment',
      'new_build',
      'active',
      'b2000000-0000-4000-8000-000000000002'
    )
  $$,
  '23514',
  'listing_project_owner_mismatch',
  'the integrity trigger blocks privileged cross-owner project links'
);

SELECT throws_ok(
  $$
    UPDATE public.projects
    SET owner_id = 'b1000000-0000-4000-8000-000000000001'
    WHERE id = 'b2000000-0000-4000-8000-000000000004'
  $$,
  '42501',
  'permission_denied: tenant resource ownership cannot be reassigned',
  'tenant project ownership cannot be reassigned after creation'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM public.listings
    WHERE project_id = 'b2000000-0000-4000-8000-000000000005'
  ),
  0,
  'an active project without a canonical listing remains empty'
);

SELECT is(
  (
    SELECT owner_id
    FROM public.projects
    WHERE id = 'b2000000-0000-4000-8000-000000000004'
  ),
  'b1000000-0000-4000-8000-000000000002'::uuid,
  'a rejected project transfer preserves tenant ownership'
);

SELECT * FROM finish();
ROLLBACK;
