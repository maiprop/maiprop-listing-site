-- Add expiry tracking to featured listings
-- Previously is_featured was permanent; now it auto-expires.

ALTER TABLE listings
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

-- Now that featured_until exists, include expiry changes in owner notifications.
CREATE OR REPLACE FUNCTION private.notify_featured_listing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    v_title := CASE WHEN NEW.is_featured THEN 'Listing featured' ELSE 'Listing removed from featured' END;
    v_body := CASE
      WHEN NEW.is_featured THEN concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'is now featured.')
      ELSE concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'is no longer featured.')
    END;
  ELSIF NEW.featured_until IS DISTINCT FROM OLD.featured_until AND NEW.is_featured THEN
    v_title := 'Featured listing expiry updated';
    v_body := concat_ws(' ', 'The featured expiry was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
  ELSIF NEW.priority_placement IS DISTINCT FROM OLD.priority_placement THEN
    v_title := 'Listing priority updated';
    v_body := concat_ws(' ', 'The priority placement was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
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

REVOKE ALL ON FUNCTION private.notify_featured_listing_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_featured_listing_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_featured_listing_notify ON public.listings;
CREATE TRIGGER trg_featured_listing_notify
  AFTER UPDATE OF is_featured, featured_until, priority_placement ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_featured_listing_change();

-- Auto-unfeat listings whose featured_until is in the past
CREATE OR REPLACE FUNCTION expire_featured_listings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE listings
  SET is_featured = false, featured_until = NULL
  WHERE is_featured = true
    AND featured_until IS NOT NULL
    AND featured_until < now();
END;
$$;

-- Let pg_cron call this every hour (run manually or via cron extension)
-- SELECT cron.schedule('expire-featured-listings', '0 * * * *', 'SELECT expire_featured_listings()');

-- Index to make expiry queries fast
CREATE INDEX IF NOT EXISTS idx_listings_featured_until
  ON listings(featured_until)
  WHERE is_featured = true AND featured_until IS NOT NULL;
