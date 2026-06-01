-- Add service-role-only explicit-user RPCs for the open-house capacity and
-- registration browser flows.
--
-- The legacy RPCs depend on auth.uid(), which is correct for direct browser
-- invocation but keeps SECURITY DEFINER execution available to every signed-in
-- user. Edge Functions now verify the caller JWT and call these explicit-user
-- variants with the service role instead.

CREATE OR REPLACE FUNCTION public.get_open_house_capacity_for_user(
  _user_id UUID,
  p_listing_id UUID
)
RETURNS TABLE (
  listing_id UUID,
  active_total INTEGER,
  max_total_visitors INTEGER,
  slot_counts JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing RECORD;
  v_settings public.open_house_settings%ROWTYPE;
  v_slot_count INTEGER := 0;
BEGIN
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '28000';
  END IF;

  SELECT id, owner_id, status, listing_type
    INTO v_listing
  FROM public.listings
  WHERE id = p_listing_id;

  IF NOT FOUND OR v_listing.listing_type IS DISTINCT FROM 'open_house' THEN
    RETURN;
  END IF;

  IF v_listing.status IS DISTINCT FROM 'active'::public.listing_status
     AND v_listing.owner_id IS DISTINCT FROM _user_id THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_settings
  FROM public.open_house_settings ohs
  WHERE ohs.listing_id = p_listing_id;

  v_slot_count := jsonb_array_length(COALESCE(v_settings.timeslots, '[]'::jsonb));

  RETURN QUERY
  WITH active_regs AS (
    SELECT r.timeslot_index, COUNT(*)::INTEGER AS active_count
    FROM public.open_house_registrations r
    WHERE r.listing_id = p_listing_id
      AND r.status NOT IN ('cancelled', 'rejected')
    GROUP BY r.timeslot_index
  ),
  totals AS (
    SELECT COALESCE(SUM(active_count), 0)::INTEGER AS active_total
    FROM active_regs
  ),
  slots AS (
    SELECT
      (idx - 1)::INTEGER AS slot_index,
      COALESCE(ar.active_count, 0)::INTEGER AS active_count,
      COALESCE(
        NULLIF(v_settings.timeslots -> (idx - 1) ->> 'max_visitors', '')::INTEGER,
        v_settings.max_visitors_per_slot
      ) AS max_visitors
    FROM generate_series(1, v_slot_count) AS idx
    LEFT JOIN active_regs ar ON ar.timeslot_index = idx - 1
  )
  SELECT
    p_listing_id,
    totals.active_total,
    v_settings.max_total_visitors,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'slot_index', slots.slot_index,
            'active_count', slots.active_count,
            'max_visitors', slots.max_visitors,
            'full', slots.max_visitors IS NOT NULL AND slots.active_count >= slots.max_visitors
          )
          ORDER BY slots.slot_index
        )
        FROM slots
      ),
      '[]'::jsonb
    )
  FROM totals;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_open_house_registration_for_user(
  _user_id UUID,
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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := _user_id;
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
  FROM public.open_house_settings ohs
  WHERE ohs.listing_id = p_listing_id
  FOR UPDATE;
  v_has_settings := FOUND;

  SELECT *
    INTO v_existing
  FROM public.open_house_registrations ohr
  WHERE ohr.listing_id = p_listing_id
    AND ohr.requester_id = v_user_id;

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

REVOKE ALL ON FUNCTION public.get_open_house_capacity_for_user(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_open_house_capacity_for_user(UUID, UUID)
  TO service_role;

REVOKE ALL ON FUNCTION public.create_open_house_registration_for_user(
  UUID,
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
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_open_house_registration_for_user(
  UUID,
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
) TO service_role;

COMMENT ON FUNCTION public.get_open_house_capacity_for_user(UUID, UUID) IS
  'Service-role-only explicit-user open-house capacity lookup for the open-house-capacity Edge Function.';

COMMENT ON FUNCTION public.create_open_house_registration_for_user(
  UUID,
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
  'Service-role-only explicit-user open-house registration creator for the open-house-registration Edge Function.';

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.get_open_house_capacity_for_user(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_open_house_capacity_for_user(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'public.get_open_house_capacity_for_user(uuid,uuid) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.get_open_house_capacity_for_user(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute public.get_open_house_capacity_for_user(uuid,uuid)';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.create_open_house_registration_for_user(uuid,uuid,integer,text,text,text,text,text,boolean,boolean,boolean)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.create_open_house_registration_for_user(uuid,uuid,integer,text,text,text,text,text,boolean,boolean,boolean)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'public.create_open_house_registration_for_user(...) must not be browser-callable';
  END IF;

  IF NOT has_function_privilege(
       'service_role',
       'public.create_open_house_registration_for_user(uuid,uuid,integer,text,text,text,text,text,boolean,boolean,boolean)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'service_role must execute public.create_open_house_registration_for_user(...)';
  END IF;
END $$;
