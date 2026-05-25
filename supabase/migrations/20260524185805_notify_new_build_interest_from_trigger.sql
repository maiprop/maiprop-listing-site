-- Create owner notifications for new-build registrations from the same
-- database-owned path that mirrors registrations into CRM/project leads.
--
-- Client-side inserts into notifications are intentionally blocked by RLS; this
-- SECURITY DEFINER trigger keeps the bell notification without reopening that
-- write surface.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.notify_new_build_interest_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_listing_title text;
  v_contact_name text;
BEGIN
  SELECT l.owner_id, l.title
    INTO v_owner_id, v_listing_title
    FROM public.listings l
   WHERE l.id = NEW.new_building_id
   LIMIT 1;

  IF v_owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_contact_name := COALESCE(
    NULLIF(NEW.full_name, ''),
    NULLIF(NEW.email, ''),
    'An interested buyer'
  );

  PERFORM private.insert_interaction_notification(
    v_owner_id,
    NEW.user_id,
    'New interest registered',
    concat_ws(
      ' ',
      v_contact_name,
      'registered interest in',
      COALESCE(NULLIF(v_listing_title, ''), 'your new-build listing')
    ),
    'new_interest',
    '/dashboard?tab=leads'
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not create new-build interest notification for new_building_lead %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_new_build_interest_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_new_build_interest_created() FROM anon, authenticated;

DROP TRIGGER IF EXISTS new_building_leads_notify_owner ON public.new_building_leads;
CREATE TRIGGER new_building_leads_notify_owner
  AFTER INSERT ON public.new_building_leads
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_new_build_interest_created();
