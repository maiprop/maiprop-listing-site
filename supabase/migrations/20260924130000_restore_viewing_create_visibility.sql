BEGIN;

DO $preflight$
DECLARE
  v_policy_count INTEGER;
  v_insert_count INTEGER;
  v_policy RECORD;
BEGIN
  IF to_regprocedure('private.can_request_viewing_for_listing(uuid,uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'unexpected_existing_can_request_viewing_for_listing';
  END IF;

  SELECT count(*)::INTEGER
    INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'viewings';
  IF v_policy_count <> 3 THEN
    RAISE EXCEPTION 'unsupported_viewings_complete_policy_set';
  END IF;

  SELECT count(*)::INTEGER
    INTO v_insert_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'viewings'
    AND cmd IN ('ALL', 'INSERT');
  IF v_insert_count <> 1 THEN
    RAISE EXCEPTION 'unsupported_viewings_insert_policy_overlap';
  END IF;

  SELECT * INTO STRICT v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'viewings'
    AND policyname = 'viewings_insert';
  IF v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
     OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
     OR v_policy.cmd IS DISTINCT FROM 'INSERT'
     OR v_policy.qual IS NOT NULL
     OR md5(v_policy.with_check) IS DISTINCT FROM '6d84daf8842ef708f10a85fa739e7637' THEN
    RAISE EXCEPTION 'unsupported_viewings_insert_policy';
  END IF;

  SELECT * INTO STRICT v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'viewings'
    AND policyname = 'viewings_select';
  IF v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
     OR v_policy.roles IS DISTINCT FROM ARRAY['public']::name[]
     OR v_policy.cmd IS DISTINCT FROM 'SELECT'
     OR v_policy.with_check IS NOT NULL
     OR md5(v_policy.qual) IS DISTINCT FROM '4eb1f7f6c6533f2e9d859697807c4116' THEN
    RAISE EXCEPTION 'unsupported_viewings_select_policy';
  END IF;

  SELECT * INTO STRICT v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'viewings'
    AND policyname = 'viewings_update';
  IF v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
     OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
     OR v_policy.cmd IS DISTINCT FROM 'UPDATE'
     OR md5(v_policy.qual) IS DISTINCT FROM '94a099fe864ec5977b62e11d5d9b1c00'
     OR md5(v_policy.with_check) IS DISTINCT FROM '94a099fe864ec5977b62e11d5d9b1c00' THEN
    RAISE EXCEPTION 'unsupported_viewings_update_policy';
  END IF;

  SELECT * INTO STRICT v_policy
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'listings'
    AND policyname = 'listings_select_authenticated';
  IF v_policy.permissive IS DISTINCT FROM 'PERMISSIVE'
     OR v_policy.roles IS DISTINCT FROM ARRAY['authenticated']::name[]
     OR v_policy.cmd IS DISTINCT FROM 'SELECT'
     OR v_policy.with_check IS NOT NULL
     OR md5(v_policy.qual) IS DISTINCT FROM 'c7ff7614b1aec412b155398276249de6' THEN
    RAISE EXCEPTION 'unsupported_listings_authenticated_select_policy';
  END IF;

  IF NOT has_schema_privilege('authenticated', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'authenticated_private_schema_usage_missing';
  END IF;
END
$preflight$;

CREATE FUNCTION private.can_request_viewing_for_listing(
  p_listing_id UUID,
  p_expected_owner_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT COALESCE(
    (SELECT auth.uid()) IS NOT NULL
    AND p_listing_id IS NOT NULL
    AND p_expected_owner_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.listings AS l
      WHERE l.id = p_listing_id
        AND l.owner_id = p_expected_owner_id
        AND (
          (
            l.status = 'active'::public.listing_status
            AND COALESCE(l.is_off_market, false) = false
          )
          OR l.owner_id = (SELECT auth.uid())
          OR (
            l.organization_id IS NOT NULL
            AND private.has_org_permission(
              l.organization_id,
              'listing:view',
              (SELECT auth.uid())
            )
          )
        )
    ),
    false
  )
$function$;

ALTER FUNCTION private.can_request_viewing_for_listing(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_request_viewing_for_listing(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_request_viewing_for_listing(uuid, uuid)
  TO authenticated;

ALTER POLICY viewings_insert
  ON public.viewings
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      requester_id = (SELECT auth.uid())
      AND status = 'pending'::public.viewing_status
      AND private.can_request_viewing_for_listing(listing_id, owner_id)
    )
  );

COMMIT;
