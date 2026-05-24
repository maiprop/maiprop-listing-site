-- Create in-app notifications for cross-user interactions.
-- Authenticated users cannot insert notifications directly; these trigger
-- functions run in the private schema and intentionally swallow notification
-- failures so the primary workflow is never blocked by the bell.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.insert_interaction_notification(
  p_user_id uuid,
  p_actor_id uuid,
  p_title text,
  p_body text,
  p_type text,
  p_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL OR p_user_id = p_actor_id THEN
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    VALUES (p_user_id, p_title, p_body, p_type, p_link);
  EXCEPTION WHEN undefined_column THEN
    -- Older environments may not have the later notifications.link column yet.
    INSERT INTO public.notifications (user_id, title, body, type)
    VALUES (p_user_id, p_title, p_body, p_type);
  END;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Could not create interaction notification for user %: %', p_user_id, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION private.insert_interaction_notification(uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.insert_interaction_notification(uuid, uuid, text, text, text, text) FROM anon, authenticated;

CREATE OR REPLACE FUNCTION private.notify_viewing_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing_title text;
BEGIN
  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    NEW.owner_id,
    NEW.requester_id,
    'New viewing request',
    concat_ws(' ', 'A buyer requested a', replace(NEW.viewing_type::text, '_', '-'), 'viewing for', COALESCE(NULLIF(v_listing_title, ''), 'your listing')),
    'viewing',
    '/dashboard?tab=viewings'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_viewing_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_viewing_created() FROM anon, authenticated;

DROP TRIGGER IF EXISTS interaction_notify_viewing_created ON public.viewings;
CREATE TRIGGER interaction_notify_viewing_created
  AFTER INSERT ON public.viewings
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_viewing_created();

CREATE OR REPLACE FUNCTION private.notify_viewing_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing_title text;
  v_actor_id uuid := auth.uid();
  v_recipient_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  v_recipient_id := CASE
    WHEN v_actor_id = NEW.requester_id THEN NEW.owner_id
    ELSE NEW.requester_id
  END;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    v_recipient_id,
    v_actor_id,
    'Viewing status updated',
    concat_ws(' ', 'Your viewing for', COALESCE(NULLIF(v_listing_title, ''), 'a listing'), 'is now', NEW.status::text),
    'viewing',
    '/dashboard?tab=viewings'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_viewing_status_changed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_viewing_status_changed() FROM anon, authenticated;

DROP TRIGGER IF EXISTS interaction_notify_viewing_status_changed ON public.viewings;
CREATE TRIGGER interaction_notify_viewing_status_changed
  AFTER UPDATE OF status ON public.viewings
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_viewing_status_changed();

CREATE OR REPLACE FUNCTION private.notify_consultation_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_professional_user_id uuid;
BEGIN
  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE id = NEW.professional_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    v_professional_user_id,
    NEW.requester_id,
    'New consultation request',
    concat_ws(' ', COALESCE(NULLIF(NEW.requester_name, ''), 'A client'), 'requested', COALESCE(NULLIF(NEW.service, ''), NEW.request_type)),
    'message',
    '/dashboard?tab=booking'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_consultation_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_consultation_created() FROM anon, authenticated;

DROP TRIGGER IF EXISTS interaction_notify_consultation_created ON public.consultation_requests;
CREATE TRIGGER interaction_notify_consultation_created
  AFTER INSERT ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_consultation_created();

CREATE OR REPLACE FUNCTION private.notify_consultation_status_changed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_professional_user_id uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.requester_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE id = NEW.professional_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    NEW.requester_id,
    v_professional_user_id,
    'Consultation status updated',
    concat_ws(' ', 'Your', COALESCE(NULLIF(NEW.service, ''), NEW.request_type), 'request is now', NEW.status),
    'message',
    '/dashboard?tab=booking'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_consultation_status_changed() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_consultation_status_changed() FROM anon, authenticated;

DROP TRIGGER IF EXISTS interaction_notify_consultation_status_changed ON public.consultation_requests;
CREATE TRIGGER interaction_notify_consultation_status_changed
  AFTER UPDATE OF status ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_consultation_status_changed();

CREATE OR REPLACE FUNCTION private.notify_message_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient_id uuid;
  v_listing_title text;
BEGIN
  SELECT
    CASE
      WHEN c.participant_a = NEW.sender_id THEN c.participant_b
      ELSE c.participant_a
    END,
    l.title
  INTO v_recipient_id, v_listing_title
  FROM public.conversations c
  LEFT JOIN public.listings l ON l.id = c.listing_id
  WHERE c.id = NEW.conversation_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    v_recipient_id,
    NEW.sender_id,
    'New message',
    COALESCE(NULLIF(v_listing_title, ''), 'You have a new conversation reply'),
    'message',
    '/messages'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_message_created() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_message_created() FROM anon, authenticated;

DROP TRIGGER IF EXISTS interaction_notify_message_created ON public.messages;
CREATE TRIGGER interaction_notify_message_created
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_message_created();
