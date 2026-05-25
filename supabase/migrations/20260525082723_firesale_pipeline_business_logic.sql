-- Quick Sale / Firesale pipeline business logic repair.
--
-- Own the workflow in Postgres so seller, investor, and admin screens all see
-- the same state regardless of which UI path performs the mutation.

-- 1) Structured seller response state. Existing legacy notes are backfilled
-- from the old "[SELLER:...]" prefix format and the prefix is removed.
ALTER TABLE public.firesale_requests
  ADD COLUMN IF NOT EXISTS seller_response TEXT,
  ADD COLUMN IF NOT EXISTS seller_response_price NUMERIC,
  ADD COLUMN IF NOT EXISTS seller_responded_at TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE public.firesale_requests
    ADD CONSTRAINT firesale_requests_seller_response_check
    CHECK (
      seller_response IS NULL
      OR seller_response IN ('accepted', 'countered', 'rejected')
    );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

WITH parsed AS (
  SELECT
    id,
    lower((regexp_match(admin_notes, '^\[SELLER:(ACCEPTED|COUNTERED|REJECTED)\]\s*'))[1]) AS response,
    regexp_replace(admin_notes, '^\[SELLER:(ACCEPTED|COUNTERED|REJECTED)\]\s*', '') AS clean_notes
  FROM public.firesale_requests
  WHERE admin_notes ~ '^\[SELLER:(ACCEPTED|COUNTERED|REJECTED)\]\s*'
)
UPDATE public.firesale_requests fr
SET
  seller_response = COALESCE(fr.seller_response, parsed.response),
  seller_responded_at = COALESCE(fr.seller_responded_at, fr.updated_at, now()),
  admin_notes = NULLIF(parsed.clean_notes, '')
FROM parsed
WHERE parsed.id = fr.id;

CREATE INDEX IF NOT EXISTS idx_firesale_requests_seller_status
  ON public.firesale_requests (user_id, status, created_at DESC)
  WHERE user_id IS NOT NULL;

-- 2) Investor feed should expose deal economics without contact/internal fields.
ALTER TABLE public.firesale_requests_investor_feed
  ADD COLUMN IF NOT EXISTS ai_estimate NUMERIC,
  ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS condition TEXT;

CREATE OR REPLACE FUNCTION public.sync_firesale_investor_feed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.firesale_requests_investor_feed WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF NEW.published_to_investors IS TRUE THEN
    INSERT INTO public.firesale_requests_investor_feed (
      id,
      created_at,
      address,
      city,
      property_type,
      sqm,
      bedrooms,
      condition,
      ai_estimate,
      asking_price,
      status
    )
    VALUES (
      NEW.id,
      NEW.created_at,
      NEW.address,
      NEW.city,
      NEW.property_type,
      NEW.sqm,
      NEW.bedrooms,
      NEW.condition,
      NEW.ai_estimate,
      NEW.asking_price,
      NEW.status
    )
    ON CONFLICT (id) DO UPDATE SET
      created_at = EXCLUDED.created_at,
      address = EXCLUDED.address,
      city = EXCLUDED.city,
      property_type = EXCLUDED.property_type,
      sqm = EXCLUDED.sqm,
      bedrooms = EXCLUDED.bedrooms,
      condition = EXCLUDED.condition,
      ai_estimate = EXCLUDED.ai_estimate,
      asking_price = EXCLUDED.asking_price,
      status = EXCLUDED.status;
  ELSE
    DELETE FROM public.firesale_requests_investor_feed WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_firesale_investor_feed() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_firesale_investor_feed() TO service_role;

DROP TRIGGER IF EXISTS trg_sync_firesale_investor_feed ON public.firesale_requests;
CREATE TRIGGER trg_sync_firesale_investor_feed
AFTER INSERT OR UPDATE OF
  published_to_investors,
  address,
  city,
  property_type,
  sqm,
  bedrooms,
  condition,
  ai_estimate,
  asking_price,
  status
OR DELETE
ON public.firesale_requests
FOR EACH ROW
EXECUTE FUNCTION public.sync_firesale_investor_feed();

INSERT INTO public.firesale_requests_investor_feed (
  id,
  created_at,
  address,
  city,
  property_type,
  sqm,
  bedrooms,
  condition,
  ai_estimate,
  asking_price,
  status
)
SELECT
  fr.id,
  fr.created_at,
  fr.address,
  fr.city,
  fr.property_type,
  fr.sqm,
  fr.bedrooms,
  fr.condition,
  fr.ai_estimate,
  fr.asking_price,
  fr.status
