-- Atomic listing view increment and event recording.
-- Replaces the client-side SELECT→UPDATE race condition in useTrackListingView.
--
-- increment_listing_views: adds 1 to views_count using a single UPDATE (no read needed)
-- record_listing_view_event: inserts a row into listing_view_events (separate call)
--
-- Both are SECURITY DEFINER so they bypass RLS and can be called from the anon key.
-- The functions themselves enforce minimal safety (valid UUID, null-safe viewer).

CREATE OR REPLACE FUNCTION increment_listing_views(p_listing_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE listings
  SET views_count = views_count + 1
  WHERE id = p_listing_id;
$$;

CREATE OR REPLACE FUNCTION record_listing_view_event(p_listing_id uuid, p_viewer_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO listing_view_events (listing_id, viewer_id)
  VALUES (p_listing_id, p_viewer_id);
$$;

-- Allow any authenticated or anonymous caller to invoke these via the anon key
GRANT EXECUTE ON FUNCTION increment_listing_views(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION record_listing_view_event(uuid, uuid) TO anon, authenticated;
