-- Replace privileged public views with explicitly granted, set-returning RPCs.
--
-- The views remain useful as stable row types and query definitions, but they
-- are security-invoker and not executable by API roles. The RPCs execute as
-- the database owner so browser/API callers do not regain direct access to
-- raw listing storage. Each caller still supplies auth.uid() through the JWT,
-- which the management/reference predicates evaluate before returning rows.

ALTER VIEW public.public_listing_catalogue
  SET (security_invoker = true, security_barrier = true);
ALTER VIEW public.listing_management_catalogue
  SET (security_invoker = true, security_barrier = true);
ALTER VIEW public.listing_reference_catalogue
  SET (security_invoker = true, security_barrier = true);

REVOKE ALL ON TABLE public.public_listing_catalogue
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.listing_management_catalogue
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.listing_reference_catalogue
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_public_listing_catalogue()
RETURNS SETOF public.public_listing_catalogue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT catalogue.*
  FROM public.public_listing_catalogue AS catalogue;
$$;

CREATE OR REPLACE FUNCTION public.get_listing_management_catalogue()
RETURNS SETOF public.listing_management_catalogue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT catalogue.*
  FROM public.listing_management_catalogue AS catalogue;
$$;

CREATE OR REPLACE FUNCTION public.get_listing_reference_catalogue()
RETURNS SETOF public.listing_reference_catalogue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT catalogue.*
  FROM public.listing_reference_catalogue AS catalogue;
$$;

REVOKE ALL ON FUNCTION public.get_public_listing_catalogue()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_listing_management_catalogue()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_listing_reference_catalogue()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_public_listing_catalogue()
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_management_catalogue()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_reference_catalogue()
  TO anon, authenticated;

COMMENT ON VIEW public.public_listing_catalogue IS
  'Internal allowlisted active-listing projection. API roles consume it only through get_public_listing_catalogue().';
COMMENT ON VIEW public.listing_management_catalogue IS
  'Internal owner, organization and platform-admin projection. API roles consume it only through get_listing_management_catalogue().';
COMMENT ON VIEW public.listing_reference_catalogue IS
  'Internal relationship-scoped listing projection. API roles consume it only through get_listing_reference_catalogue().';

COMMENT ON FUNCTION public.get_public_listing_catalogue() IS
  'Allowlisted active/non-off-market listing rows for public catalogue APIs.';
COMMENT ON FUNCTION public.get_listing_management_catalogue() IS
  'Caller-scoped listing rows for owners, authorized organizations and platform administrators.';
COMMENT ON FUNCTION public.get_listing_reference_catalogue() IS
  'Minimal public or caller-related listing rows for relationship-heavy application screens.';
