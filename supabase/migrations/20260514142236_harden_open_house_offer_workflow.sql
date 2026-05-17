-- Harden open-house sealed offer invariants at the database/RPC boundary.
-- This migration is intentionally local-only until the upgraded app is ready
-- for release; it does not mutate the linked Supabase project by itself.

CREATE UNIQUE INDEX IF NOT EXISTS idx_open_house_one_accepted_offer_per_listing
  ON public.open_house_offers (listing_id)
  WHERE status = 'accepted';

CREATE OR REPLACE FUNCTION public.guard_open_house_offer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_owner_id UUID;
  v_open_house_date TIMESTAMPTZ;
  v_offer_deadline TIMESTAMPTZ;
  v_allow_sealed_bids BOOLEAN := TRUE;
  v_registration_status public.oh_registration_status;
  v_existing_accepted UUID;
  v_unrevealed_count INTEGER;
  v_accept_rpc_context TEXT := NULLIF(current_setting('maiprop.open_house_accept_rpc', TRUE), '');
BEGIN
  SELECT
    l.owner_id,
    l.open_house_date,
    COALESCE(s.offer_deadline, NULL),
    COALESCE(s.allow_sealed_bids, TRUE)
  INTO v_owner_id, v_open_house_date, v_offer_deadline, v_allow_sealed_bids
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
        RAISE EXCEPTION 'only_submitted_offers_can_be_revealed';
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
    SELECT r.status INTO v_registration_status
    FROM public.open_house_registrations r
    WHERE r.listing_id = NEW.listing_id
      AND r.requester_id = NEW.bidder_id;

    IF v_registration_status IS DISTINCT FROM 'attended' THEN
      RAISE EXCEPTION 'only_attendees_can_submit_offers';
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

DROP TRIGGER IF EXISTS trg_guard_open_house_offer_mutation ON public.open_house_offers;
CREATE TRIGGER trg_guard_open_house_offer_mutation
  BEFORE INSERT OR UPDATE ON public.open_house_offers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_open_house_offer_mutation();

CREATE OR REPLACE FUNCTION public.submit_open_house_offer(
  p_listing_id UUID,
  p_amount NUMERIC,
  p_message TEXT DEFAULT NULL,
  p_currency TEXT DEFAULT 'EUR'
)
RETURNS public.open_house_offers
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_offer public.open_house_offers%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO public.open_house_offers (
    listing_id,
    bidder_id,
    amount,
    currency,
    message,
    status,
    submitted_at
  )
  VALUES (
    p_listing_id,
    v_actor,
    p_amount,
    COALESCE(NULLIF(p_currency, ''), 'EUR'),
    NULLIF(p_message, ''),
    'submitted',
    now()
  )
  ON CONFLICT (listing_id, bidder_id) DO UPDATE
  SET
    amount = EXCLUDED.amount,
    currency = EXCLUDED.currency,
    message = EXCLUDED.message,
    status = 'submitted',
    submitted_at = now(),
    revealed_at = NULL,
    decided_by = NULL,
    decided_at = NULL
  WHERE public.open_house_offers.status = 'submitted'
  RETURNING * INTO v_offer;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'offer_no_longer_editable';
  END IF;

  RETURN v_offer;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_open_house_offer(p_offer_id UUID)
RETURNS public.open_house_offers
LANGUAGE plpgsql
SET search_path = public
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

  RETURN v_offer;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_open_house_offer(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_open_house_offer(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_open_house_offer(UUID, NUMERIC, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_open_house_offer(UUID) TO authenticated, service_role;
