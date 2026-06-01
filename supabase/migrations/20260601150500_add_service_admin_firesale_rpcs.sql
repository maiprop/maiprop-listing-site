-- Add service-role-only firesale admin RPCs that receive the verified admin
-- actor explicitly from the protected Edge Function.

CREATE OR REPLACE FUNCTION public.admin_update_firesale_pipeline_deal_for_user(
  _admin_user_id UUID,
  p_deal_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_offer_price NUMERIC DEFAULT NULL,
  p_seller_response TEXT DEFAULT NULL,
  p_seller_response_price NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  deal_id UUID,
  status TEXT,
  notified INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := _admin_user_id;
  v_deal public.firesale_requests%ROWTYPE;
  v_previous_status TEXT;
  v_previous_seller_response TEXT;
  v_status TEXT := lower(trim(coalesce(p_status, '')));
  v_seller_response TEXT := lower(nullif(trim(coalesce(p_seller_response, '')), ''));
  v_notified INTEGER := 0;
  v_inserted INTEGER := 0;
  v_deal_address TEXT;
  v_seller_title TEXT;
  v_seller_body TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status NOT IN ('pending', 'reviewed', 'offer_sent', 'closed') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;

  IF v_seller_response IS NOT NULL
     AND v_seller_response NOT IN ('accepted', 'countered', 'rejected') THEN
    RAISE EXCEPTION 'invalid_seller_response';
  END IF;

  SELECT *
  INTO v_deal
  FROM public.firesale_requests
  WHERE id = p_deal_id
  FOR UPDATE;

  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'firesale_request_not_found';
  END IF;

  v_previous_status := v_deal.status;
  v_previous_seller_response := v_deal.seller_response;
  v_deal_address := concat_ws(', ', nullif(v_deal.address, ''), nullif(v_deal.city, ''));
  IF v_deal_address = '' THEN
    v_deal_address := 'your Quick Sale property';
  END IF;

  UPDATE public.firesale_requests fr
  SET
    status = v_status,
    admin_notes = NULLIF(p_admin_notes, ''),
    offer_price = CASE
      WHEN p_offer_price IS NOT NULL THEN p_offer_price
      ELSE fr.offer_price
    END,
    seller_response = CASE
      WHEN v_seller_response IS NOT NULL THEN v_seller_response
      ELSE fr.seller_response
    END,
    seller_response_price = CASE
      WHEN v_seller_response IS NOT NULL THEN COALESCE(p_seller_response_price, p_offer_price, fr.seller_response_price)
      ELSE fr.seller_response_price
    END,
    seller_responded_at = CASE
      WHEN v_seller_response IS NOT NULL
        AND v_seller_response IS DISTINCT FROM fr.seller_response THEN now()
      ELSE fr.seller_responded_at
    END
  WHERE fr.id = p_deal_id
  RETURNING fr.* INTO v_deal;

  IF v_deal.user_id IS NOT NULL AND v_status IS DISTINCT FROM v_previous_status THEN
    v_seller_title := CASE v_status
      WHEN 'reviewed' THEN 'Quick Sale request reviewed'
      WHEN 'offer_sent' THEN 'Quick Sale offer sent'
      WHEN 'closed' THEN 'Quick Sale request closed'
      ELSE NULL
    END;
    v_seller_body := CASE v_status
      WHEN 'reviewed' THEN 'Your Quick Sale request for ' || v_deal_address || ' has been reviewed by the mAI Prop team.'
      WHEN 'offer_sent' THEN 'An offer has been prepared for your Quick Sale request at ' || v_deal_address || '.'
      WHEN 'closed' THEN 'Your Quick Sale request for ' || v_deal_address || ' has been marked closed.'
      ELSE NULL
    END;

    IF v_seller_title IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, body, type, read, link)
      VALUES (v_deal.user_id, v_seller_title, v_seller_body, 'quick_sale', false, '/dashboard');
      GET DIAGNOSTICS v_inserted = ROW_COUNT;
      v_notified := v_notified + v_inserted;
    END IF;
  END IF;

  IF v_status = 'offer_sent' AND v_previous_status IS DISTINCT FROM 'offer_sent' THEN
    INSERT INTO public.notifications (user_id, title, body, type, read, link)
    SELECT DISTINCT
      fi.investor_id,
      'Quick Sale offer update',
      'An offer has been sent for ' || v_deal_address || '. We will update your queue status as the seller responds.',
      'investor_alert',
      false,
      '/investor-dashboard'
    FROM public.firesale_interest fi
    WHERE fi.deal_id = p_deal_id
      AND fi.status IN ('interested', 'prioritized', 'reserved', 'engaged', 'won');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_notified := v_notified + v_inserted;
  END IF;

  IF v_status = 'closed' AND v_previous_status IS DISTINCT FROM 'closed' THEN
    INSERT INTO public.notifications (user_id, title, body, type, read, link)
    SELECT DISTINCT
      fi.investor_id,
      CASE WHEN fi.status = 'won' THEN 'Quick Sale won' ELSE 'Quick Sale closed' END,
      CASE
        WHEN fi.status = 'won' THEN 'The seller accepted the winning path for ' || v_deal_address || '.'
        ELSE 'The Quick Sale opportunity at ' || v_deal_address || ' is now closed.'
      END,
      'investor_alert',
      false,
      '/investor-dashboard'
    FROM public.firesale_interest fi
    WHERE fi.deal_id = p_deal_id
      AND fi.status IN ('interested', 'prioritized', 'reserved', 'engaged', 'won');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_notified := v_notified + v_inserted;
  END IF;

  IF v_seller_response IN ('countered', 'rejected')
     AND v_seller_response IS DISTINCT FROM v_previous_seller_response THEN
    INSERT INTO public.notifications (user_id, title, body, type, read, link)
    SELECT DISTINCT
      fi.investor_id,
      CASE
        WHEN v_seller_response = 'countered' THEN 'Seller countered Quick Sale offer'
        ELSE 'Seller rejected Quick Sale offer'
      END,
      CASE
        WHEN v_seller_response = 'countered' THEN 'The seller countered the current offer for ' || v_deal_address || '.'
        ELSE 'The seller rejected the current offer for ' || v_deal_address || '.'
      END,
      'investor_alert',
      false,
      '/investor-dashboard'
    FROM public.firesale_interest fi
    WHERE fi.deal_id = p_deal_id
      AND fi.status IN ('reserved', 'engaged', 'won');
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
    v_notified := v_notified + v_inserted;
  END IF;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_notified;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_firesale_investor_publication_for_user(
  _admin_user_id UUID,
  p_deal_id UUID,
  p_published BOOLEAN
)
RETURNS TABLE (
  deal_id UUID,
  status TEXT,
  published_to_investors BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := _admin_user_id;
  v_deal public.firesale_requests%ROWTYPE;
  v_previous_status TEXT;
  v_previous_published BOOLEAN;
  v_deal_address TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO v_deal
  FROM public.firesale_requests
  WHERE id = p_deal_id
  FOR UPDATE;

  IF v_deal.id IS NULL THEN
    RAISE EXCEPTION 'firesale_request_not_found';
  END IF;

  v_previous_status := v_deal.status;
  v_previous_published := v_deal.published_to_investors;
  v_deal_address := concat_ws(', ', nullif(v_deal.address, ''), nullif(v_deal.city, ''));
  IF v_deal_address = '' THEN
    v_deal_address := 'a Quick Sale property';
  END IF;

  UPDATE public.firesale_requests fr
  SET
    published_to_investors = p_published,
    status = CASE
      WHEN p_published THEN 'reviewed'
      WHEN v_deal.status = 'reviewed' THEN 'pending'
      ELSE v_deal.status
    END
  WHERE fr.id = p_deal_id
  RETURNING fr.* INTO v_deal;

  IF p_published IS TRUE AND v_previous_published IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, title, body, type, read, link)
    SELECT DISTINCT
      p.user_id,
      'New Quick Sale deal available',
      'A new Quick Sale opportunity at ' || v_deal_address || ' is now available in your investor dashboard.',
      'investor_alert',
      false,
      '/investor-dashboard'
    FROM public.profiles p
    JOIN public.investor_subscriptions s ON s.user_id = p.user_id
    WHERE p.role::text IN ('investor', 'institutional')
      AND s.status IN ('active', 'trial')
      AND p.user_id IS DISTINCT FROM v_deal.user_id;
  END IF;

  IF v_deal.user_id IS NOT NULL
     AND v_previous_status = 'pending'
     AND v_deal.status = 'reviewed' THEN
    INSERT INTO public.notifications (user_id, title, body, type, read, link)
    VALUES (
      v_deal.user_id,
      'Quick Sale request reviewed',
      'Your Quick Sale request for ' || v_deal_address || ' has been reviewed by the mAI Prop team.',
      'quick_sale',
      false,
      '/dashboard'
    );
  END IF;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_deal.published_to_investors;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_firesale_interest_workflow_for_user(
  _admin_user_id UUID,
  p_interest_id UUID,
  p_status TEXT,
  p_reservation_hours INTEGER DEFAULT NULL,
  p_verify_pof BOOLEAN DEFAULT FALSE,
  p_admin_note TEXT DEFAULT NULL,
  p_proof_amount NUMERIC DEFAULT NULL
)
RETURNS public.firesale_interest
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := _admin_user_id;
  v_interest public.firesale_interest%ROWTYPE;
  v_hours INTEGER := GREATEST(COALESCE(p_reservation_hours, 24), 1);
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  PERFORM public.release_expired_firesale_reservations(NULL);

  UPDATE public.firesale_interest
  SET
    status = p_status,
    reservation_expires_at = CASE
      WHEN p_status = 'reserved' THEN now() + make_interval(hours => v_hours)
      WHEN p_status IN ('interested', 'prioritized', 'engaged', 'won', 'passed', 'expired') THEN NULL
      ELSE reservation_expires_at
    END,
    reserved_at = CASE
      WHEN p_status = 'reserved' THEN COALESCE(reserved_at, now())
      ELSE reserved_at
    END,
    reserved_by = CASE
      WHEN p_status = 'reserved' THEN COALESCE(reserved_by, v_actor)
      WHEN p_status IN ('interested', 'prioritized', 'passed', 'expired') THEN NULL
      ELSE reserved_by
    END,
    proof_amount = COALESCE(p_proof_amount, proof_amount),
    proof_of_funds_verified_at = CASE
      WHEN p_verify_pof THEN COALESCE(proof_of_funds_verified_at, now())
      ELSE proof_of_funds_verified_at
    END,
    proof_of_funds_verified_by = CASE
      WHEN p_verify_pof THEN COALESCE(proof_of_funds_verified_by, v_actor)
      ELSE proof_of_funds_verified_by
    END,
    admin_note = COALESCE(p_admin_note, admin_note)
  WHERE id = p_interest_id
  RETURNING * INTO v_interest;

  IF v_interest.id IS NULL THEN
    RAISE EXCEPTION 'firesale_interest_not_found';
  END IF;

  RETURN v_interest;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_firesale_pipeline_deal_for_user(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_set_firesale_investor_publication_for_user(UUID, UUID, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_firesale_interest_workflow_for_user(UUID, UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_update_firesale_pipeline_deal_for_user(UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_firesale_investor_publication_for_user(UUID, UUID, BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_update_firesale_interest_workflow_for_user(UUID, UUID, TEXT, INTEGER, BOOLEAN, TEXT, NUMERIC)
  TO service_role;

DO $$
DECLARE
  sig text;
  fn regprocedure;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.admin_update_firesale_pipeline_deal_for_user(uuid,uuid,text,text,numeric,text,numeric)',
    'public.admin_set_firesale_investor_publication_for_user(uuid,uuid,boolean)',
    'public.admin_update_firesale_interest_workflow_for_user(uuid,uuid,text,integer,boolean,text,numeric)'
  ] LOOP
    fn := to_regprocedure(sig);
    IF fn IS NULL THEN
      RAISE EXCEPTION 'missing service firesale admin RPC: %', sig;
    END IF;

    IF has_function_privilege('anon', fn::oid, 'EXECUTE')
       OR has_function_privilege('authenticated', fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'service firesale admin RPC must not be browser-callable: %', sig;
    END IF;

    IF NOT has_function_privilege('service_role', fn::oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'service_role must execute service firesale admin RPC: %', sig;
    END IF;
  END LOOP;
END $$;
