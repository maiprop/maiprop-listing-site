-- Opt into explicit Data API grants for future public-schema objects.
--
-- Existing table/function/sequence grants are intentionally left untouched;
-- RLS and the explicit grant migration define the current runtime surface.
-- This only changes defaults for objects created later by the app migration
-- owner role, so forgotten grants fail closed instead of silently exposing
-- new tables or sequences. Supabase-managed supabase_admin defaults are not
-- mutable through the project SQL API.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'postgres') THEN
    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated, service_role;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL PRIVILEGES ON SEQUENCES FROM anon, authenticated, service_role;

    ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
      REVOKE ALL PRIVILEGES ON FUNCTIONS FROM PUBLIC, anon, authenticated;
  END IF;
END $$;

DO $$
DECLARE
  grant_count integer;
BEGIN
  SELECT count(*)
    INTO grant_count
    FROM pg_default_acl d
    JOIN pg_namespace n ON n.oid = d.defaclnamespace
    CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    LEFT JOIN pg_roles r ON r.oid = a.grantee
   WHERE n.nspname = 'public'
     AND pg_get_userbyid(d.defaclrole) = 'postgres'
     AND (
       (
         d.defaclobjtype IN ('r', 'S')
         AND COALESCE(r.rolname, 'PUBLIC') IN ('anon', 'authenticated', 'service_role', 'PUBLIC')
       )
       OR (
         d.defaclobjtype = 'f'
         AND COALESCE(r.rolname, 'PUBLIC') IN ('anon', 'authenticated', 'PUBLIC')
       )
     );

  IF grant_count > 0 THEN
    RAISE EXCEPTION 'future public default grants still exist: %', grant_count;
  END IF;
END $$;
