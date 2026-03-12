-- Fix RLS so property cards load: public read for active listings and listing_images
-- Anonymous (anon) and authenticated users must be able to SELECT active listings and all listing_images.

-- 1. Listings: ensure anyone can SELECT active listings (and owners can see their own any-status)
DROP POLICY IF EXISTS "Active listings are public" ON public.listings;
CREATE POLICY "Active listings are public"
  ON public.listings
  FOR SELECT
  USING (
    status = 'active'::public.listing_status
    OR owner_id IS NULL
    OR auth.uid() = owner_id
  );

-- 2. Listing images: ensure anyone can SELECT (needed for nested select listing_images(...))
DROP POLICY IF EXISTS "Listing images are public" ON public.listing_images;
CREATE POLICY "Listing images are public"
  ON public.listing_images
  FOR SELECT
  USING (true);

-- 3. If no listings exist, insert minimal seed so homepage/auctions show something
INSERT INTO public.listings (
  title, city, price, sqm, property_type, listing_type, status,
  tags, owner_id
)
SELECT
  'Διαμέρισμα Κολωνάκι | Kolonaki Apartment',
  'Athens',
  350000,
  92,
  'apartment'::public.property_type,
  'sale'::public.listing_type,
  'active'::public.listing_status,
  ARRAY['source:seed']::text[],
  NULL
WHERE NOT EXISTS (SELECT 1 FROM public.listings LIMIT 1);

INSERT INTO public.listings (
  title, city, price, sqm, property_type, listing_type, status,
  auction_date, auction_starting_bid, tags, owner_id
)
SELECT
  'Πλειστηριασμός Διαμέρισμα | Auction Apartment',
  'Athens',
  120000,
  65,
  'apartment'::public.property_type,
  'auction'::public.listing_type,
  'active'::public.listing_status,
  (CURRENT_DATE + INTERVAL '14 days')::timestamptz,
  100000,
  ARRAY['source:seed', 'source:maiprop-os', 'os_auction:seed-1']::text[],
  NULL
WHERE (SELECT COUNT(*) FROM public.listings) < 2;
