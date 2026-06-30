-- Keep admin listing-promotion notifications aligned with current product naming.
-- Internal keys remain unchanged for compatibility: is_featured and featured_listing.

CREATE OR REPLACE FUNCTION private.notify_featured_listing_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    v_title := CASE WHEN NEW.is_featured THEN 'Spotlight enabled' ELSE 'Spotlight removed' END;
    v_body := CASE
      WHEN NEW.is_featured THEN concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'now has Spotlight visibility.')
      ELSE concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'no longer has Spotlight visibility.')
    END;
  ELSIF NEW.featured_until IS DISTINCT FROM OLD.featured_until AND NEW.is_featured THEN
    v_title := 'Spotlight expiry updated';
    v_body := concat_ws(' ', 'The Spotlight expiry was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
  ELSIF NEW.priority_placement IS DISTINCT FROM OLD.priority_placement THEN
    v_title := 'Priority Rank updated';
    v_body := concat_ws(' ', 'The Priority Rank was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
  ELSE
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    NEW.owner_id,
    v_actor,
    v_title,
    v_body,
    'featured_listing',
    '/dashboard/listings'
  );

  RETURN NEW;
END;
$$;