FROM public.firesale_requests fr
WHERE fr.published_to_investors IS TRUE
ON CONFLICT (id) DO UPDATE SET
  created_at = EXCLUDED.created_at,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  property_type = EXCLUDED.property_type,
  sqm = EXCLUDED.sqm,
  bedrooms = EXCLUDED.bedrooms,
  condition = EXCLUDED.condition,
  ai_estimate = EXCLUDED.ai_estimate,
  asking_price = EXCLUDED.asking_price,
  status = EXCLUDED.status;

DELETE FROM public.firesale_requests_investor_feed feed
USING public.firesale_requests fr
WHERE feed.id = fr.id
  AND fr.published_to_investors IS DISTINCT FROM TRUE;

-- 3) Non-admin investors may not mutate admin-verified proof fields.
CREATE OR REPLACE FUNCTION public.guard_firesale_interest_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_is_admin BOOLEAN := COALESCE(public.has_platform_admin(v_actor), FALSE);
  v_is_system_cleanup BOOLEAN := COALESCE(NULLIF(current_setting('maiprop.firesale_system_cleanup', TRUE), '')::BOOLEAN, FALSE);
  v_active_conflict UUID;
  v_active_hold_statuses CONSTANT TEXT[] := ARRAY['reserved', 'engaged', 'won'];
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS NULL THEN
      NEW.status := 'interested';
    END IF;

    IF NEW.last_status_changed_at IS NULL THEN
      NEW.last_status_changed_at := now();
    END IF;

    IF NOT v_is_admin THEN
      IF NEW.investor_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'cannot_create_interest_for_other_user';
      END IF;

      IF NEW.status NOT IN ('interested', 'prioritized') THEN
        RAISE EXCEPTION 'invalid_initial_interest_status';
      END IF;

      NEW.proof_of_funds_verified_at := NULL;
      NEW.proof_of_funds_verified_by := NULL;
      NEW.reservation_expires_at := NULL;
      NEW.reserved_at := NULL;
      NEW.reserved_by := NULL;
      NEW.admin_note := NULL;
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      NEW.last_status_changed_at := now();
    ELSE
      NEW.last_status_changed_at := COALESCE(NEW.last_status_changed_at, OLD.last_status_changed_at, now());
    END IF;

    IF NOT v_is_admin AND NOT v_is_system_cleanup THEN
      IF OLD.investor_id IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'cannot_update_other_user_interest';
      END IF;

      IF NEW.deal_id IS DISTINCT FROM OLD.deal_id
         OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
         OR NEW.reservation_expires_at IS DISTINCT FROM OLD.reservation_expires_at
         OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
         OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
         OR NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at
         OR NEW.proof_of_funds_verified_by IS DISTINCT FROM OLD.proof_of_funds_verified_by
         OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
        RAISE EXCEPTION 'investor_cannot_change_admin_managed_fields';
      END IF;

      IF OLD.proof_of_funds_verified_at IS NOT NULL
         AND (
           NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
           OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
         ) THEN
        RAISE EXCEPTION 'verified_proof_is_admin_managed';
      END IF;

      IF OLD.status IN ('reserved', 'engaged', 'won') AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'active_or_closed_interest_is_admin_managed';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('interested', 'prioritized')
         AND OLD.status NOT IN ('interested', 'prioritized', 'passed', 'expired') THEN
        RAISE EXCEPTION 'invalid_investor_status_transition';
      END IF;

      IF NEW.status IS DISTINCT FROM OLD.status
         AND NEW.status NOT IN ('interested', 'prioritized') THEN
        RAISE EXCEPTION 'investor_can_only_rejoin_or_prioritize';
      END IF;
    ELSIF v_is_system_cleanup THEN
      IF OLD.status IS DISTINCT FROM 'reserved'
         OR NEW.status IS DISTINCT FROM 'expired'
         OR NEW.deal_id IS DISTINCT FROM OLD.deal_id
         OR NEW.investor_id IS DISTINCT FROM OLD.investor_id
         OR NEW.reserved_at IS DISTINCT FROM OLD.reserved_at
         OR NEW.reserved_by IS DISTINCT FROM OLD.reserved_by
         OR NEW.proof_of_funds_url IS DISTINCT FROM OLD.proof_of_funds_url
         OR NEW.proof_amount IS DISTINCT FROM OLD.proof_amount
         OR NEW.proof_of_funds_verified_at IS DISTINCT FROM OLD.proof_of_funds_verified_at
         OR NEW.proof_of_funds_verified_by IS DISTINCT FROM OLD.proof_of_funds_verified_by
         OR NEW.admin_note IS DISTINCT FROM OLD.admin_note THEN
        RAISE EXCEPTION 'invalid_system_cleanup_transition';
      END IF;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF NOT v_is_admin
       AND OLD.investor_id = v_actor
       AND OLD.status IN ('reserved', 'engaged', 'won') THEN
      RAISE EXCEPTION 'cannot_delete_active_or_closed_interest';
    END IF;

    RETURN OLD;
  END IF;

  IF NEW.status = ANY(v_active_hold_statuses) THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW.deal_id::text));

    IF NEW.reservation_expires_at IS NULL OR NEW.reservation_expires_at <= now() THEN
      NEW.reservation_expires_at := now() + interval '24 hours';
    END IF;

    IF NEW.reserved_at IS NULL THEN
      NEW.reserved_at := now();
    END IF;

    IF NEW.reserved_by IS NULL THEN
      NEW.reserved_by := v_actor;
    END IF;

    SELECT id
    INTO v_active_conflict
    FROM public.firesale_interest
    WHERE deal_id = NEW.deal_id
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
      AND (
        status IN ('engaged', 'won')
        OR (
          status = 'reserved'
          AND COALESCE(reservation_expires_at, now() + interval '100 years') > now()
        )
      )
    LIMIT 1;

    IF v_active_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'active_reservation_exists_for_deal';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_firesale_interest_mutation() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.guard_firesale_interest_mutation() TO service_role;

