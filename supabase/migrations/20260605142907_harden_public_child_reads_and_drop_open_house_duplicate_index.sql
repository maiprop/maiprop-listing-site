-- Narrow public child-table reads to assets/settings attached to public active
-- listings, while preserving owner write policies. Also removes a redundant
-- non-unique listing_id index that duplicates the table's unique constraint.

DROP POLICY IF EXISTS "Listing images are public" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_public_select" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_owner_select" ON public.listing_images;

CREATE POLICY "listing_images_public_select"
  ON public.listing_images
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND l.status = 'active'::public.listing_status
        AND l.is_off_market = false
    )
  );

CREATE POLICY "listing_images_owner_select"
  ON public.listing_images
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_images.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Open house settings: public read" ON public.open_house_settings;
DROP POLICY IF EXISTS "open_house_settings_select" ON public.open_house_settings;
DROP POLICY IF EXISTS "open_house_settings_owner_select" ON public.open_house_settings;

CREATE POLICY "open_house_settings_select"
  ON public.open_house_settings
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.status = 'active'::public.listing_status
        AND l.listing_type = 'open_house'::public.listing_type
        AND l.is_off_market = false
    )
  );

CREATE POLICY "open_house_settings_owner_select"
  ON public.open_house_settings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

DROP INDEX IF EXISTS public.idx_open_house_settings_listing;
