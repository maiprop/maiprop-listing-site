-- Race-proof open-house registration creation.
-- Capacity cannot be enforced from the client because RLS hides other visitors'
-- registrations and concurrent inserts can overbook a slot. This RPC serializes
-- registration attempts per listing and checks total/slot capacity inside the
-- same transaction that creates the row.

CREATE OR REPLACE FUNCTION public.create_open_house_registration(
  p_listing_id UUID,
  p_timeslot_index INTEGER DEFAULT NULL,
  p_contact_name TEXT DEFAULT NULL,
  p_contact_email TEXT DEFAULT NULL,
  p_contact_phone TEXT DEFAULT NULL,
  p_visit_purpose TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL,
  p_contact_permission BOOLEAN DEFAULT FALSE,
  p_id_verification_consent BOOLEAN DEFAULT FALSE,
  p_privacy_acknowledgement BOOLEAN DEFAULT FALSE
)
RETURNS public.open_house_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_listing RECORD;
  v_settings public.open_house_settings%ROWTYPE;
  v_has_settings BOOLEAN := FALSE;
  v_timeslot_count INTEGER := 0;
  v_slot_max INTEGER := NULL;
  v_total_active INTEGER := 0;
  v_slot_active INTEGER := 0;
  v_existing public.open_house_registrations%ROWTYPE;
  v_registration public.open_house_registrations%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_contact_name, '')), '') IS NULL THEN
    RAISE EXCEPTION 'open_house_contact_name_required' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_contact_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'open_house_contact_email_required' USING ERRCODE = '23514';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_contact_phone, '')), '') IS NULL THEN
    RAISE EXCEPTION 'open_house_contact_phone_required' USING ERRCODE = '23514';
  END IF;

  IF NOT COALESCE(p_contact_permission, FALSE) THEN
    RAISE EXCEPTION 'open_house_contact_permission_required' USING ERRCODE = '23514';
  END IF;

  IF NOT COALESCE(p_id_verification_consent, FALSE) THEN
    RAISE EXCEPTION 'open_house_id_verification_consent_required' USING ERRCODE = '23514';
  END IF;

  IF NOT COALESCE(p_privacy_acknowledgement, FALSE) THEN
    RAISE EXCEPTION 'open_house_privacy_acknowledgement_required' USING ERRCODE = '23514';
  END IF;

  -- Serialize all capacity checks and inserts for the same listing.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_listing_id::TEXT, 0));

  SELECT id, owner_id, listing_type, status, open_house_date
    INTO v_listing
  FROM public.listings
  WHERE id = p_listing_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'open_house_listing_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_listing.listing_type IS DISTINCT FROM 'open_house' THEN
    RAISE EXCEPTION 'listing_is_not_open_house' USING ERRCODE = '23514';
  END IF;

  IF v_listing.status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'open_house_not_active' USING ERRCODE = '23514';
  END IF;

  IF v_listing.owner_id = v_user_id THEN
    RAISE EXCEPTION 'open_house_owner_cannot_register' USING ERRCODE = '42501';
  END IF;

  IF v_listing.open_house_date IS NOT NULL AND v_listing.open_house_date <= now() THEN
    RAISE EXCEPTION 'open_house_registration_closed' USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_settings
  FROM public.open_house_settings
  WHERE listing_id = p_listing_id
  FOR UPDATE;
  v_has_settings := FOUND;

  SELECT *
    INTO v_existing
  FROM public.open_house_registrations
  WHERE listing_id = p_listing_id
    AND requester_id = v_user_id;

  IF FOUND THEN
    RETURN v_existing;
  END IF;

  IF v_has_settings THEN
    v_timeslot_count := jsonb_array_length(COALESCE(v_settings.timeslots, '[]'::jsonb));

    SELECT COUNT(*)::INTEGER
      INTO v_total_active
    FROM public.open_house_registrations r
    WHERE r.listing_id = p_listing_id
      AND r.status NOT IN ('cancelled', 'rejected');

    IF v_settings.max_total_visitors IS NOT NULL
       AND v_total_active >= v_settings.max_total_visitors THEN
      RAISE EXCEPTION 'open_house_total_capacity_reached' USING ERRCODE = '23514';
    END IF;

    IF v_timeslot_count > 0 THEN
      IF p_timeslot_index IS NULL THEN
        RAISE EXCEPTION 'open_house_timeslot_required' USING ERRCODE = '23514';
      END IF;

      IF p_timeslot_index < 0 OR p_timeslot_index >= v_timeslot_count THEN
        RAISE EXCEPTION 'open_house_timeslot_invalid' USING ERRCODE = '22023';
      END IF;

      v_slot_max := COALESCE(
        NULLIF((v_settings.timeslots -> p_timeslot_index ->> 'max_visitors'), '')::INTEGER,
        v_settings.max_visitors_per_slot
      );

      IF v_slot_max IS NOT NULL THEN
        SELECT COUNT(*)::INTEGER
          INTO v_slot_active
        FROM public.open_house_registrations r
        WHERE r.listing_id = p_listing_id
          AND r.timeslot_index = p_timeslot_index
          AND r.status NOT IN ('cancelled', 'rejected');

        IF v_slot_active >= v_slot_max THEN
          RAISE EXCEPTION 'open_house_timeslot_capacity_reached' USING ERRCODE = '23514';
        END IF;
      END IF;
    ELSIF p_timeslot_index IS NOT NULL THEN
      RAISE EXCEPTION 'open_house_timeslot_invalid' USING ERRCODE = '22023';
    END IF;
  ELSIF p_timeslot_index IS NOT NULL THEN
    RAISE EXCEPTION 'open_house_timeslot_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('maiprop.open_house_registration_rpc', v_user_id::TEXT, TRUE);

  INSERT INTO public.open_house_registrations (
    listing_id,
    requester_id,
    contact_name,
    contact_email,
    contact_phone,
    contact_permission_at,
    id_verification_consent_at,
    privacy_acknowledged_at,
    visit_purpose,
    timeslot_index,
    status,
    note
  )
  VALUES (
    p_listing_id,
    v_user_id,
    BTRIM(p_contact_name),
    BTRIM(p_contact_email),
    BTRIM(p_contact_phone),
    now(),
    now(),
    now(),
    NULLIF(BTRIM(COALESCE(p_visit_purpose, '')), ''),
    CASE WHEN COALESCE(v_timeslot_count, 0) > 0 THEN p_timeslot_index ELSE NULL END,
    'pending',
    NULLIF(BTRIM(COALESCE(p_note, '')), '')
  )
  RETURNING * INTO v_registration;

  RETURN v_registration;
