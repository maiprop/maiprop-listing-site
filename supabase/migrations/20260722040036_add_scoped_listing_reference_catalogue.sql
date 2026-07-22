-- Minimal listing metadata used by relationship-heavy authenticated screens.
-- The view owns its row predicates so callers never need SELECT on the raw
-- listings table merely to render a title, city, image, or route.

CREATE OR REPLACE VIEW public.listing_reference_catalogue
WITH (security_barrier = true, security_invoker = false)
AS
SELECT
  listing.id,
  listing.owner_id,
  listing.organization_id,
  listing.project_id,
  listing.title,
  listing.city,
  listing.address,
  listing.cover_image_url,
  listing.listing_type,
  listing.is_pre_sale,
  listing.price,
  listing.sqm,
  listing.views_count,
  listing.status
FROM public.listings AS listing
WHERE
  (
    listing.status = 'active'::public.listing_status
    AND COALESCE(listing.is_off_market, false) = false
  )
  OR listing.owner_id = (SELECT auth.uid())
  OR private.has_platform_admin((SELECT auth.uid()))
  OR (
    listing.organization_id IS NOT NULL
    AND private.has_org_permission(
      listing.organization_id,
      'listing:view',
      (SELECT auth.uid())
    )
  )
  OR EXISTS (
    SELECT 1
    FROM public.favorites AS favorite
    WHERE favorite.listing_id = listing.id
      AND favorite.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.viewings AS viewing
    WHERE viewing.listing_id = listing.id
      AND (
        viewing.requester_id = (SELECT auth.uid())
        OR viewing.owner_id = (SELECT auth.uid())
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.listing_id = listing.id
      AND (
        conversation.participant_a = (SELECT auth.uid())
        OR conversation.participant_b = (SELECT auth.uid())
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.contacts AS contact
    WHERE contact.listing_id = listing.id
      AND contact.user_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1
    FROM public.leads AS lead
    WHERE lead.listing_id = listing.id
      AND lead.owner_id = (SELECT auth.uid())
  );

ALTER VIEW public.listing_reference_catalogue OWNER TO postgres;
REVOKE ALL ON public.listing_reference_catalogue FROM PUBLIC;
GRANT SELECT ON public.listing_reference_catalogue TO anon, authenticated;

COMMENT ON VIEW public.listing_reference_catalogue IS
  'Minimal listing metadata for public cards and authenticated relationship contexts; access is fixed by explicit public, owner, organization, admin, favorite, viewing, conversation, contact, and lead predicates.';
