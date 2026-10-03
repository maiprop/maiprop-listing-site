-- A pre-onboarding or missing profile has no authoritative role. Keep the
-- platform-admin predicate boolean so PL/pgSQL `IF NOT has_platform_admin(...)`
-- cannot treat SQL NULL as permission to continue. This restores the total
-- predicate from 20260602005747 without changing role resolution or grants.
BEGIN;

CREATE OR REPLACE FUNCTION public.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.authoritative_role(_user_id) = 'admin'::public.user_role, false)
$$;

COMMIT;
