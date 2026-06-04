-- Isolate Quick Sale proof-of-funds documents from open-house documents.
--
-- Open-house documents use:   <requester_id>/<listing_id>/<file>
-- Firesale proof documents use: <investor_id>/firesale/<deal_id>/<file>
--
-- Previously both lived under open-house-docs, whose host-read policy could
-- expose unrelated firesale proof docs for a requester who also registered for
-- that host's open house. This migration creates a dedicated firesale bucket
-- and tightens the legacy open-house host policy to the listing-id path.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'firesale-proof-docs',
  'firesale-proof-docs',
  false,
  5242880,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['application/pdf'];

DROP POLICY IF EXISTS "Firesale proof docs own insert" ON storage.objects;
DROP POLICY IF EXISTS "Firesale proof docs own read" ON storage.objects;
DROP POLICY IF EXISTS "Firesale proof docs own update" ON storage.objects;
DROP POLICY IF EXISTS "Firesale proof docs own delete" ON storage.objects;
DROP POLICY IF EXISTS "Firesale proof docs admin read" ON storage.objects;

CREATE POLICY "Firesale proof docs own insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'firesale-proof-docs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (storage.foldername(name))[2] = 'firesale'
  );

CREATE POLICY "Firesale proof docs own read"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'firesale-proof-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.has_platform_admin((SELECT auth.uid()))
    )
  );

CREATE POLICY "Firesale proof docs own update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'firesale-proof-docs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (storage.foldername(name))[2] = 'firesale'
  )
  WITH CHECK (
    bucket_id = 'firesale-proof-docs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND (storage.foldername(name))[2] = 'firesale'
  );

CREATE POLICY "Firesale proof docs own delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'firesale-proof-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR public.has_platform_admin((SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Open house docs read owner or listing owner" ON storage.objects;
CREATE POLICY "Open house docs read owner or listing owner"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'open-house-docs'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR EXISTS (
        SELECT 1
        FROM public.open_house_registrations r
        JOIN public.listings l
          ON l.id = r.listing_id
         AND l.owner_id = (SELECT auth.uid())
        WHERE (storage.foldername(name))[1] = r.requester_id::text
          AND (storage.foldername(name))[2] = r.listing_id::text
      )
      OR public.has_platform_admin((SELECT auth.uid()))
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM storage.buckets
    WHERE id = 'firesale-proof-docs'
      AND public = false
      AND file_size_limit = 5242880
  ) THEN
    RAISE EXCEPTION 'firesale-proof-docs bucket must be private and limited to 5 MB';
  END IF;
END $$;
