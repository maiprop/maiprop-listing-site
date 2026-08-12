BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(9);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.projects'::regclass
      AND polname = 'projects_anon_select'
  ),
  'legacy anonymous projects policy is removed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.projects'::regclass
      AND polname = 'projects_authenticated_select'
  ),
  'legacy authenticated projects policy is removed'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM pg_policy
    WHERE polrelid = 'public.user_roles'::regclass
      AND polname = 'Users can view their own roles'
  ),
  'legacy own-role policy is removed'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policy
    WHERE polrelid = 'public.projects'::regclass
      AND polcmd = 'r'
      AND polroles = ARRAY['anon'::regrole::oid]
  ),
  1,
  'projects has one anonymous SELECT policy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policy
    WHERE polrelid = 'public.projects'::regclass
      AND polcmd = 'r'
      AND polroles = ARRAY['authenticated'::regrole::oid]
  ),
  1,
  'projects has one authenticated SELECT policy'
);

SELECT is(
  (
    SELECT count(*)::integer
    FROM pg_policy
    WHERE polrelid = 'public.user_roles'::regclass
      AND polcmd = 'r'
      AND polroles = ARRAY['authenticated'::regrole::oid]
  ),
  1,
  'user roles has one authenticated SELECT policy'
);

SELECT ok(
  (
    SELECT
      pg_get_expr(polqual, polrelid) LIKE '%status = ''active''%'
      AND pg_get_expr(polqual, polrelid) LIKE '%archived_at IS NULL%'
    FROM pg_policy
    WHERE polrelid = 'public.projects'::regclass
      AND polname = 'projects_public_select'
  ),
  'canonical anonymous projects policy preserves public visibility rules'
);

SELECT ok(
  (
    SELECT
      pg_get_expr(polqual, polrelid) LIKE '%project:view%'
      AND pg_get_expr(polqual, polrelid) LIKE '%has_platform_admin%'
      AND pg_get_expr(polqual, polrelid) LIKE '%owner_id%'
    FROM pg_policy
    WHERE polrelid = 'public.projects'::regclass
      AND polname = 'projects_select'
  ),
  'canonical authenticated projects policy preserves owner, organization, and admin access'
);

SELECT ok(
  (
    SELECT
      pg_get_expr(polqual, polrelid) LIKE '%user_id%'
      AND pg_get_expr(polqual, polrelid) LIKE '%has_role%'
      AND pg_get_expr(polqual, polrelid) LIKE '%admin%'
    FROM pg_policy
    WHERE polrelid = 'public.user_roles'::regclass
      AND polname = 'user_roles_select'
  ),
  'canonical user-role policy preserves own-role and admin access'
);

SELECT * FROM finish();
ROLLBACK;
