-- Keep personal ownership distinct from organization authority, expose a
-- deterministic managed-catalogue cursor, and fail closed on organization
-- promotions until organization billing has its own ledger.

CREATE INDEX IF NOT EXISTS idx_listings_personal_management_cursor
  ON public.listings (owner_id, created_at DESC, id DESC)
  WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_listings_org_management_cursor
  ON public.listings (organization_id, created_at DESC, id DESC)
  WHERE organization_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue()
RETURNS SETOF public.listing_management_catalogue
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT catalogue.*
  FROM public.listing_management_catalogue AS catalogue
  WHERE (
    catalogue.organization_id IS NULL
    AND catalogue.owner_id = v_actor
  ) OR (
    catalogue.organization_id IS NOT NULL
    AND private.has_org_permission(
      catalogue.organization_id,
      'listing:manage',
      v_actor
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_manageable_listing_catalogue()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manageable_listing_catalogue()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue_page(
  p_limit integer DEFAULT 50,
  p_before_created_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS TABLE (
  data jsonb,
  total_count bigint,
  next_created_at timestamptz,
  next_id uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;
  IF (p_before_created_at IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'manageable_catalogue_cursor_invalid'
      USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH authorized AS MATERIALIZED (
    SELECT catalogue.*
    FROM public.listing_management_catalogue AS catalogue
    WHERE (
      catalogue.organization_id IS NULL
      AND catalogue.owner_id = v_actor
    ) OR (
      catalogue.organization_id IS NOT NULL
      AND private.has_org_permission(
        catalogue.organization_id,
        'listing:manage',
        v_actor
      )
    )
  ),
  page_plus_one AS MATERIALIZED (
    SELECT catalogue.*
    FROM authorized AS catalogue
    WHERE p_before_created_at IS NULL
      OR (catalogue.created_at, catalogue.id)
        < (p_before_created_at, p_before_id)
    ORDER BY catalogue.created_at DESC, catalogue.id DESC
    LIMIT v_limit + 1
  ),
  page_rows AS MATERIALIZED (
    SELECT catalogue.*
    FROM page_plus_one AS catalogue
    ORDER BY catalogue.created_at DESC, catalogue.id DESC
    LIMIT v_limit
  ),
  last_row AS (
    SELECT catalogue.created_at, catalogue.id
    FROM page_rows AS catalogue
    ORDER BY catalogue.created_at ASC, catalogue.id ASC
    LIMIT 1
  )
  SELECT
    COALESCE(
      (
        SELECT jsonb_agg(
          to_jsonb(catalogue)
          ORDER BY catalogue.created_at DESC, catalogue.id DESC
        )
        FROM page_rows AS catalogue
      ),
      '[]'::jsonb
    ),
    (SELECT count(*) FROM authorized),
    CASE
      WHEN (SELECT count(*) FROM page_plus_one) > v_limit
      THEN (SELECT created_at FROM last_row)
      ELSE NULL
    END,
    CASE
      WHEN (SELECT count(*) FROM page_plus_one) > v_limit
      THEN (SELECT id FROM last_row)
      ELSE NULL
    END;
END;
$$;

REVOKE ALL ON FUNCTION public.get_manageable_listing_catalogue_page(
  integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manageable_listing_catalogue_page(
  integer, timestamptz, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_manageable_listing_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  WITH authorized AS MATERIALIZED (
    SELECT listing.*
    FROM public.listings AS listing
    WHERE (
      listing.organization_id IS NULL
      AND listing.owner_id = v_actor
    ) OR (
      listing.organization_id IS NOT NULL
      AND private.has_org_permission(
        listing.organization_id,
        'listing:manage',
        v_actor
      )
    )
  )
  SELECT jsonb_build_object(
    'totalListings',
      count(*),
    'activeListings',
      count(*) FILTER (
        WHERE status = 'active'::public.listing_status
      ),
    'totalViews',
      COALESCE(sum(views_count), 0),
    'averageViews',
      COALESCE(round(avg(COALESCE(views_count, 0))), 0),
    'averageActiveDays',
      COALESCE(
        round(
          avg(
            extract(epoch FROM (now() - created_at)) / 86400
          ) FILTER (
            WHERE status = 'active'::public.listing_status
          )
        ),
        0
      ),
    'bestListing',
      (
        SELECT jsonb_build_object(
          'id', best.id,
          'title', best.title,
          'viewsCount', COALESCE(best.views_count, 0)
        )
        FROM authorized AS best
        ORDER BY COALESCE(best.views_count, 0) DESC, best.id ASC
        LIMIT 1
      )
  )
  INTO v_result
  FROM authorized;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_manageable_listing_summary()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_manageable_listing_summary()
  TO authenticated;

CREATE OR REPLACE FUNCTION public.activate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text,
  p_request_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_organization_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT listing.owner_id, listing.organization_id
  INTO v_owner_id, v_organization_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id;

  IF NOT FOUND OR v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'organization_promotion_billing_required'
      USING ERRCODE = '0A000',
      HINT = 'Personal credits cannot fund organization-owned listing promotions';
  END IF;

  RETURN private.activate_listing_promotion(
    p_listing_id,
    p_promotion_type,
    p_request_key
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.deactivate_listing_promotion(
  p_listing_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_owner_id uuid;
  v_organization_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  SELECT listing.owner_id, listing.organization_id
  INTO v_owner_id, v_organization_id
  FROM public.listings AS listing
  WHERE listing.id = p_listing_id;

  IF NOT FOUND OR v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_promotion_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'organization_promotion_billing_required'
      USING ERRCODE = '0A000',
      HINT = 'Personal credits cannot fund organization-owned listing promotions';
  END IF;

  RETURN private.deactivate_listing_promotion(
    p_listing_id,
    p_promotion_type
  );
END;
$$;

REVOKE ALL ON FUNCTION public.activate_listing_promotion(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.deactivate_listing_promotion(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_listing_promotion(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.deactivate_listing_promotion(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.get_manageable_listing_catalogue() IS
  'Personal listings plus organization listings authorized by an active listing:manage membership.';
COMMENT ON FUNCTION public.get_manageable_listing_catalogue_page(
  integer, timestamptz, uuid
) IS
  'Exact-count keyset page of the current actor managed listing catalogue.';
COMMENT ON FUNCTION public.get_manageable_listing_summary() IS
  'Authoritative managed listing counts and view aggregates for dashboard analytics.';
COMMENT ON FUNCTION public.activate_listing_promotion(uuid, text, text) IS
  'Personal-listing allocator. Organization promotions fail closed until a tenant billing ledger exists.';
COMMENT ON FUNCTION public.deactivate_listing_promotion(uuid, text) IS
  'Personal-listing revocation boundary. Organization promotions use the future tenant billing workflow.';
