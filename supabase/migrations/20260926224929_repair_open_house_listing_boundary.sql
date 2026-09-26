-- Selected release prerequisite: reviewed Task18 migration
-- 20260923193844_durable_new_build_enquiry_replay.sql. Do not replace its helper.
BEGIN;
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname='can_read_open_house_settings')
      OR (n.nspname='public' AND p.proname IN ('get_open_house_listing_context','get_admin_open_house_pof_reviews','review_admin_open_house_pof'))) THEN
    RAISE EXCEPTION 'unexpected_existing_open_house_boundary_interface';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE a.attrelid='public.open_house_registrations'::regclass AND a.attname='screening_score' AND a.attgenerated='s'
      AND md5(pg_get_expr(d.adbin,d.adrelid))='30f0bb71baa769956e45f87b9ebcf322') THEN
    RAISE EXCEPTION 'unexpected_open_house_screening_score_generation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_language lang ON lang.oid=p.prolang
    WHERE p.oid=to_regprocedure('private.current_user_owns_listing(uuid)')
      AND n.nspname='private' AND p.prorettype='boolean'::regtype
      AND p.proargnames=ARRAY['p_listing_id']::text[] AND NOT p.proretset
      AND p.prosecdef AND p.provolatile='s' AND lang.lanname='sql'
      AND p.proowner='postgres'::regrole AND p.proconfig=ARRAY['search_path=""']::text[]
      AND md5(p.prosrc)='24c8ab8244010ae2001b962cd1ff7b25'
      AND has_function_privilege('anon',p.oid,'EXECUTE')
      AND has_function_privilege('authenticated',p.oid,'EXECUTE')
      AND NOT EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE')
  ) THEN RAISE EXCEPTION 'task18_current_user_owns_listing_prerequisite_mismatch'; END IF;
END
$preflight$;
GRANT EXECUTE ON FUNCTION private.current_user_owns_listing(uuid) TO service_role;

CREATE OR REPLACE FUNCTION private.can_read_open_house_settings(p_listing_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.listings l WHERE l.id=p_listing_id
    AND ((l.status='active' AND l.listing_type='open_house' AND l.is_off_market=false)
      OR l.owner_id=(SELECT auth.uid())))
