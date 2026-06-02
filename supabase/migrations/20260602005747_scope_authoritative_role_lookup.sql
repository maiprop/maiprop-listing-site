-- Scope role-helper RPCs to the caller unless the caller is trusted.
--
-- RLS policies need authenticated EXECUTE on has_role/has_platform_admin, so
-- revoking those grants breaks normal app access. The safer fix is to keep the
-- grants but make the canonical role reader refuse arbitrary user-id lookups
-- unless the caller is service_role or an existing platform admin.

CREATE OR REPLACE FUNCTION public.authoritative_role(_user_id uuid)
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT
      auth.uid() AS uid,
      COALESCE(auth.role(), '') AS jwt_role
  )
  SELECT p.role
  FROM public.profiles AS p
  CROSS JOIN caller AS c
  WHERE p.user_id = _user_id
    AND (
      _user_id = c.uid
      OR c.jwt_role = 'service_role'
      OR EXISTS (
        SELECT 1
        FROM public.profiles AS admin_profile
        WHERE admin_profile.user_id = c.uid
          AND admin_profile.role = 'admin'::public.user_role
      )
    )
  LIMIT 1
$$;

COMMENT ON FUNCTION public.authoritative_role(uuid) IS
  'Canonical role lookup. Authenticated callers can resolve only their own role; platform admins and service_role can resolve other users for admin workflows/RLS support.';

CREATE OR REPLACE FUNCTION public.authoritative_role()
RETURNS public.user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.authoritative_role(auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.user_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.authoritative_role(_user_id) = _role, false)
$$;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH caller AS (
    SELECT
      auth.uid() AS uid,
      COALESCE(auth.role(), '') AS jwt_role
  )
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    CROSS JOIN caller AS c
    WHERE ur.user_id = _user_id
      AND ur.role::text = _role::text
      AND (
        _user_id = c.uid
        OR c.jwt_role = 'service_role'
        OR EXISTS (
          SELECT 1
          FROM public.profiles AS admin_profile
          WHERE admin_profile.user_id = c.uid
            AND admin_profile.role = 'admin'::public.user_role
        )
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.authoritative_role(_user_id) = 'admin'::public.user_role, false)
$$;

REVOKE ALL ON FUNCTION public.authoritative_role(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.authoritative_role() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.user_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_platform_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.authoritative_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.authoritative_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.user_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_platform_admin(uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.authoritative_role(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute authoritative_role(uuid)';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.authoritative_role(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must execute authoritative_role(uuid) for RLS policy evaluation';
  END IF;
END $$;
