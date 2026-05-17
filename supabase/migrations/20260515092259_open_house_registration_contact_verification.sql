-- Open-house registrations must carry enough visitor information for a host
-- to make a real admission decision. Older rows are left untouched, but every
-- new RSVP must include contact details and explicit contact/ID consent.

ALTER TABLE public.open_house_registrations
  ADD COLUMN IF NOT EXISTS contact_name TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  ADD COLUMN IF NOT EXISTS visit_purpose TEXT,
  ADD COLUMN IF NOT EXISTS contact_permission_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS id_verification_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_acknowledged_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.enforce_open_house_registration_submission_requirements()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NULLIF(BTRIM(COALESCE(NEW.contact_name, '')), '') IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_name_required';
    END IF;

    IF NULLIF(BTRIM(COALESCE(NEW.contact_email, '')), '') IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_email_required';
    END IF;

    IF NULLIF(BTRIM(COALESCE(NEW.contact_phone, '')), '') IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_phone_required';
    END IF;

    IF NEW.contact_permission_at IS NULL THEN
      RAISE EXCEPTION 'open_house_contact_permission_required';
    END IF;

    IF NEW.id_verification_consent_at IS NULL THEN
      RAISE EXCEPTION 'open_house_id_verification_consent_required';
    END IF;

    IF NEW.privacy_acknowledged_at IS NULL THEN
      RAISE EXCEPTION 'open_house_privacy_acknowledgement_required';
    END IF;
  END IF;

  IF NEW.contact_email IS NOT NULL THEN
    NEW.contact_email := LOWER(BTRIM(NEW.contact_email));
  END IF;

  IF NEW.contact_name IS NOT NULL THEN
    NEW.contact_name := BTRIM(NEW.contact_name);
  END IF;

  IF NEW.contact_phone IS NOT NULL THEN
    NEW.contact_phone := BTRIM(NEW.contact_phone);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_open_house_registration_submission_requirements
  ON public.open_house_registrations;
CREATE TRIGGER trg_enforce_open_house_registration_submission_requirements
  BEFORE INSERT OR UPDATE ON public.open_house_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_open_house_registration_submission_requirements();

COMMENT ON FUNCTION public.enforce_open_house_registration_submission_requirements() IS
  'Requires contact details plus contact, ID verification, and privacy acknowledgements on every new open-house RSVP.';
