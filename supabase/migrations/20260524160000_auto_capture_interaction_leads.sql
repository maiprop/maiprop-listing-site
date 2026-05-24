-- Auto-capture CRM leads from inbound user interactions without weakening
-- owner-only RLS on public.leads.

CREATE OR REPLACE FUNCTION public.create_viewing_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_requester_email text;
  v_listing_title text;
  v_name text;
BEGIN
  BEGIN
    SELECT p.display_name, p.first_name, p.last_name, p.phone
      INTO v_display_name, v_first_name, v_last_name, v_phone
      FROM public.profiles p
     WHERE p.user_id = NEW.requester_id
     LIMIT 1;

    SELECT u.email
      INTO v_requester_email
      FROM auth.users u
     WHERE u.id = NEW.requester_id
     LIMIT 1;

    SELECT l.title
      INTO v_listing_title
      FROM public.listings l
     WHERE l.id = NEW.listing_id
     LIMIT 1;

    v_name := COALESCE(
      NULLIF(v_display_name, ''),
      NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
      NULLIF(v_requester_email, ''),
      'Viewing request'
    );

    INSERT INTO public.leads (
      owner_id,
      source,
      listing_id,
      name,
      email,
      phone,
      message,
      status,
      follow_up_at
    )
    VALUES (
      NEW.owner_id,
      'viewing',
      NEW.listing_id,
      v_name,
      v_requester_email,
      v_phone,
      concat_ws(
        ' ',
        'Viewing request for',
        COALESCE(NULLIF(v_listing_title, ''), 'listing'),
        concat('(', replace(NEW.viewing_type::text, '_', '-'), ')')
      ),
      'new',
      NEW.scheduled_at
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create viewing lead for viewing %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_viewing_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_viewing_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS viewings_create_owner_lead ON public.viewings;
CREATE TRIGGER viewings_create_owner_lead
  AFTER INSERT ON public.viewings
  FOR EACH ROW
  EXECUTE FUNCTION public.create_viewing_owner_lead();

CREATE OR REPLACE FUNCTION public.create_consultation_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner_id uuid;
  v_source text;
  v_follow_up_at timestamptz;
BEGIN
  BEGIN
    SELECT p.user_id
      INTO v_owner_id
      FROM public.professionals p
     WHERE p.id = NEW.professional_id
     LIMIT 1;

    IF v_owner_id IS NULL THEN
      RETURN NEW;
    END IF;

    v_source := CASE NEW.request_type
      WHEN 'callback' THEN 'callback'
      WHEN 'message' THEN 'message'
      ELSE 'consultation'
    END;

    BEGIN
      IF NEW.preferred_date IS NOT NULL THEN
        v_follow_up_at := (
          NEW.preferred_date::date + COALESCE(NULLIF(NEW.preferred_time, '')::time, time '09:00')
        )::timestamptz;
      END IF;
    EXCEPTION WHEN others THEN
      v_follow_up_at := NULL;
    END;

    INSERT INTO public.leads (
      owner_id,
      source,
      professional_id,
      name,
      email,
      phone,
      message,
      status,
      follow_up_at
    )
    VALUES (
      v_owner_id,
      v_source,
      NEW.professional_id,
      COALESCE(NULLIF(NEW.requester_name, ''), 'Consultation request'),
      NULLIF(NEW.requester_email, ''),
      NULLIF(NEW.requester_phone, ''),
      NEW.message,
      'new',
      v_follow_up_at
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create consultation lead for request %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_consultation_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_consultation_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS consultation_requests_create_owner_lead ON public.consultation_requests;
CREATE TRIGGER consultation_requests_create_owner_lead
  AFTER INSERT ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.create_consultation_owner_lead();

CREATE OR REPLACE FUNCTION public.create_conversation_owner_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing_owner_id uuid;
  v_owner_id uuid;
  v_requester_id uuid;
  v_display_name text;
  v_first_name text;
  v_last_name text;
  v_phone text;
  v_requester_email text;
  v_listing_title text;
  v_name text;
  v_source text;
BEGIN
  BEGIN
    IF NEW.participant_a IS NULL OR NEW.participant_b IS NULL THEN
      RETURN NEW;
    END IF;

    IF NEW.listing_id IS NOT NULL THEN
      SELECT l.owner_id, l.title
        INTO v_listing_owner_id, v_listing_title
        FROM public.listings l
       WHERE l.id = NEW.listing_id
       LIMIT 1;

      IF v_listing_owner_id = NEW.participant_a THEN
        v_owner_id := NEW.participant_a;
        v_requester_id := NEW.participant_b;
      ELSIF v_listing_owner_id = NEW.participant_b THEN
        v_owner_id := NEW.participant_b;
        v_requester_id := NEW.participant_a;
      ELSE
        RETURN NEW;
      END IF;
      v_source := 'listing_inquiry';
    ELSE
      v_owner_id := NEW.participant_b;
      v_requester_id := NEW.participant_a;
      v_source := 'message';
    END IF;

    IF v_owner_id IS NULL OR v_requester_id IS NULL OR v_owner_id = v_requester_id THEN
      RETURN NEW;
    END IF;

    SELECT p.display_name, p.first_name, p.last_name, p.phone
      INTO v_display_name, v_first_name, v_last_name, v_phone
      FROM public.profiles p
     WHERE p.user_id = v_requester_id
     LIMIT 1;

    SELECT u.email
      INTO v_requester_email
      FROM auth.users u
     WHERE u.id = v_requester_id
     LIMIT 1;

    v_name := COALESCE(
      NULLIF(v_display_name, ''),
      NULLIF(trim(concat_ws(' ', v_first_name, v_last_name)), ''),
      NULLIF(v_requester_email, ''),
      'Message inquiry'
    );

    INSERT INTO public.leads (
      owner_id,
      source,
      listing_id,
      name,
      email,
      phone,
      message,
      status
    )
    VALUES (
      v_owner_id,
      v_source,
      NEW.listing_id,
      v_name,
      v_requester_email,
      v_phone,
      CASE
        WHEN NEW.listing_id IS NULL THEN 'New message inquiry'
        ELSE concat('New listing inquiry for ', COALESCE(NULLIF(v_listing_title, ''), 'listing'))
      END,
      'new'
    );
  EXCEPTION WHEN others THEN
    RAISE WARNING 'Could not auto-create conversation lead for conversation %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_conversation_owner_lead() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_conversation_owner_lead() FROM anon, authenticated;

DROP TRIGGER IF EXISTS conversations_create_owner_lead ON public.conversations;
CREATE TRIGGER conversations_create_owner_lead
  AFTER INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.create_conversation_owner_lead();
