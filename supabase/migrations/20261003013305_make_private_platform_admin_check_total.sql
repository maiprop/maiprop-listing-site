-- The private predicate independently guards admin-only reports. A missing
-- authoritative role must be false so negative PL/pgSQL checks deny it.
BEGIN;

CREATE OR REPLACE FUNCTION private.has_platform_admin(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(private.authoritative_role(_user_id) = 'admin'::public.user_role, false)
$$;

COMMIT;
