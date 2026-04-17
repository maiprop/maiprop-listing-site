-- Block self-assignment of investor and institutional roles.
-- These roles are granted only by the platform admin after reviewing
-- an invitation request (via investor_subscriptions, not role column).
--
-- Allowed self-transitions remain:
--   individual  → seller_landlord, agent, developer
--   seller_landlord → individual
-- Blocked (admin-only):
--   any → investor, institutional, professional, admin

CREATE OR REPLACE FUNCTION public.profiles_guard_admin_and_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Protect is_platform_admin — only admin can flip it
  IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.is_platform_admin := OLD.is_platform_admin;
    END IF;
  END IF;

  -- Only admin can escalate role
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    DECLARE
      admin_only_roles public.user_role[] := ARRAY[
        'admin'::public.user_role,
        'professional'::public.user_role,
        'investor'::public.user_role,
        'institutional'::public.user_role
      ];
    BEGIN
      IF NEW.role = ANY(admin_only_roles) THEN
        IF NOT public.has_platform_admin(auth.uid()) THEN
          NEW.role := OLD.role;   -- silently revert; RLS will also block the write
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ── RLS UPDATE policy ─────────────────────────────────────────────────────────
-- Replaces the permissive policy from 20260426120000.

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      -- No role change at all
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())

      -- Allowed self-transitions
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
          = 'individual'::public.user_role
        AND role IN (
          'seller_landlord'::public.user_role,
          'agent'::public.user_role,
          'developer'::public.user_role
        )
      )

      -- seller_landlord may revert to individual
      OR (
        (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
          = 'seller_landlord'::public.user_role
        AND role = 'individual'::public.user_role
      )

      -- Platform admin can set anything (bypasses this policy via service_role,
      -- but explicit override kept here for completeness)
      OR public.has_platform_admin(auth.uid())
    )
  );
