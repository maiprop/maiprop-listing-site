-- Unify role scheme: add 'admin' to user_role enum, use role as single source of truth.
-- Platform admin = role='admin'. Deprecate is_platform_admin (keep column for backward compat).

-- 1. Add 'admin' to user_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'admin'
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'admin';
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL; -- enum value already exists
END
$$;

-- 2. Migrate: set role='admin' for current platform admins, clear is_platform_admin
UPDATE public.profiles
SET role = 'admin'::public.user_role,
    is_platform_admin = false
WHERE is_platform_admin = true;

-- 3. Drop old single-admin constraint, add new one on role
DROP INDEX IF EXISTS public.idx_profiles_single_admin;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_admin
  ON public.profiles ((true)) WHERE role = 'admin';

-- 4. has_platform_admin() now checks role='admin' (unified)
CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (role = 'admin'::public.user_role) FROM public.profiles WHERE user_id = _user_id LIMIT 1),
    false
  );
$$;

-- 5. grant_platform_admin: use role instead of is_platform_admin
CREATE OR REPLACE FUNCTION public.grant_platform_admin(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admin can grant admin rights';
  END IF;
  -- Revoke admin from current, grant to target
  UPDATE public.profiles SET role = 'agent'::public.user_role WHERE role = 'admin'::public.user_role;
  UPDATE public.profiles SET role = 'admin'::public.user_role WHERE user_id = target_user_id;
END;
$$;

-- 6. grant_platform_admin_by_email: same
CREATE OR REPLACE FUNCTION public.grant_platform_admin_by_email(target_email text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_uid uuid;
BEGIN
  IF NOT public.has_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admin can grant admin rights';
  END IF;
  SELECT au.id INTO target_uid
  FROM auth.users au
  WHERE LOWER(au.email) = LOWER(trim(target_email))
  LIMIT 1;
  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'User with email % not found', target_email;
  END IF;
  PERFORM public.grant_platform_admin(target_uid);
END;
$$;

-- 7. profiles_guard: only admin can set role='admin'; simplify (no is_platform_admin guard)
CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only admin can escalate anyone to role='admin'
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'admin'::public.user_role THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  -- Only admin can escalate to agent or professional
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role IN ('agent'::public.user_role, 'professional'::public.user_role) THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  -- Self-updates: allow downgrade or same-role changes per existing rules
  IF auth.uid() = NEW.user_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role NOT IN ('individual'::public.user_role, 'seller_landlord'::public.user_role) THEN
      -- Only admin can self-escalate to agent/professional; never self-escalate to admin
      IF NEW.role = 'admin'::public.user_role OR NOT public.has_platform_admin(auth.uid()) THEN
        NEW.role := OLD.role;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 8. Auto-grant admin role (not agent) for kr@maiprop.co on signup
CREATE OR REPLACE FUNCTION public.auto_grant_owner_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF LOWER(NEW.email) = 'kr@maiprop.co' THEN
    UPDATE public.profiles SET role = 'admin'::public.user_role WHERE user_id = NEW.id;
  ELSIF NEW.email IN ('kostisrenios@gmail.com') THEN
    UPDATE public.profiles SET role = 'agent'::public.user_role WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