-- 4) A safe investor-facing expression workflow. Verified POF is preserved on
-- re-expression; open/unverified proof can still be upgraded.
CREATE OR REPLACE FUNCTION public.submit_firesale_interest(
  p_deal_id UUID,
  p_message TEXT DEFAULT NULL,
  p_proof_amount NUMERIC DEFAULT NULL,
  p_proof_of_funds_url TEXT DEFAULT NULL
)
RETURNS public.firesale_interest
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_existing public.firesale_interest%ROWTYPE;
  v_result public.firesale_interest%ROWTYPE;
  v_has_proof BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.investor_subscriptions s ON s.user_id = p.user_id
    WHERE p.user_id = v_actor
      AND p.role::text IN ('investor', 'institutional')
      AND s.status IN ('active', 'trial')
  ) AND NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'investor_access_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.firesale_requests fr
    WHERE fr.id = p_deal_id
      AND fr.published_to_investors IS TRUE
      AND fr.status <> 'closed'
  ) THEN
    RAISE EXCEPTION 'firesale_deal_not_available';
  END IF;

  PERFORM public.release_expired_firesale_reservations(p_deal_id);

  SELECT *
  INTO v_existing
  FROM public.firesale_interest
  WHERE deal_id = p_deal_id
    AND investor_id = v_actor
  FOR UPDATE;

  IF v_existing.id IS NULL THEN
    v_has_proof := p_proof_of_funds_url IS NOT NULL OR p_proof_amount IS NOT NULL;

    INSERT INTO public.firesale_interest (
      deal_id,
      investor_id,
      status,
      message,
      proof_amount,
      proof_of_funds_url
    )
    VALUES (
      p_deal_id,
      v_actor,
      CASE WHEN v_has_proof THEN 'prioritized' ELSE 'interested' END,
      NULLIF(p_message, ''),
      p_proof_amount,
      p_proof_of_funds_url
    )
    RETURNING * INTO v_result;

    RETURN v_result;
  END IF;

  IF v_existing.status IN ('reserved', 'engaged', 'won') THEN
    RAISE EXCEPTION 'active_interest_is_admin_managed';
  END IF;

  v_has_proof := COALESCE(p_proof_of_funds_url, v_existing.proof_of_funds_url) IS NOT NULL
    OR COALESCE(p_proof_amount, v_existing.proof_amount) IS NOT NULL
    OR v_existing.proof_of_funds_verified_at IS NOT NULL;

  UPDATE public.firesale_interest
  SET
    status = CASE WHEN v_has_proof THEN 'prioritized' ELSE 'interested' END,
    message = NULLIF(p_message, ''),
    proof_amount = CASE
      WHEN v_existing.proof_of_funds_verified_at IS NOT NULL THEN v_existing.proof_amount
      ELSE COALESCE(p_proof_amount, v_existing.proof_amount)
    END,
    proof_of_funds_url = CASE
      WHEN v_existing.proof_of_funds_verified_at IS NOT NULL THEN v_existing.proof_of_funds_url
      ELSE COALESCE(p_proof_of_funds_url, v_existing.proof_of_funds_url)
    END
  WHERE id = v_existing.id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.submit_firesale_interest(UUID, TEXT, NUMERIC, TEXT) IS
  'Investor Quick Sale expression workflow. Preserves admin-verified proof of funds on re-expression and enforces investor eligibility.';

