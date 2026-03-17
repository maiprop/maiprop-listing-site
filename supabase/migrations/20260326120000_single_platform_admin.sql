-- =============================================================================
-- Single platform admin: only one admin, only admin can grant admin.
-- Replaces has_role(agent) for admin purposes with has_platform_admin().
-- =============================================================================

-- 1. Add is_platform_admin to profiles (only one user can have true)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_single_admin
  ON public.profiles (is_platform_admin) WHERE is_platform_admin = true;

COMMENT ON COLUMN public.profiles.is_platform_admin IS 'Platform admin: firesale pipeline, subscribers, pricing, grant admin. Only one user.';

-- 2. Set initial platform admin (kr@maiprop.co - primary; kostisrenios same user or alternate)
-- Use the user_id from the seed migration. Only set for first admin.
DO $$
DECLARE
  admin_uid uuid := 'bfe73d89-c715-40ee-bccc-f6e71677ea71'; -- kostisrenios@gmail.com
BEGIN
  UPDATE public.profiles SET is_platform_admin = true WHERE user_id = admin_uid;
  -- Ensure only one: clear any others
  UPDATE public.profiles SET is_platform_admin = false WHERE user_id != admin_uid AND is_platform_admin = true;
END $$;

-- 3. has_platform_admin() - used for all admin-level RLS
CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_platform_admin FROM public.profiles WHERE user_id = _user_id LIMIT 1), false);
$$;

-- 4. Replace has_role(agent) with has_platform_admin for admin policies

-- Profiles: Agents can view all -> Platform admin can view all
DROP POLICY IF EXISTS "Agents can view all profiles for admin" ON public.profiles;
CREATE POLICY "Platform admin can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_platform_admin(auth.uid()));

-- Investor subscriptions: admins = platform admin
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.investor_subscriptions;
CREATE POLICY "Platform admin can view all subscriptions"
  ON public.investor_subscriptions FOR SELECT
  USING (public.has_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Admins can update all subscriptions" ON public.investor_subscriptions;
CREATE POLICY "Platform admin can update all subscriptions"
  ON public.investor_subscriptions FOR UPDATE
  USING (public.has_platform_admin(auth.uid()));

-- Investor subscriptions INSERT: only platform admin can create for others
DROP POLICY IF EXISTS "Admins can insert investor subscriptions" ON public.investor_subscriptions;
DROP POLICY IF EXISTS "Admins can insert investor subscriptions for others only" ON public.investor_subscriptions;
CREATE POLICY "Platform admin can insert investor subscriptions"
  ON public.investor_subscriptions FOR INSERT
  WITH CHECK (public.has_platform_admin(auth.uid()));

-- Firesale requests: admin view/update
DROP POLICY IF EXISTS "Admins can view all firesale requests" ON public.firesale_requests;
DROP POLICY IF EXISTS "Admins can update all firesale requests" ON public.firesale_requests;
CREATE POLICY "Platform admin can view all firesale requests"
  ON public.firesale_requests FOR SELECT
  USING (public.has_platform_admin(auth.uid()));
CREATE POLICY "Platform admin can update firesale requests"
  ON public.firesale_requests FOR UPDATE
  USING (public.has_platform_admin(auth.uid()));

-- Pricing configs: platform admin only
DROP POLICY IF EXISTS "Agents can insert pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Agents can delete pricing_configs" ON public.pricing_configs;
CREATE POLICY "Platform admin can insert pricing_configs"
  ON public.pricing_configs FOR INSERT
  WITH CHECK (public.has_platform_admin(auth.uid()));
CREATE POLICY "Platform admin can update pricing_configs"
  ON public.pricing_configs FOR UPDATE
  USING (public.has_platform_admin(auth.uid()))
  WITH CHECK (public.has_platform_admin(auth.uid()));
CREATE POLICY "Platform admin can delete pricing_configs"
  ON public.pricing_configs FOR DELETE
  USING (public.has_platform_admin(auth.uid()));

-- Professionals subscription_tier: only platform admin can change
CREATE OR REPLACE FUNCTION public.professionals_guard_subscription_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    IF auth.uid() IS NOT NULL AND NOT public.has_platform_admin(auth.uid()) THEN
      NEW.subscription_tier := OLD.subscription_tier;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Investor subscriptions no self-grant: only platform admin can insert
-- (Policy already updated above)

-- Profiles: only platform admin can set is_platform_admin or escalate role
CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only platform admin can set is_platform_admin
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;
  -- Only platform admin can escalate role to agent or professional
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role IN ('agent'::public.user_role, 'professional'::public.user_role) THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_admin_and_role ON public.profiles;
CREATE TRIGGER profiles_guard_admin_and_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_admin_and_role();

-- 5. RPC: transfer platform admin to another user (only current admin can call)
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
  IF target_user_id = auth.uid() THEN
    RETURN; -- noop if granting to self
  END IF;
  UPDATE public.profiles SET is_platform_admin = false WHERE is_platform_admin = true;
  UPDATE public.profiles SET is_platform_admin = true WHERE user_id = target_user_id;
END;
$$;

-- 6. RPC: grant by email (lookup user_id from auth.users)
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
  SELECT id INTO target_uid FROM auth.users WHERE LOWER(email) = LOWER(trim(target_email)) LIMIT 1;
  IF target_uid IS NULL THEN
    RAISE EXCEPTION 'User not found with email %', target_email;
  END IF;
  PERFORM public.grant_platform_admin(target_uid);
END;
$$;
