-- Off-market listings are not public catalogue data. Owners can still read
-- their own rows, but anonymous/authenticated public SELECTs only see active
-- listings that are not marked off-market.

DROP POLICY IF EXISTS "Active listings are public" ON public.listings;
DROP POLICY IF EXISTS "listings_select" ON public.listings;

CREATE POLICY "listings_select"
  ON public.listings
  FOR SELECT
  USING (
    (
      status = 'active'::public.listing_status
      AND COALESCE(is_off_market, false) = false
    )
    OR (SELECT auth.uid()) = owner_id
  );