$$;
ALTER FUNCTION private.can_read_open_house_settings(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_read_open_house_settings(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_read_open_house_settings(uuid) TO anon,authenticated,service_role;

ALTER POLICY open_house_settings_select ON public.open_house_settings
  USING (private.can_read_open_house_settings(listing_id));
ALTER POLICY open_house_settings_owner_insert ON public.open_house_settings
  WITH CHECK (private.current_user_owns_listing(listing_id));
ALTER POLICY open_house_settings_owner_update ON public.open_house_settings
  USING (private.current_user_owns_listing(listing_id)) WITH CHECK (private.current_user_owns_listing(listing_id));
ALTER POLICY open_house_settings_owner_delete ON public.open_house_settings
  USING (private.current_user_owns_listing(listing_id));
ALTER POLICY oh_regs_select ON public.open_house_registrations USING (requester_id=(SELECT auth.uid()) OR private.current_user_owns_listing(listing_id));
ALTER POLICY oh_regs_update ON public.open_house_registrations USING (requester_id=(SELECT auth.uid()) OR private.current_user_owns_listing(listing_id)) WITH CHECK (requester_id=(SELECT auth.uid()) OR private.current_user_owns_listing(listing_id));
ALTER POLICY oh_offers_select ON public.open_house_offers USING (bidder_id=(SELECT auth.uid()) OR private.current_user_owns_listing(listing_id));
ALTER POLICY oh_offers_update ON public.open_house_offers USING (bidder_id=(SELECT auth.uid()) OR private.current_user_owns_listing(listing_id)) WITH CHECK (bidder_id=(SELECT auth.uid()) OR private.current_user_owns_listing(listing_id));

CREATE OR REPLACE FUNCTION public.guard_open_house_offer_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  WHERE l.id = NEW.listing_id
    AND v_actor IS NOT NULL
    AND (l.owner_id = v_actor OR (l.status = 'active' AND l.is_off_market = false));

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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_offer public.open_house_offers%ROWTYPE;
  v_owner_id UUID;
  v_gate TIMESTAMPTZ;
  v_unrevealed_count INTEGER;
  v_previous_marker text := current_setting('maiprop.open_house_accept_rpc', true);
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

  -- The first read finds the lock key only. Re-read the current row under it.
  SELECT o.* INTO v_offer FROM public.open_house_offers o
  WHERE o.id = p_offer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'open_house_offer_not_found'; END IF;

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

  PERFORM set_config('maiprop.open_house_accept_rpc', COALESCE(v_previous_marker, ''), true);
  RETURN v_offer;
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_open_house_offer_selection(p_listing_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_owner_id UUID;
  v_previous_marker text := current_setting('maiprop.open_house_reopen_rpc', true);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_listing_id::text));

  SELECT owner_id INTO v_owner_id
  FROM public.listings
  WHERE id = p_listing_id;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'open_house_listing_not_found';
  END IF;

  IF v_owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only_host_can_reopen_offer_selection';
  END IF;

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
  PERFORM set_config('maiprop.open_house_reopen_rpc', COALESCE(v_previous_marker, ''), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_open_house_registration_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_owner_id uuid;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF current_setting('maiprop.open_house_pof_review_rpc', true) = NEW.id::text
     AND v_uid IS NOT NULL AND COALESCE(private.has_platform_admin(v_uid), false)
     -- Stored generated columns are not populated in NEW in a BEFORE trigger.
     -- Its three source fields remain compared, so its final value cannot change.
     AND ((to_jsonb(NEW) || jsonb_build_object('screening_score',OLD.screening_score)) - ARRAY['pof_verified_status','pof_rejection_reason','updated_at'])
       IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY['pof_verified_status','pof_rejection_reason','updated_at']) THEN
    IF NEW.pof_verified_status IS NULL OR NEW.pof_verified_status NOT IN ('verified','rejected')
       OR (NEW.pof_verified_status = 'verified' AND NEW.pof_rejection_reason IS NOT NULL)
       OR (NEW.pof_verified_status = 'rejected' AND NULLIF(btrim(NEW.pof_rejection_reason),'') IS NULL) THEN
      RAISE EXCEPTION 'invalid_open_house_pof_decision' USING ERRCODE = '22023';
    END IF;
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

CREATE OR REPLACE FUNCTION private.notify_open_house_pof_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := COALESCE(NEW.approved_by, (SELECT auth.uid()));
  v_listing_title TEXT;
BEGIN
  IF NEW.pof_verified_status IS NOT DISTINCT FROM OLD.pof_verified_status THEN
    RETURN NEW;
  END IF;

  IF NEW.pof_verified_status IS NULL OR NEW.pof_verified_status NOT IN ('verified', 'rejected') THEN
    RETURN NEW;
  END IF;

  SELECT title INTO v_listing_title
  FROM public.listings
  WHERE id = NEW.listing_id
  LIMIT 1;

  PERFORM private.insert_interaction_notification(
    NEW.requester_id,
    v_actor,
    CASE
      WHEN NEW.pof_verified_status = 'verified' THEN 'Proof of funds verified'
      ELSE 'Proof of funds rejected'
    END,
    CASE
      WHEN NEW.pof_verified_status = 'verified'
        THEN concat_ws(' ', 'Your proof of funds for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was verified.')
      ELSE concat_ws(' ', 'Your proof of funds for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was rejected.', NULLIF(NEW.pof_rejection_reason, ''))
    END,
    'pof_review',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$$;

ALTER FUNCTION public.guard_open_house_offer_mutation() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.guard_open_house_offer_mutation() FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.accept_open_house_offer(uuid) OWNER TO postgres;
ALTER FUNCTION public.reopen_open_house_offer_selection(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.accept_open_house_offer(uuid), public.reopen_open_house_offer_selection(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.accept_open_house_offer(uuid), public.reopen_open_house_offer_selection(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_open_house_listing_context(p_listing_ids uuid[])
RETURNS TABLE (id uuid, owner_id uuid, title text, city text, address text, cover_image_url text,
 open_house_date timestamptz, price numeric, open_house_transaction_type text, open_house_settings jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  IF p_listing_ids IS NULL OR cardinality(p_listing_ids)>100 OR array_position(p_listing_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_open_house_listing_ids' USING ERRCODE='22023';
  END IF;
  IF auth.uid() IS NULL THEN RETURN; END IF;
  RETURN QUERY
  SELECT l.id,l.owner_id,l.title,l.city,l.address,l.cover_image_url,l.open_house_date,l.price,l.open_house_transaction_type,
    COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id',s.id,'listing_id',s.listing_id,'timeslots',s.timeslots,'max_visitors_per_slot',s.max_visitors_per_slot,
      'max_total_visitors',s.max_total_visitors,'broker_required',s.broker_required,
      'require_proof_of_funds',s.require_proof_of_funds,'min_proof_amount',s.min_proof_amount,
      'require_investor_declaration',s.require_investor_declaration,'offer_deadline',s.offer_deadline,
      'allow_sealed_bids',s.allow_sealed_bids,'created_at',s.created_at,'updated_at',s.updated_at))
      FROM public.open_house_settings s WHERE s.listing_id=l.id AND private.can_read_open_house_settings(l.id)), '[]'::jsonb)
  FROM public.listings l WHERE l.id=ANY(p_listing_ids)
    AND (l.listing_type='open_house' OR EXISTS(SELECT 1 FROM public.open_house_settings s WHERE s.listing_id=l.id)
      OR EXISTS(SELECT 1 FROM public.open_house_registrations r WHERE r.listing_id=l.id)
      OR EXISTS(SELECT 1 FROM public.open_house_offers o WHERE o.listing_id=l.id))
    AND (l.owner_id=auth.uid() OR (l.status='active' AND l.is_off_market=false AND (
      EXISTS(SELECT 1 FROM public.open_house_registrations r WHERE r.listing_id=l.id AND r.requester_id=auth.uid())
      OR EXISTS(SELECT 1 FROM public.open_house_offers o WHERE o.listing_id=l.id AND o.bidder_id=auth.uid()))));
END;
$$;
ALTER FUNCTION public.get_open_house_listing_context(uuid[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_open_house_listing_context(uuid[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_open_house_listing_context(uuid[]) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.get_admin_open_house_pof_reviews(p_listing_id uuid DEFAULT NULL)
RETURNS TABLE (id uuid, requester_id uuid, proof_of_funds_url text, proof_amount numeric, pof_verified_status text, pof_rejection_reason text, created_at timestamptz, listing_id uuid, rejection_reason text, status public.oh_registration_status, updated_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(private.has_platform_admin(auth.uid()),false) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT r.id,r.requester_id,r.proof_of_funds_url,r.proof_amount,r.pof_verified_status,r.pof_rejection_reason,r.created_at,r.listing_id,r.rejection_reason,r.status,r.updated_at FROM public.open_house_registrations r
  WHERE r.proof_of_funds_url IS NOT NULL AND (p_listing_id IS NULL OR r.listing_id=p_listing_id)
  ORDER BY r.created_at DESC,r.id DESC LIMIT 100;
END; $$;

CREATE OR REPLACE FUNCTION public.review_admin_open_house_pof(p_registration_id uuid,p_decision text,p_reason text,p_expected_updated_at timestamptz)
RETURNS TABLE (id uuid, requester_id uuid, proof_of_funds_url text, proof_amount numeric, pof_verified_status text, pof_rejection_reason text, created_at timestamptz, listing_id uuid, rejection_reason text, status public.oh_registration_status, updated_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_row public.open_house_registrations%ROWTYPE;
  v_previous_marker text := current_setting('maiprop.open_house_pof_review_rpc',true);
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(private.has_platform_admin(auth.uid()),false) THEN
    RAISE EXCEPTION 'platform_admin_required' USING ERRCODE='42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('verified','rejected')
    OR (p_decision='verified' AND p_reason IS NOT NULL)
    OR (p_decision='rejected' AND NULLIF(btrim(p_reason),'') IS NULL) THEN
    RAISE EXCEPTION 'invalid_open_house_pof_decision' USING ERRCODE='22023';
  END IF;
  SELECT r.* INTO v_row FROM public.open_house_registrations r WHERE r.id=p_registration_id FOR UPDATE;
  IF NOT FOUND OR v_row.proof_of_funds_url IS NULL THEN
    RAISE EXCEPTION 'open_house_pof_review_not_found' USING ERRCODE='P0002';
  END IF;
  IF v_row.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'open_house_pof_review_conflict' USING ERRCODE='40001';
  END IF;
  PERFORM set_config('maiprop.open_house_pof_review_rpc',p_registration_id::text,true);
  RETURN QUERY UPDATE public.open_house_registrations r
    SET pof_verified_status=p_decision,pof_rejection_reason=p_reason
    WHERE r.id=p_registration_id RETURNING r.id,r.requester_id,r.proof_of_funds_url,r.proof_amount,r.pof_verified_status,r.pof_rejection_reason,r.created_at,r.listing_id,r.rejection_reason,r.status,r.updated_at;
  PERFORM set_config('maiprop.open_house_pof_review_rpc',COALESCE(v_previous_marker,''),true);
END; $$;
ALTER FUNCTION public.get_admin_open_house_pof_reviews(uuid) OWNER TO postgres;
ALTER FUNCTION public.review_admin_open_house_pof(uuid,text,text,timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_open_house_pof_reviews(uuid),public.review_admin_open_house_pof(uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_admin_open_house_pof_reviews(uuid),public.review_admin_open_house_pof(uuid,text,text,timestamptz) TO authenticated,service_role;
COMMIT;
