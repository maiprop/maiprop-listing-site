-- Correct listing quota semantics and expose a management-capability-scoped
-- catalogue for personal plus organization inventory.

CREATE OR REPLACE FUNCTION private.check_listing_quota_for_owner(
  p_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('listing_quota:' || p_owner_user_id::text)
  );

  v_limit := public.get_listing_limit(p_owner_user_id);
  IF v_limit >= 999 THEN
    RETURN true;
  END IF;

  IF v_limit <= 0 THEN
    RETURN false;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.listings
  WHERE owner_id = p_owner_user_id
    AND status = 'active'::public.listing_status;

  RETURN v_count < v_limit;
END;
$$;

REVOKE ALL ON FUNCTION private.check_listing_quota_for_owner(uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.check_listing_quota_for_owner(uuid) IS
  'Race-resistant owner-scoped quota guard that counts active listings only.';

CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue()
RETURNS SETOF public.listing_management_catalogue
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT catalogue.*
  FROM public.listing_management_catalogue AS catalogue
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (
      catalogue.owner_id = (SELECT auth.uid())
      OR (
        catalogue.organization_id IS NOT NULL
        AND private.has_org_permission(
          catalogue.organization_id,
          'listing:manage',
          (SELECT auth.uid())
        )
      )
    );
$$;

REVOKE ALL ON FUNCTION public.get_manageable_listing_catalogue()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_manageable_listing_catalogue()
  TO authenticated;

COMMENT ON FUNCTION public.get_manageable_listing_catalogue() IS
  'Personal and organization listing rows the current actor can mutate through listing:manage.';