END;
$$;

REVOKE ALL ON FUNCTION public.create_open_house_registration(
  UUID,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_open_house_registration(
  UUID,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN
) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_open_house_registration(
  UUID,
  INTEGER,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BOOLEAN,
  BOOLEAN,
  BOOLEAN
) IS
  'Creates an open-house registration with per-listing transaction locking, server-side slot/total capacity checks, and required visitor contact consent checks.';

CREATE OR REPLACE FUNCTION public.guard_open_house_registration_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_registration_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_registration_rpc', TRUE), '');
BEGIN
  IF v_registration_rpc_context IS DISTINCT FROM NEW.requester_id::TEXT THEN
    RAISE EXCEPTION 'use_create_open_house_registration_rpc'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_open_house_registration_insert
  ON public.open_house_registrations;
CREATE TRIGGER trg_guard_open_house_registration_insert
  BEFORE INSERT ON public.open_house_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_open_house_registration_insert();

COMMENT ON FUNCTION public.guard_open_house_registration_insert() IS
  'Blocks direct open-house registration inserts so capacity checks cannot be bypassed outside create_open_house_registration().';

CREATE OR REPLACE FUNCTION public.guard_open_house_registration_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- Edge/service-role maintenance tasks run without an end-user JWT and are
  -- already trusted by function-level authorization.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT l.owner_id
    INTO v_owner_id
  FROM public.listings l
  WHERE l.id = NEW.listing_id;

  IF v_uid = OLD.requester_id AND v_uid IS DISTINCT FROM v_owner_id THEN
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
      OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
      OR NEW.timeslot_index IS DISTINCT FROM OLD.timeslot_index
      OR NEW.id_verified_at IS DISTINCT FROM OLD.id_verified_at
      OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
      OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
      OR NEW.attended_at IS DISTINCT FROM OLD.attended_at
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
      OR NEW.pof_verified_status IS DISTINCT FROM OLD.pof_verified_status
    THEN
      RAISE EXCEPTION 'host_controlled_open_house_fields';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
      RAISE EXCEPTION 'requester_can_only_cancel_registration';
    END IF;

    IF NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
      OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
    THEN
      NEW.pof_verified_status := 'unreviewed';
    END IF;

    RETURN NEW;
  END IF;

  IF v_uid = v_owner_id THEN
    IF NEW.status = 'attended' AND OLD.status <> 'approved' THEN
      RAISE EXCEPTION 'only_approved_registrations_can_be_attended';
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'not_authorized_for_open_house_registration';
END;
$$;

COMMENT ON FUNCTION public.guard_open_house_registration_update() IS
  'Prevents open-house requesters from self-setting host-controlled verification, approval, attendance, proof-review, or capacity-sensitive timeslot fields.';
