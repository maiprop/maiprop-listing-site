-- Audit cross-check fixes:
-- 1. Resolve reports through an admin RPC that notifies the reporter.
-- 2. Require verified POF before sealed open-house offers can be submitted.
-- 3. Notify bidders when open-house offer statuses are revealed/accepted/rejected.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.open_house_registrations
  ADD COLUMN IF NOT EXISTS pof_rejection_reason TEXT;

COMMENT ON COLUMN public.open_house_registrations.pof_rejection_reason IS
  'Dedicated rejection note for proof-of-funds review. Keeps registration rejection_reason reserved for attendance approval decisions.';

DO $$ BEGIN
  CREATE TYPE public.listing_report_status AS ENUM ('pending', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.listing_reports
  ADD COLUMN IF NOT EXISTS status public.listing_report_status NOT NULL DEFAULT 'pending';

CREATE OR REPLACE FUNCTION public.admin_resolve_listing_report(p_report_id UUID)
RETURNS public.listing_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_report public.listing_reports%ROWTYPE;
  v_link TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.listing_reports
  SET status = 'resolved'::public.listing_report_status
  WHERE id = p_report_id
  RETURNING * INTO v_report;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'listing_report_not_found';
  END IF;

  v_link := CASE
    WHEN v_report.entity_type = 'firesale_request' THEN '/firesale'
    ELSE '/property/' || v_report.entity_id::TEXT
  END;

  IF v_report.reporter_id IS NOT NULL THEN
    PERFORM private.insert_interaction_notification(
      v_report.reporter_id,
      v_actor,
      'Report reviewed',
      'Your report has been reviewed by our moderation team.',
      'report',
      v_link
    );
  END IF;

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_listing_report(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_listing_report(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_resolve_listing_report(UUID) IS
  'Admin-only report resolution workflow. Updates report status and sends a best-effort in-app notification to the reporter.';

CREATE OR REPLACE FUNCTION public.get_open_house_capacity(p_listing_id UUID)
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
  v_actor UUID := (SELECT auth.uid());
  v_listing RECORD;
  v_settings public.open_house_settings%ROWTYPE;
  v_slot_count INTEGER := 0;
BEGIN
  SELECT id, owner_id, status, listing_type
    INTO v_listing
  FROM public.listings
  WHERE id = p_listing_id;

  IF NOT FOUND OR v_listing.listing_type IS DISTINCT FROM 'open_house' THEN
    RETURN;
  END IF;

  IF v_listing.status IS DISTINCT FROM 'active'::public.listing_status
     AND v_listing.owner_id IS DISTINCT FROM v_actor THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_settings
  FROM public.open_house_settings
  WHERE listing_id = p_listing_id;

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

REVOKE ALL ON FUNCTION public.get_open_house_capacity(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_open_house_capacity(UUID) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.get_open_house_capacity(UUID) IS
  'Returns aggregate open-house capacity counts without exposing visitor registration rows through RLS.';

CREATE OR REPLACE FUNCTION public.guard_open_house_registration_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

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
      OR NEW.pof_rejection_reason IS DISTINCT FROM OLD.pof_rejection_reason
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
      NEW.pof_rejection_reason := NULL;
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
  'Prevents open-house requesters from self-setting host-controlled verification, approval, attendance, proof-review, rejection-note, or capacity-sensitive timeslot fields.';

CREATE OR REPLACE FUNCTION private.notify_open_house_registration_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := COALESCE(NEW.approved_by, (SELECT auth.uid()));
  v_listing_title TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('approved', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT l.title INTO v_listing_title
  FROM public.listings l
  WHERE l.id = NEW.listing_id
  LIMIT 1;

  v_title := CASE NEW.status
    WHEN 'approved' THEN 'Open house registration approved'
    ELSE 'Open house registration rejected'
  END;

  v_body := CASE NEW.status
    WHEN 'approved' THEN concat_ws(' ', 'Your registration for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was approved.')
    ELSE concat_ws(
      ' ',
      'Your registration for',
      COALESCE(NULLIF(v_listing_title, ''), 'an open house'),
      'was rejected.',
      NULLIF(NEW.rejection_reason, '')
    )
  END;

  PERFORM private.insert_interaction_notification(
    NEW.requester_id,
    v_actor_id,
    v_title,
    v_body,
    'open_house',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_open_house_registration_status_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_open_house_registration_status_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_open_house_registration_in_app_notify ON public.open_house_registrations;
CREATE TRIGGER trg_open_house_registration_in_app_notify
  AFTER UPDATE OF status ON public.open_house_registrations
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notify_open_house_registration_status_change();

COMMENT ON FUNCTION private.notify_open_house_registration_status_change() IS
  'Creates best-effort in-app notifications for registrants when open-house registration requests are approved or rejected.';

CREATE OR REPLACE FUNCTION public.guard_open_house_offer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_owner_id UUID;
  v_open_house_date TIMESTAMPTZ;
  v_offer_deadline TIMESTAMPTZ;
  v_allow_sealed_bids BOOLEAN := TRUE;
  v_require_proof_of_funds BOOLEAN := FALSE;
  v_registration_status public.oh_registration_status;
  v_pof_verified_status TEXT;
  v_existing_accepted UUID;
  v_unrevealed_count INTEGER;
  v_accept_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_accept_rpc', TRUE), '');
  v_reopen_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_reopen_rpc', TRUE), '');
BEGIN
  SELECT
    l.owner_id,
    l.open_house_date,
    COALESCE(s.offer_deadline, NULL),
    COALESCE(s.allow_sealed_bids, TRUE),
    COALESCE(s.require_proof_of_funds, FALSE)
  INTO v_owner_id, v_open_house_date, v_offer_deadline, v_allow_sealed_bids, v_require_proof_of_funds
  FROM public.listings l
  LEFT JOIN public.open_house_settings s ON s.listing_id = l.id
  WHERE l.id = NEW.listing_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'open_house_listing_not_found';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.bidder_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION 'bidder_must_match_authenticated_user';
    END IF;

    IF COALESCE(NEW.status, 'submitted') <> 'submitted' THEN
      RAISE EXCEPTION 'new_offers_must_start_submitted';
    END IF;
  ELSE
    IF NEW.listing_id IS DISTINCT FROM OLD.listing_id OR NEW.bidder_id IS DISTINCT FROM OLD.bidder_id THEN
      RAISE EXCEPTION 'offer_identity_fields_are_immutable';
    END IF;

    IF v_actor = OLD.bidder_id THEN
      IF NEW.status = 'submitted' AND OLD.status = 'submitted' THEN
        NEW.revealed_at := NULL;
        NEW.decided_by := NULL;
        NEW.decided_at := NULL;
      ELSIF NEW.status IS DISTINCT FROM 'withdrawn' OR OLD.status NOT IN ('submitted', 'revealed') THEN
        RAISE EXCEPTION 'bidder_can_only_withdraw_active_offer';
      END IF;
    ELSIF v_actor = v_owner_id THEN
      IF NEW.status = 'revealed' AND OLD.status <> 'submitted' THEN
        IF v_reopen_rpc_context IS DISTINCT FROM NEW.listing_id::TEXT
           OR OLD.status NOT IN ('accepted', 'rejected') THEN
          RAISE EXCEPTION 'only_submitted_offers_can_be_revealed';
        END IF;
      END IF;
      IF NEW.status = 'accepted' AND OLD.status <> 'revealed' THEN
        RAISE EXCEPTION 'only_revealed_offers_can_be_accepted';
      END IF;
      IF NEW.status = 'accepted' AND v_accept_rpc_context IS DISTINCT FROM NEW.id::text THEN
        RAISE EXCEPTION 'accepted_offers_must_use_accept_rpc';
      END IF;
      IF NEW.status = 'rejected' AND OLD.status NOT IN ('submitted', 'revealed') THEN
        RAISE EXCEPTION 'only_active_offers_can_be_rejected';
      END IF;
      IF NEW.status = 'withdrawn' THEN
        RAISE EXCEPTION 'owner_cannot_withdraw_bidder_offer';
      END IF;
    ELSE
      RAISE EXCEPTION 'not_authorized_for_offer';
    END IF;
  END IF;

  IF NEW.status = 'submitted' THEN
    SELECT r.status, r.pof_verified_status
    INTO v_registration_status, v_pof_verified_status
    FROM public.open_house_registrations r
    WHERE r.listing_id = NEW.listing_id
      AND r.requester_id = NEW.bidder_id;

    IF v_registration_status IS DISTINCT FROM 'attended' THEN
      RAISE EXCEPTION 'only_attendees_can_submit_offers';
    END IF;

    IF v_require_proof_of_funds AND v_pof_verified_status IS DISTINCT FROM 'verified' THEN
      RAISE EXCEPTION 'proof_of_funds_must_be_verified';
    END IF;

    IF NOT v_allow_sealed_bids THEN
      RAISE EXCEPTION 'sealed_bids_disabled_for_open_house';
    END IF;

    IF v_open_house_date IS NULL OR v_open_house_date > now() THEN
      RAISE EXCEPTION 'offers_unlock_after_open_house';
    END IF;

    IF v_offer_deadline IS NOT NULL AND v_offer_deadline < now() THEN
      RAISE EXCEPTION 'sealed_bid_deadline_passed';
    END IF;
  END IF;

  IF NEW.status IN ('revealed', 'accepted') THEN
    IF COALESCE(v_offer_deadline, v_open_house_date) IS NOT NULL
       AND COALESCE(v_offer_deadline, v_open_house_date) > now() THEN
      RAISE EXCEPTION 'bids_cannot_be_revealed_before_deadline';
    END IF;
  END IF;

  IF NEW.status = 'accepted' THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.listing_id::text));

    SELECT id INTO v_existing_accepted
    FROM public.open_house_offers
    WHERE listing_id = NEW.listing_id
      AND status = 'accepted'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    LIMIT 1;

    IF v_existing_accepted IS NOT NULL THEN
      RAISE EXCEPTION 'active_offer_already_accepted';
    END IF;

    SELECT count(*) INTO v_unrevealed_count
    FROM public.open_house_offers
    WHERE listing_id = NEW.listing_id
      AND id <> NEW.id
      AND status = 'submitted';

    IF v_unrevealed_count > 0 THEN
      RAISE EXCEPTION 'reveal_all_bids_before_accepting_winner';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_open_house_offer(p_offer_id UUID)
RETURNS public.open_house_offers
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_offer public.open_house_offers%ROWTYPE;
  v_owner_id UUID;
  v_gate TIMESTAMPTZ;
  v_unrevealed_count INTEGER;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT o.*
  INTO v_offer
  FROM public.open_house_offers o
  WHERE o.id = p_offer_id;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'open_house_offer_not_found';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_offer.listing_id::text));

  SELECT l.owner_id, COALESCE(s.offer_deadline, l.open_house_date)
  INTO v_owner_id, v_gate
  FROM public.listings l
  LEFT JOIN public.open_house_settings s ON s.listing_id = l.id
  WHERE l.id = v_offer.listing_id;

  IF v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only_host_can_accept_offer';
  END IF;

  IF v_offer.status <> 'revealed' THEN
    RAISE EXCEPTION 'only_revealed_offers_can_be_accepted';
  END IF;

  IF v_gate IS NOT NULL AND v_gate > now() THEN
    RAISE EXCEPTION 'bids_cannot_be_accepted_before_deadline';
  END IF;

  SELECT count(*) INTO v_unrevealed_count
  FROM public.open_house_offers
  WHERE listing_id = v_offer.listing_id
    AND status = 'submitted';

  IF v_unrevealed_count > 0 THEN
    RAISE EXCEPTION 'reveal_all_bids_before_accepting_winner';
  END IF;

  PERFORM set_config('maiprop.open_house_accept_rpc', p_offer_id::text, TRUE);

  UPDATE public.open_house_offers
  SET
    status = 'accepted',
    decided_by = v_actor,
    decided_at = now(),
    revealed_at = COALESCE(revealed_at, now())
  WHERE id = p_offer_id
  RETURNING * INTO v_offer;

  UPDATE public.open_house_offers
  SET
    status = 'rejected',
    decided_by = v_actor,
    decided_at = now()
  WHERE listing_id = v_offer.listing_id
    AND id <> p_offer_id
    AND status IN ('submitted', 'revealed');

  UPDATE public.listings
  SET status = 'paused'::public.listing_status,
      updated_at = now()
  WHERE id = v_offer.listing_id
    AND status = 'active'::public.listing_status;

  RETURN v_offer;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_open_house_offer_selection(p_listing_id UUID)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_owner_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.listings
  WHERE id = p_listing_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'open_house_listing_not_found';
  END IF;

  IF v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only_host_can_reopen_offer_selection';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  IF NOT EXISTS (
    SELECT 1
    FROM public.open_house_offers
    WHERE listing_id = p_listing_id
      AND status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'open_house_no_accepted_offer_to_reopen';
  END IF;

  PERFORM set_config('maiprop.open_house_reopen_rpc', p_listing_id::TEXT, TRUE);

  UPDATE public.open_house_offers
  SET
    status = 'revealed',
    decided_by = NULL,
    decided_at = NULL,
    revealed_at = COALESCE(revealed_at, now())
  WHERE listing_id = p_listing_id
    AND status IN ('accepted', 'rejected');

  UPDATE public.listings
  SET status = 'active'::public.listing_status,
      updated_at = now()
  WHERE id = p_listing_id
    AND status = 'paused'::public.listing_status;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_open_house_offer_selection(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_open_house_offer_selection(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.reopen_open_house_offer_selection(UUID) IS
  'Host-only fallback for a failed accepted offer. Reopens the winner selection and restores the listing to active if it was paused by acceptance.';

CREATE OR REPLACE FUNCTION private.notify_open_house_offer_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := COALESCE(NEW.decided_by, (SELECT auth.uid()));
  v_listing_title TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('revealed', 'accepted', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT l.title INTO v_listing_title
  FROM public.listings l
  WHERE l.id = NEW.listing_id
  LIMIT 1;

  v_title := CASE NEW.status
    WHEN 'revealed' THEN 'Open house bid revealed'
    WHEN 'accepted' THEN 'Open house bid accepted'
    ELSE 'Open house bid not selected'
  END;

  v_body := CASE NEW.status
    WHEN 'revealed' THEN concat_ws(' ', 'Your sealed bid for', COALESCE(NULLIF(v_listing_title, ''), 'an open house listing'), 'has been opened.')
    WHEN 'accepted' THEN concat_ws(' ', 'Your bid for', COALESCE(NULLIF(v_listing_title, ''), 'an open house listing'), 'was accepted.')
    ELSE concat_ws(' ', 'Your bid for', COALESCE(NULLIF(v_listing_title, ''), 'an open house listing'), 'was not selected.')
  END;

  PERFORM private.insert_interaction_notification(
    NEW.bidder_id,
    v_actor_id,
    v_title,
    v_body,
    'open_house_offer',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_open_house_offer_status_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_open_house_offer_status_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_open_house_offer_notify ON public.open_house_offers;
CREATE TRIGGER trg_open_house_offer_notify
  AFTER UPDATE OF status ON public.open_house_offers
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.notify_open_house_offer_status_change();

COMMENT ON FUNCTION private.notify_open_house_offer_status_change() IS
  'Creates best-effort in-app notifications for bidders when open-house offers are revealed, accepted, or rejected.';
