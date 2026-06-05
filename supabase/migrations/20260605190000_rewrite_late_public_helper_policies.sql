-- Re-run the public-to-private role-helper policy rewrite after later advisor
-- hardening/consolidation migrations. Public helper RPCs are intentionally
-- service-role-only; RLS policies must call the private wrappers that remain
-- executable by authenticated users for policy evaluation.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

REVOKE ALL ON FUNCTION private.authoritative_role(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.authoritative_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_platform_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.user_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.check_listing_quota() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION private.authoritative_role(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.authoritative_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_platform_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.user_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated, service_role;

DO $$
DECLARE
  policy_record RECORD;
  using_expr TEXT;
  check_expr TEXT;
  policy_roles TEXT;
  policy_command TEXT;
  policy_kind TEXT;
BEGIN
  FOR policy_record IN
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      p.polname AS policy_name,
      p.polcmd,
      p.polpermissive,
      p.polroles,
      pg_get_expr(p.polqual, p.polrelid) AS using_expr,
      pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage')
      AND (
        COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%has_platform_admin(%'
        OR COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%has_role(%'
        OR COALESCE(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%check_listing_quota(%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%has_platform_admin(%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%has_role(%'
        OR COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%check_listing_quota(%'
      )
  LOOP
    SELECT string_agg(
      CASE
        WHEN role_oid = 0 THEN 'public'
        ELSE quote_ident(pg_get_userbyid(role_oid))
      END,
      ', '
    )
    INTO policy_roles
    FROM unnest(policy_record.polroles) AS role_oid;

    policy_command := CASE policy_record.polcmd
      WHEN 'r' THEN 'SELECT'
      WHEN 'a' THEN 'INSERT'
      WHEN 'w' THEN 'UPDATE'
      WHEN 'd' THEN 'DELETE'
      WHEN '*' THEN 'ALL'
    END;

    policy_kind := CASE
      WHEN policy_record.polpermissive THEN 'PERMISSIVE'
      ELSE 'RESTRICTIVE'
    END;

    using_expr := policy_record.using_expr;
    check_expr := policy_record.check_expr;

    IF using_expr IS NOT NULL THEN
      using_expr := replace(using_expr, 'private.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      using_expr := replace(using_expr, 'public.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      using_expr := replace(using_expr, 'has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      using_expr := replace(using_expr, '__PRIVATE_HAS_PLATFORM_ADMIN__(', 'private.has_platform_admin(');

      using_expr := replace(using_expr, 'private.has_role(', '__PRIVATE_HAS_ROLE__(');
      using_expr := replace(using_expr, 'public.has_role(', '__PRIVATE_HAS_ROLE__(');
      using_expr := replace(using_expr, 'has_role(', '__PRIVATE_HAS_ROLE__(');
      using_expr := replace(using_expr, '__PRIVATE_HAS_ROLE__(', 'private.has_role(');

      using_expr := replace(using_expr, 'private.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      using_expr := replace(using_expr, 'public.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      using_expr := replace(using_expr, 'check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      using_expr := replace(using_expr, '__PRIVATE_CHECK_LISTING_QUOTA__(', 'private.check_listing_quota(');
    END IF;

    IF check_expr IS NOT NULL THEN
      check_expr := replace(check_expr, 'private.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      check_expr := replace(check_expr, 'public.has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      check_expr := replace(check_expr, 'has_platform_admin(', '__PRIVATE_HAS_PLATFORM_ADMIN__(');
      check_expr := replace(check_expr, '__PRIVATE_HAS_PLATFORM_ADMIN__(', 'private.has_platform_admin(');

      check_expr := replace(check_expr, 'private.has_role(', '__PRIVATE_HAS_ROLE__(');
      check_expr := replace(check_expr, 'public.has_role(', '__PRIVATE_HAS_ROLE__(');
      check_expr := replace(check_expr, 'has_role(', '__PRIVATE_HAS_ROLE__(');
      check_expr := replace(check_expr, '__PRIVATE_HAS_ROLE__(', 'private.has_role(');

      check_expr := replace(check_expr, 'private.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      check_expr := replace(check_expr, 'public.check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      check_expr := replace(check_expr, 'check_listing_quota(', '__PRIVATE_CHECK_LISTING_QUOTA__(');
      check_expr := replace(check_expr, '__PRIVATE_CHECK_LISTING_QUOTA__(', 'private.check_listing_quota(');
    END IF;

    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name
    );

    EXECUTE format(
      'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
      policy_record.policy_name,
      policy_record.schema_name,
      policy_record.table_name,
      policy_kind,
      policy_command,
      policy_roles,
      CASE WHEN using_expr IS NULL THEN '' ELSE ' USING (' || using_expr || ')' END,
      CASE WHEN check_expr IS NULL THEN '' ELSE ' WITH CHECK (' || check_expr || ')' END
    );
  END LOOP;
END $$;

DO $$
DECLARE
  sig TEXT;
  fn REGPROCEDURE;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.authoritative_role()',
    'public.authoritative_role(uuid)',
    'public.check_listing_quota()',
    'public.has_platform_admin(uuid)',
    'public.has_role(uuid,public.app_role)',
    'public.has_role(uuid,public.user_role)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  policy_record RECORD;
BEGIN
  SELECT *
  INTO policy_record
  FROM (
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      p.polname AS policy_name,
      replace(
        replace(
          replace(
            COALESCE(pg_get_expr(p.polqual, p.polrelid), '') || ' ' ||
            COALESCE(pg_get_expr(p.polwithcheck, p.polrelid), ''),
            'private.has_platform_admin(',
            ''
          ),
          'private.has_role(',
          ''
        ),
        'private.check_listing_quota(',
        ''
      ) AS scrubbed_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname IN ('public', 'storage')
  ) policies
  WHERE scrubbed_expr LIKE '%has_platform_admin(%'
     OR scrubbed_expr LIKE '%has_role(%'
     OR scrubbed_expr LIKE '%check_listing_quota(%'
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'policy still references a public role helper: %.% %',
      policy_record.schema_name,
      policy_record.table_name,
      policy_record.policy_name;
  END IF;

  IF has_function_privilege('anon', 'public.has_platform_admin(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.has_platform_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public role helper remains browser-executable: public.has_platform_admin(uuid)';
  END IF;

  IF NOT has_function_privilege('authenticated', 'private.has_platform_admin(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute private.has_platform_admin(uuid) for RLS policy evaluation';
  END IF;
END $$;
