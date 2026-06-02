-- Add bucket-level MIME and size enforcement for public asset buckets.
--
-- These buckets intentionally remain public because they back listing photos,
-- firesale request photos, and email template images. Public readability is
-- separate from upload safety; keep object types and maximum size explicit.

UPDATE storage.buckets
SET
  file_size_limit = 2097152,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]::text[]
WHERE id = 'email-assets';

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif'
  ]::text[]
WHERE id = 'firesale-photos';

UPDATE storage.buckets
SET
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/avif'
  ]::text[]
WHERE id = 'property-images';

DO $$
DECLARE
  v_unbounded text[];
BEGIN
  SELECT array_agg(id ORDER BY id)
  INTO v_unbounded
  FROM storage.buckets
  WHERE id IN ('email-assets', 'firesale-photos', 'property-images', 'message-attachments')
    AND (file_size_limit IS NULL OR allowed_mime_types IS NULL);

  IF v_unbounded IS NOT NULL THEN
    RAISE EXCEPTION 'storage buckets still lack size/MIME limits: %', v_unbounded;
  END IF;
END $$;
