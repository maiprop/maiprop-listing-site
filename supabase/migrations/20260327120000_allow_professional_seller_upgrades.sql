-- =============================================================================
-- Allow professional and seller_landlord upgrades (do not block).
-- Only agent role remains admin-gated.
-- =============================================================================

-- 1. Update trigger: only block escalation to agent, not professional or seller_landlord
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
  -- Only platform admin can escalate role to agent (professional and seller_landlord allowed)
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'agent'::public.user_role THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Relax RLS: allow individual -> seller_landlord or professional (upgrades)
--    Block individual -> agent and any other escalations
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- Same role (any non-escalation change)
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
      OR
      -- Allowed upgrades: individual -> seller_landlord or professional
      (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid()) = 'individual'::public.user_role
        AND role IN ('seller_landlord'::public.user_role, 'professional'::public.user_role)
      )
      OR
      -- seller_landlord can revert to individual (downgrade)
      (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid()) = 'seller_landlord'::public.user_role
        AND role = 'individual'::public.user_role
      )
    )
  );
