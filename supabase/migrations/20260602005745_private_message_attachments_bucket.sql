-- Keep message attachments private at the bucket level.
--
-- The app retrieves message files through createSignedUrl() in
-- SignedAttachment, and storage.objects policies already restrict SELECT to
-- conversation participants. If the bucket itself is public, object URLs can
-- bypass that private/signed-url model whenever a path is known.

UPDATE storage.buckets
SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
WHERE id = 'message-attachments';

DO $$
DECLARE
  v_public boolean;
BEGIN
  SELECT public INTO v_public
  FROM storage.buckets
  WHERE id = 'message-attachments';

  IF v_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'message-attachments bucket must be private';
  END IF;
END $$;
