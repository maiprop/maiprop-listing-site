-- Replace owner ALL policies with explicit write-only policies where SELECT is
-- already covered by a broader public-read policy. This removes duplicate
-- permissive SELECT policy evaluation without changing public read access or
-- owner write access.

-- listing_images: public SELECT remains handled by "Listing images are public".
DROP POLICY IF EXISTS "listing_images_owner" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_owner_insert" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_owner_update" ON public.listing_images;
DROP POLICY IF EXISTS "listing_images_owner_delete" ON public.listing_images;

CREATE POLICY "listing_images_owner_insert"
  ON public.listing_images
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND listings.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "listing_images_owner_update"
  ON public.listing_images
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND listings.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND listings.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "listing_images_owner_delete"
  ON public.listing_images
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings
      WHERE listings.id = listing_images.listing_id
        AND listings.owner_id = (SELECT auth.uid())
    )
  );

-- open_house_settings: public SELECT remains handled by open_house_settings_select.
DROP POLICY IF EXISTS "open_house_settings_owner" ON public.open_house_settings;
DROP POLICY IF EXISTS "open_house_settings_owner_insert" ON public.open_house_settings;
DROP POLICY IF EXISTS "open_house_settings_owner_update" ON public.open_house_settings;
DROP POLICY IF EXISTS "open_house_settings_owner_delete" ON public.open_house_settings;

CREATE POLICY "open_house_settings_owner_insert"
  ON public.open_house_settings
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "open_house_settings_owner_update"
  ON public.open_house_settings
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "open_house_settings_owner_delete"
  ON public.open_house_settings
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_settings.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

-- project_media: project_media_select already covers active projects and owners.
DROP POLICY IF EXISTS "project_media_owner" ON public.project_media;
DROP POLICY IF EXISTS "project_media_owner_insert" ON public.project_media;
DROP POLICY IF EXISTS "project_media_owner_update" ON public.project_media;
DROP POLICY IF EXISTS "project_media_owner_delete" ON public.project_media;

CREATE POLICY "project_media_owner_insert"
  ON public.project_media
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_media_owner_update"
  ON public.project_media
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_media_owner_delete"
  ON public.project_media
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_media.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

-- project_units: project_units_select already covers active projects and owners.
DROP POLICY IF EXISTS "project_units_owner" ON public.project_units;
DROP POLICY IF EXISTS "project_units_owner_insert" ON public.project_units;
DROP POLICY IF EXISTS "project_units_owner_update" ON public.project_units;
DROP POLICY IF EXISTS "project_units_owner_delete" ON public.project_units;

CREATE POLICY "project_units_owner_insert"
  ON public.project_units
  FOR INSERT
  TO public
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_units_owner_update"
  ON public.project_units
  FOR UPDATE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "project_units_owner_delete"
  ON public.project_units
  FOR DELETE
  TO public
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects
      WHERE projects.id = project_units.project_id
        AND projects.owner_id = (SELECT auth.uid())
    )
  );
