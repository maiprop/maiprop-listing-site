-- Allow users to self-assign to agent, investor, institutional, developer.
-- Per PARTICIPANT_RIGHTS: Users can self-assign these types; only admin/professional require platform admin.
-- Pricing is adjusted via frontend redirect to /pricing after type selection.

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
  -- Only admin can escalate to professional (requires verification)
  IF NEW.role IS DISTINCT FROM OLD.role AND NEW.role = 'professional'::public.user_role THEN
    IF NOT public.has_platform_admin(auth.uid()) THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  -- Self-assign: allow agent, investor, institutional, developer (block admin, professional)
  IF auth.uid() = NEW.user_id THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NEW.role IN ('admin'::public.user_role, 'professional'::public.user_role) THEN
        IF NOT public.has_platform_admin(auth.uid()) THEN
          NEW.role := OLD.role;
        END IF;
      END IF;
      -- Allow: individual <-> seller_landlord, individual -> agent|investor|institutional|developer
      -- (RLS handles which transitions are allowed; trigger only blocks admin/professional)
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
