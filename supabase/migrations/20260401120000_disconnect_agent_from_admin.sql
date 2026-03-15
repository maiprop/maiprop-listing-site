-- =============================================================================
-- Disconnect agent role from admin. Admin = platform admin (is_platform_admin) only.
-- Agent is a market professional role with no admin rights.
-- =============================================================================

-- 1. Investor subscriptions: only platform admin can insert (remove agent-based policy)
--    The restructure_roles migration added has_role(agent) for INSERT; revert to platform admin only.
DROP POLICY IF EXISTS "Admins can insert investor subscriptions" ON public.investor_subscriptions;
-- Ensure platform admin policy exists (may already exist from single_platform_admin migration)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'investor_subscriptions'
    AND policyname = 'Platform admin can insert investor subscriptions'
  ) THEN
    CREATE POLICY "Platform admin can insert investor subscriptions"
      ON public.investor_subscriptions FOR INSERT
      WITH CHECK (public.has_platform_admin(auth.uid()));
  END IF;
END $$;

-- 2. Profiles: allow agent to be self-assigned (like institutional, developer)
--    Agent is a participant type, not an admin-gated role.
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
  -- Only platform admin can escalate role to professional (agent is now self-assignable)
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'professional'::public.user_role THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Profiles RLS: add agent to allowed individual -> X upgrades (agent is self-assignable)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
      OR
      ( (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid()) = 'individual'::public.user_role
        AND role IN ('seller_landlord'::public.user_role, 'professional'::public.user_role, 'investor'::public.user_role, 'institutional'::public.user_role, 'developer'::public.user_role, 'agent'::public.user_role) )
      OR
      ( (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid()) = 'seller_landlord'::public.user_role
        AND role = 'individual'::public.user_role )
    )
  );
