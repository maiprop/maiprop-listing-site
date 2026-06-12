-- Critical audit remediations:
-- 1. Restrict browser UPDATE privileges on public.messages to current app needs.
-- 2. Make message identity/content fields immutable for all browser callers.
-- 3. Align firesale photo delete policy with request-id based storage paths.
-- 4. Tighten public view-event insert policies to visible entities only.

-- public.messages currently only needs browser INSERT, SELECT, and read-receipt
-- updates. Remove broad grants that were reintroduced by generic grant repair
-- migrations and re-grant only the columns used by src/hooks/useMessages.ts.
REVOKE ALL ON TABLE public.messages FROM anon, authenticated;
GRANT SELECT ON TABLE public.messages TO authenticated;
GRANT INSERT (conversation_id, sender_id, receiver_id, content) ON TABLE public.messages TO authenticated;
GRANT UPDATE (status, read_at) ON TABLE public.messages TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_message_receiver_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id
     OR OLD.conversation_id IS DISTINCT FROM NEW.conversation_id
     OR OLD.sender_id IS DISTINCT FROM NEW.sender_id
     OR OLD.receiver_id IS DISTINCT FROM NEW.receiver_id
     OR OLD.created_at IS DISTINCT FROM NEW.created_at
     OR OLD.content IS DISTINCT FROM NEW.content THEN
    RAISE EXCEPTION 'permission_denied: immutable message fields cannot be changed';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_message_receiver_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_message_receiver_update ON public.messages;
CREATE TRIGGER guard_message_receiver_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_message_receiver_update();

-- firesale-photos paths are `${firesale_request.id}/<file>`, not
-- `${auth.uid()}/<file>`. Deletion must therefore resolve the request owner.
DROP POLICY IF EXISTS "Users can delete their own firesale photos" ON storage.objects;
CREATE POLICY "Users can delete their own firesale photos"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'firesale-photos'
    AND (
      EXISTS (
        SELECT 1
        FROM public.firesale_requests fr
        WHERE fr.id::text = (storage.foldername(name))[1]
          AND fr.user_id = (SELECT auth.uid())
      )
      OR private.has_platform_admin((SELECT auth.uid()))
    )
  );

-- Keep view analytics writable from public pages, but block direct writes for
-- hidden/off-market/archived entities and block spoofed authenticated viewers.
REVOKE ALL ON TABLE public.listing_view_events FROM anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.listing_view_events TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can insert listing view" ON public.listing_view_events;
CREATE POLICY "Anyone can insert listing view"
  ON public.listing_view_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (viewer_id IS NULL OR viewer_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = listing_view_events.listing_id
        AND l.status = 'active'::listing_status
        AND COALESCE(l.is_off_market, false) = false
    )
  );

REVOKE ALL ON TABLE public.project_views FROM anon, authenticated;
GRANT INSERT, SELECT ON TABLE public.project_views TO anon, authenticated;

DROP POLICY IF EXISTS "Anyone can insert project view" ON public.project_views;
CREATE POLICY "Anyone can insert project view"
  ON public.project_views
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    (viewer_id IS NULL OR viewer_id = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.projects p
      WHERE p.id = project_views.project_id
        AND p.status = 'active'
        AND p.archived_at IS NULL
    )
  );