-- 5) Expire reservations proactively and notify the affected investor.
CREATE OR REPLACE FUNCTION public.release_expired_firesale_reservations(p_deal_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  PERFORM set_config('maiprop.firesale_system_cleanup', 'true', TRUE);
  PERFORM set_config('maiprop.audit_actor', '', TRUE);
  PERFORM set_config('maiprop.audit_action', 'reservation_expired', TRUE);

  WITH expired AS (
    UPDATE public.firesale_interest fi
    SET
      status = 'expired',
      reservation_expires_at = NULL,
      last_status_changed_at = now()
    FROM public.firesale_requests fr
    WHERE fi.deal_id = fr.id
      AND fi.status = 'reserved'
      AND fi.reservation_expires_at IS NOT NULL
      AND fi.reservation_expires_at <= now()
      AND (p_deal_id IS NULL OR fi.deal_id = p_deal_id)
    RETURNING
      fi.investor_id,
      concat_ws(', ', nullif(fr.address, ''), nullif(fr.city, '')) AS deal_address
  ),
  notified AS (
    INSERT INTO public.notifications (
      user_id,
      title,
      body,
      type,
      read,
      link
    )
    SELECT
      investor_id,
      'Quick Sale reservation expired',
      'Your first-look reservation for ' || COALESCE(NULLIF(deal_address, ''), 'a Quick Sale property') || ' has expired. You can rejoin the queue if the deal is still available.',
      'investor_alert',
      false,
      '/investor-dashboard'
    FROM expired
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM expired;

  PERFORM set_config('maiprop.firesale_system_cleanup', 'false', TRUE);
  RETURN v_count;
END;
$$;

-- 6) Admin status workflow: seller notifications, deal-specific investor
-- notifications, and structured seller response capture.
DROP FUNCTION IF EXISTS public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC);

CREATE OR REPLACE FUNCTION public.admin_update_firesale_pipeline_deal(
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
SET search_path = public
AS $$
DECLARE
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
  IF NOT public.has_platform_admin(auth.uid()) THEN
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

REVOKE ALL ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC, TEXT, NUMERIC) IS
  'Admin-only Quick Sale pipeline workflow. Updates status/notes/offer/seller response and emits seller plus deal-specific investor notifications.';

-- 7) Publication is the broad investor alert. It targets eligible investors,
-- not every profile with investor_mode enabled.
CREATE OR REPLACE FUNCTION public.admin_set_firesale_investor_publication(
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
SET search_path = public
AS $$
DECLARE
  v_deal public.firesale_requests%ROWTYPE;
  v_previous_status TEXT;
  v_previous_published BOOLEAN;
  v_deal_address TEXT;
BEGIN
  IF NOT public.has_platform_admin(auth.uid()) THEN
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

REVOKE ALL ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) IS
  'Admin-only Quick Sale publication workflow. Publishes sanitized investor feed rows and notifies eligible investors once per publication.';

-- 8) Cron-backed expiry sweep. Supabase Cron uses pg_cron; this remains
-- tolerant of local/dev environments where the extension is unavailable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) AND EXISTS (
    SELECT 1
    FROM cron.job
    WHERE jobname = 'release-expired-firesale-reservations'
  ) THEN
    PERFORM cron.unschedule('release-expired-firesale-reservations');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'cron'
  ) THEN
    RAISE NOTICE 'cron schema is unavailable; firesale reservation expiry schedule was not installed.';
    RETURN;
  END IF;

  PERFORM cron.schedule(
    'release-expired-firesale-reservations',
    '*/5 * * * *',
    'SELECT public.release_expired_firesale_reservations(NULL);'
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron not available: %. Skipping firesale reservation expiry schedule.', SQLERRM;
END $$;

REVOKE ALL ON FUNCTION public.release_expired_firesale_reservations(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_firesale_reservations(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.release_expired_firesale_reservations(UUID) IS
  'Expires overdue Quick Sale investor reservations, records audit entries, and notifies the affected investors. Scheduled by pg_cron when available.';
