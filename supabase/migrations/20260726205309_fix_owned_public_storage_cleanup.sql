CREATE OR REPLACE FUNCTION private.can_select_message_attachment(
  p_conversation_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.id::TEXT = p_conversation_id
      AND (
        conversation.participant_a = (SELECT auth.uid())
        OR conversation.participant_b = (SELECT auth.uid())
      )
  );
$$;

REVOKE ALL ON FUNCTION private.can_select_message_attachment(TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_select_message_attachment(TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_select_open_house_document(
  p_requester_id TEXT,
  p_listing_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.open_house_registrations AS registration
    JOIN public.listings AS listing
      ON listing.id = registration.listing_id
    WHERE registration.requester_id::TEXT = p_requester_id
      AND registration.listing_id::TEXT = p_listing_id
      AND listing.owner_id = (SELECT auth.uid())
  );
$$;

REVOKE ALL ON FUNCTION private.can_select_open_house_document(TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_select_open_house_document(TEXT, TEXT)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "storage_objects_authenticated_select" ON storage.objects;

CREATE POLICY "storage_objects_authenticated_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    (
      bucket_id = 'firesale-proof-docs'
      AND (
        (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
        OR private.has_platform_admin((SELECT auth.uid()))
      )
    )
    OR (
      bucket_id = 'message-attachments'
      AND private.can_select_message_attachment(
        (storage.foldername(name))[2]
      )
    )
    OR (
      bucket_id = 'open-house-docs'
      AND (
        (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
        OR private.can_select_open_house_document(
          (storage.foldername(name))[1],
          (storage.foldername(name))[2]
        )
        OR private.has_platform_admin((SELECT auth.uid()))
      )
    )
    OR (
      bucket_id = 'listing-images'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
    )
    OR (
      bucket_id = 'project-media'
      AND (storage.foldername(name))[1] = (SELECT auth.uid())::TEXT
    )
  );

COMMENT ON FUNCTION private.can_select_message_attachment(TEXT) IS
  'Storage RLS helper that checks whether auth.uid() participates in the referenced conversation.';

COMMENT ON FUNCTION private.can_select_open_house_document(TEXT, TEXT) IS
  'Storage RLS helper that checks whether auth.uid() owns the listing for the referenced open-house registration.';
