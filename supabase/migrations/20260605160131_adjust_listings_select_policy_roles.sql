-- Avoid multiple permissive SELECT policies for authenticated users while
-- keeping anonymous public catalog reads planner-friendly.

DROP POLICY IF EXISTS listings_select ON public.listings;
DROP POLICY IF EXISTS listings_select_owner ON public.listings;
DROP POLICY IF EXISTS listings_select_authenticated ON public.listings;

CREATE POLICY listings_select
ON public.listings
FOR SELECT
TO anon
USING (
  status = 'active'::listing_status
  AND is_off_market = false
);

CREATE POLICY listings_select_authenticated
ON public.listings
FOR SELECT
TO authenticated
USING (
  (
    status = 'active'::listing_status
    AND is_off_market = false
  )
  OR (SELECT auth.uid()) = owner_id
);
