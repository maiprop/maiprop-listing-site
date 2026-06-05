-- Keep public listing visibility behavior equivalent while making anonymous
-- catalog/count queries easier for Postgres to plan against partial indexes.
-- `is_off_market` is NOT NULL DEFAULT false, so COALESCE is unnecessary.

DROP POLICY IF EXISTS listings_select ON public.listings;
DROP POLICY IF EXISTS listings_select_owner ON public.listings;

CREATE POLICY listings_select
ON public.listings
FOR SELECT
TO public
USING (
  status = 'active'::listing_status
  AND is_off_market = false
);

CREATE POLICY listings_select_owner
ON public.listings
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = owner_id);
