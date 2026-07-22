-- Phase B listing read boundary.
--
-- Public catalogue reads use a fixed, allowlisted projection. Authenticated
-- owner, organization and platform-admin reads use a separate caller-scoped
-- projection. Direct INSERT/UPDATE/DELETE remain behind the existing listings
-- RLS policies and business triggers until the mutation RPC replacement has
-- equivalent quota, developer, project ownership and promotion coverage.

-- The public projection owns its fixed active/non-off-market predicate. Making
-- it security-definer allows anon/authenticated clients to use the projection
-- without retaining SELECT on the raw listings table.
ALTER VIEW public.public_listing_catalogue
  SET (security_invoker = false, security_barrier = true);

COMMENT ON VIEW public.public_listing_catalogue IS
  'Allowlisted active-listing projection for public APIs. Runs with the view owner privileges and exposes only the fixed active/non-off-market row predicate.';

CREATE OR REPLACE VIEW public.listing_management_catalogue
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  listing.*,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'url', image.url,
          'sort_order', image.sort_order
        )
        ORDER BY image.sort_order, image.id
      )
      FROM public.listing_images AS image
      WHERE image.listing_id = listing.id
    ),
    '[]'::jsonb
  ) AS listing_images,
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'offer_deadline', settings.offer_deadline
        )
        ORDER BY settings.created_at, settings.id
      )
      FROM public.open_house_settings AS settings
      WHERE settings.listing_id = listing.id
    ),
    '[]'::jsonb
  ) AS open_house_settings
FROM public.listings AS listing
WHERE (SELECT auth.uid()) IS NOT NULL
  AND (
    listing.owner_id = (SELECT auth.uid())
    OR (
      listing.organization_id IS NOT NULL
      AND private.has_org_permission(
        listing.organization_id,
        'listing:view',
        (SELECT auth.uid())
      )
    )
    OR private.has_platform_admin((SELECT auth.uid()))
  );

REVOKE ALL ON TABLE public.listing_management_catalogue
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.listing_management_catalogue TO authenticated;

COMMENT ON VIEW public.listing_management_catalogue IS
  'Caller-scoped listing projection for owner, authorized organization member and authoritative platform-admin workflows.';

-- Remove broad raw-table reads and privileges that application roles never
-- need. Authenticated DML is intentionally retained in this phase because the
-- existing RLS policies and triggers enforce current listing/pricing rules.
REVOKE ALL ON TABLE public.listings FROM anon;
REVOKE SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.listings
  FROM authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.listings TO authenticated;
GRANT SELECT (id, owner_id) ON TABLE public.listings TO authenticated;

DROP POLICY IF EXISTS listings_select ON public.listings;

COMMENT ON TABLE public.listings IS
  'Raw listing storage. Public and management reads use scoped projections; authenticated DML remains protected by listings RLS and business triggers.';
