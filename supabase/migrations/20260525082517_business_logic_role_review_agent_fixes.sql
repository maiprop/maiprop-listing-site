-- Business-logic hardening for role switches, professional reviews, and agent
-- data input. The guiding rule is: preserve useful history, stop new public or
-- counterparty activity immediately, and block role switches only when the user
-- has a live commitment that needs staff/manual completion.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Role switch: close active commitments without deleting history.
-- ---------------------------------------------------------------------------

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.conversations.closed_at IS
  'When set, the conversation is read-only. Used by role-switch cleanup to preserve history while stopping new messages.';

DROP POLICY IF EXISTS "Participants can send messages" ON public.messages;
DROP POLICY IF EXISTS "messages_insert" ON public.messages;
CREATE POLICY "messages_insert"
  ON public.messages FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      WHERE c.id = public.messages.conversation_id
        AND c.closed_at IS NULL
        AND (
          c.participant_a = (SELECT auth.uid())
          OR c.participant_b = (SELECT auth.uid())
        )
    )
  );

CREATE OR REPLACE FUNCTION private.close_role_switch_conversations(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_conversation RECORD;
  v_counterparty UUID;
  v_count INTEGER := 0;
BEGIN
  FOR v_conversation IN
    SELECT id, participant_a, participant_b
    FROM public.conversations
    WHERE closed_at IS NULL
      AND (participant_a = p_user_id OR participant_b = p_user_id)
    FOR UPDATE
  LOOP
    v_counterparty := CASE
      WHEN v_conversation.participant_a = p_user_id THEN v_conversation.participant_b
      ELSE v_conversation.participant_a
    END;

    UPDATE public.conversations
    SET
      closed_at = now(),
      closed_reason = 'role_switch',
      closed_by = p_user_id
    WHERE id = v_conversation.id
      AND closed_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    PERFORM private.insert_interaction_notification(
      v_counterparty,
      p_user_id,
      'Conversation closed',
      'This conversation was closed because the other participant switched account type.',
      'role_switch',
      '/messages'
    );
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION private.close_role_switch_conversations(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.cleanup_role_switch_dependencies(
  p_user_id UUID,
  p_leaving_role TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing RECORD;
  v_viewing RECORD;
  v_registration RECORD;
  v_offer RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'role_switch_user_id_required';
  END IF;

  -- Let overdue Quick Sale reservations expire first. Remaining reserved,
  -- engaged, or won rows are live commitments and must be resolved before a
  -- role switch can proceed.
  PERFORM public.release_expired_firesale_reservations(NULL);

  IF EXISTS (
    SELECT 1
    FROM public.firesale_interest fi
    WHERE fi.investor_id = p_user_id
      AND (
        fi.status IN ('engaged', 'won')
        OR (
          fi.status = 'reserved'
          AND COALESCE(fi.reservation_expires_at, now() + interval '100 years') > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'active_firesale_commitment_blocks_role_switch';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.open_house_offers o
    WHERE o.bidder_id = p_user_id
      AND o.status = 'accepted'
  ) THEN
    RAISE EXCEPTION 'accepted_open_house_offer_blocks_role_switch';
  END IF;

  -- Owner-side listing commitments: make the public inventory non-bookable and
  -- cancel pending appointments/RSVPs. The listing row remains in the dashboard
  -- as paused so the user can deliberately republish after switching back.
  FOR v_listing IN
    SELECT id, title, listing_type
    FROM public.listings
    WHERE owner_id = p_user_id
      AND status = 'active'::public.listing_status
    FOR UPDATE
  LOOP
    UPDATE public.viewings
    SET status = 'cancelled'::public.viewing_status,
        updated_at = now()
    WHERE listing_id = v_listing.id
      AND status IN ('pending'::public.viewing_status, 'confirmed'::public.viewing_status);

    FOR v_registration IN
      SELECT requester_id
      FROM public.open_house_registrations
      WHERE listing_id = v_listing.id
        AND status IN ('pending'::public.oh_registration_status, 'approved'::public.oh_registration_status)
      FOR UPDATE
    LOOP
      UPDATE public.open_house_registrations
      SET status = 'cancelled'::public.oh_registration_status,
          updated_at = now()
      WHERE listing_id = v_listing.id
        AND requester_id = v_registration.requester_id
        AND status IN ('pending'::public.oh_registration_status, 'approved'::public.oh_registration_status);

      PERFORM private.insert_interaction_notification(
        v_registration.requester_id,
        p_user_id,
        'Open-house registration cancelled',
        concat_ws(' ', COALESCE(NULLIF(v_listing.title, ''), 'An open-house listing'), 'is no longer available for registration.'),
        'open_house',
        CASE
          WHEN v_listing.listing_type = 'open_house' THEN '/open-house/' || v_listing.id::TEXT
          ELSE '/dashboard?tab=viewings'
        END
      );
    END LOOP;

    UPDATE public.open_house_offers
    SET status = 'withdrawn'::public.oh_offer_status
    WHERE listing_id = v_listing.id
      AND status IN ('submitted'::public.oh_offer_status, 'revealed'::public.oh_offer_status);

    UPDATE public.listings
    SET status = 'paused'::public.listing_status,
        updated_at = now()
    WHERE id = v_listing.id
      AND status = 'active'::public.listing_status;
  END LOOP;

  -- Requester-side commitments.
  FOR v_viewing IN
    SELECT v.id, v.owner_id, l.title
    FROM public.viewings v
    LEFT JOIN public.listings l ON l.id = v.listing_id
    WHERE v.requester_id = p_user_id
      AND v.status IN ('pending'::public.viewing_status, 'confirmed'::public.viewing_status)
    FOR UPDATE OF v
  LOOP
    PERFORM private.insert_interaction_notification(
      v_viewing.owner_id,
      p_user_id,
      'Viewing request cancelled',
      concat_ws(' ', 'A viewing request for', COALESCE(NULLIF(v_viewing.title, ''), 'your listing'), 'was cancelled because the requester switched account type.'),
      'viewing',
      '/dashboard?tab=viewings'
    );

    UPDATE public.viewings
    SET status = 'cancelled'::public.viewing_status,
        updated_at = now()
    WHERE id = v_viewing.id;
  END LOOP;

  FOR v_registration IN
    SELECT r.id, r.listing_id, l.owner_id, l.title
    FROM public.open_house_registrations r
    JOIN public.listings l ON l.id = r.listing_id
    WHERE r.requester_id = p_user_id
      AND r.status IN ('pending'::public.oh_registration_status, 'approved'::public.oh_registration_status)
    FOR UPDATE OF r
  LOOP
    PERFORM private.insert_interaction_notification(
      v_registration.owner_id,
      p_user_id,
      'Open-house registration cancelled',
      concat_ws(' ', 'A registration for', COALESCE(NULLIF(v_registration.title, ''), 'your open house'), 'was cancelled because the requester switched account type.'),
      'open_house',
      '/dashboard?tab=open-houses'
    );

    UPDATE public.open_house_registrations
    SET status = 'cancelled'::public.oh_registration_status,
        updated_at = now()
    WHERE id = v_registration.id;
  END LOOP;

  FOR v_offer IN
    SELECT o.id, l.owner_id, l.title
    FROM public.open_house_offers o
    JOIN public.listings l ON l.id = o.listing_id
    WHERE o.bidder_id = p_user_id
      AND o.status IN ('submitted'::public.oh_offer_status, 'revealed'::public.oh_offer_status)
    FOR UPDATE OF o
  LOOP
    PERFORM private.insert_interaction_notification(
      v_offer.owner_id,
      p_user_id,
      'Open-house offer withdrawn',
      concat_ws(' ', 'An offer for', COALESCE(NULLIF(v_offer.title, ''), 'your open house'), 'was withdrawn because the bidder switched account type.'),
      'open_house_offer',
      '/dashboard?tab=open-houses'
    );

    UPDATE public.open_house_offers
    SET status = 'withdrawn'::public.oh_offer_status
    WHERE id = v_offer.id;
  END LOOP;

  UPDATE public.firesale_interest
  SET status = 'passed',
      reservation_expires_at = NULL,
      reserved_at = NULL,
      reserved_by = NULL,
      last_status_changed_at = now()
  WHERE investor_id = p_user_id
    AND status IN ('interested', 'prioritized', 'expired');

  -- Professional-side requests.
  UPDATE public.consultation_requests cr
  SET status = 'cancelled',
      updated_at = now()
  FROM public.professionals p
  WHERE p.id = cr.professional_id
    AND p.user_id = p_user_id
    AND cr.status IN ('pending', 'confirmed');

  -- Private CRM state stays available but is no longer actionable.
  UPDATE public.leads
  SET status = 'lost',
      follow_up_at = NULL,
      notes = concat_ws(E'\n', NULLIF(notes, ''), '[Role switch] Archived as inactive during account type switch.'),
      updated_at = now()
  WHERE owner_id = p_user_id
    AND status NOT IN ('won', 'lost');

  UPDATE public.contacts
  SET deal_stage = 'lost',
      follow_up_at = NULL,
      notes = concat_ws(E'\n', NULLIF(notes, ''), '[Role switch] Archived as inactive during account type switch.'),
      updated_at = now()
  WHERE user_id = p_user_id
    AND COALESCE(deal_stage, 'new') <> 'lost';

  PERFORM private.close_role_switch_conversations(p_user_id);

  PERFORM private.insert_interaction_notification(
    p_user_id,
    NULL,
    'Account type switch started',
    'Your active listings and open requests were paused or cancelled while you choose a new account type.',
    'role_switch',
    '/onboarding'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.cleanup_role_switch_dependencies(UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.archive_role_data(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'archive_role_data_user_id_required';
  END IF;

  PERFORM private.cleanup_role_switch_dependencies(p_user_id, p_role);

  IF p_role = 'professional' THEN
    UPDATE public.professionals
    SET archived_at = now(), updated_at = now()
    WHERE user_id = p_user_id AND archived_at IS NULL;
  ELSIF p_role = 'developer' THEN
    UPDATE public.projects
    SET archived_at = now(), updated_at = now()
    WHERE owner_id = p_user_id AND archived_at IS NULL;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_role_data(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_role_data(uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.begin_role_switch()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  PERFORM public.archive_role_data(v_uid, v_role::text);

  UPDATE public.profiles
  SET
    participant_type = NULL,
    bio = NULL,
    role_switch_in_progress_at = now(),
    updated_at = now()
  WHERE user_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_update_failed';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_role_switch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_role_switch() TO authenticated;

-- ---------------------------------------------------------------------------
-- Professional reviews: client gate, moderation, notifications, responses.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.professional_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  body TEXT,
  service_type TEXT,
  property_city TEXT,
  transaction_year SMALLINT,
  recommended BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (professional_id, reviewer_id)
);

ALTER TABLE public.professional_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_review_professional(
  p_professional_id UUID,
  p_reviewer_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_professional_id IS NOT NULL
    AND p_reviewer_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = p_professional_id
        AND p.user_id = p_reviewer_id
    )
    AND EXISTS (
      SELECT 1
      FROM public.consultation_requests cr
      WHERE cr.professional_id = p_professional_id
        AND cr.requester_id = p_reviewer_id
        AND cr.status = 'completed'
    );
$$;

REVOKE ALL ON FUNCTION public.can_review_professional(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_review_professional(UUID, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.guard_professional_review_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF public.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.reviewer_id IS DISTINCT FROM OLD.reviewer_id THEN
      RAISE EXCEPTION 'review_identity_fields_are_immutable';
    END IF;
  END IF;

  IF NEW.reviewer_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'reviewer_must_match_authenticated_user';
  END IF;

  IF NOT public.can_review_professional(NEW.professional_id, NEW.reviewer_id) THEN
    RAISE EXCEPTION 'completed_consultation_required_for_review';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_professional_review_write() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_professional_review_write ON public.professional_reviews;
CREATE TRIGGER guard_professional_review_write
  BEFORE INSERT OR UPDATE ON public.professional_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_professional_review_write();

DROP POLICY IF EXISTS "reviews_admin_update" ON public.professional_reviews;
CREATE POLICY "reviews_admin_update"
  ON public.professional_reviews FOR UPDATE
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (public.has_platform_admin((SELECT auth.uid())));

DROP POLICY IF EXISTS "reviews_admin_delete" ON public.professional_reviews;
CREATE POLICY "reviews_admin_delete"
  ON public.professional_reviews FOR DELETE
  TO authenticated
  USING (public.has_platform_admin((SELECT auth.uid())));

CREATE OR REPLACE FUNCTION private.notify_professional_review_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_professional_user_id UUID;
BEGIN
  SELECT user_id INTO v_professional_user_id
  FROM public.professionals
  WHERE id = NEW.professional_id;

  PERFORM private.insert_interaction_notification(
    v_professional_user_id,
    NEW.reviewer_id,
    'New professional review',
    'A client left a new review on your professional profile.',
    'professional_review',
    '/dashboard/profile'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_professional_review_created() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notify_professional_review_created ON public.professional_reviews;
CREATE TRIGGER notify_professional_review_created
  AFTER INSERT ON public.professional_reviews
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_professional_review_created();

CREATE OR REPLACE FUNCTION public.sync_professional_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_professional_id UUID := COALESCE(NEW.professional_id, OLD.professional_id);
BEGIN
  UPDATE public.professionals
  SET
    rating = COALESCE((
      SELECT ROUND(AVG(rating)::numeric, 1)
      FROM public.professional_reviews
      WHERE professional_id = v_professional_id
    ), 0),
    reviews_count = (
      SELECT COUNT(*)
      FROM public.professional_reviews
      WHERE professional_id = v_professional_id
    ),
    updated_at = now()
  WHERE id = v_professional_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TABLE IF NOT EXISTS public.professional_review_responses (
  review_id UUID PRIMARY KEY REFERENCES public.professional_reviews(id) ON DELETE CASCADE,
  professional_id UUID NOT NULL REFERENCES public.professionals(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_review_responses ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_professional_review_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_professional_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT professional_id INTO v_professional_id
  FROM public.professional_reviews
  WHERE id = NEW.review_id;

  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'review_not_found';
  END IF;

  IF NEW.professional_id IS DISTINCT FROM v_professional_id THEN
    RAISE EXCEPTION 'review_response_professional_mismatch';
  END IF;

  IF NOT public.has_platform_admin(v_actor)
     AND NOT EXISTS (
       SELECT 1
       FROM public.professionals p
       WHERE p.id = v_professional_id
         AND p.user_id = v_actor
     ) THEN
    RAISE EXCEPTION 'only_reviewed_professional_can_respond';
  END IF;

  NEW.responder_id := COALESCE(NEW.responder_id, v_actor);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_professional_review_response() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_professional_review_response ON public.professional_review_responses;
CREATE TRIGGER guard_professional_review_response
  BEFORE INSERT OR UPDATE ON public.professional_review_responses
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_professional_review_response();

DROP POLICY IF EXISTS "professional_review_responses_public_read" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_public_read"
  ON public.professional_review_responses FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "professional_review_responses_owner_insert" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_owner_insert"
  ON public.professional_review_responses FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "professional_review_responses_owner_update" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_owner_update"
  ON public.professional_review_responses FOR UPDATE
  TO authenticated
  USING (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "professional_review_responses_owner_delete" ON public.professional_review_responses;
CREATE POLICY "professional_review_responses_owner_delete"
  ON public.professional_review_responses FOR DELETE
  TO authenticated
  USING (
    public.has_platform_admin((SELECT auth.uid()))
    OR EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = professional_review_responses.professional_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_professional_review_responses_professional
  ON public.professional_review_responses (professional_id, updated_at DESC);

-- ---------------------------------------------------------------------------
-- Agent data input: one review RPC semantic, true agent side, row discount.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.agent_data_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_address TEXT NOT NULL CHECK (length(property_address) BETWEEN 5 AND 300),
  city TEXT,
  postal_code TEXT,
  kaek TEXT,
  property_type TEXT NOT NULL CHECK (property_type IN ('apartment', 'house', 'commercial', 'land', 'other')),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('sale', 'rental')),
  agent_side TEXT NOT NULL CHECK (agent_side IN ('buyer', 'seller', 'both')),
  sale_price NUMERIC(14, 2) NOT NULL CHECK (sale_price > 0 AND sale_price < 1000000000),
  closing_date DATE NOT NULL CHECK (closing_date <= CURRENT_DATE AND closing_date >= CURRENT_DATE - INTERVAL '5 years'),
  buyer_name TEXT,
  seller_name TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'rejected', 'flagged')),
  rejection_reason TEXT,
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  discount_applied BOOLEAN NOT NULL DEFAULT false,
  discount_applied_at TIMESTAMPTZ,
  discount_invoice_id TEXT,
  discount_pct NUMERIC(5, 3) NOT NULL DEFAULT 0.5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_data_input_bans (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  banned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  banned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reason TEXT
);

ALTER TABLE public.agent_data_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_data_input_bans ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.agent_data_input_discount_pct_per_input()
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 0.5::NUMERIC
$$;

ALTER TABLE public.agent_data_inputs
  ADD COLUMN IF NOT EXISTS discount_pct NUMERIC(5, 3) NOT NULL DEFAULT 0.5;

COMMENT ON COLUMN public.agent_data_inputs.discount_pct IS
  'Per-entry subscription discount percentage captured at submission time.';

CREATE OR REPLACE FUNCTION public.admin_review_agent_data_input(
  p_input_id     UUID,
  p_decision     TEXT,
  p_reason       TEXT DEFAULT NULL,
  p_lifetime_ban BOOLEAN DEFAULT FALSE,
  p_reviewer_id  UUID DEFAULT NULL
)
RETURNS public.agent_data_inputs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_reviewer UUID;
  v_row public.agent_data_inputs%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    IF p_reviewer_id IS NULL THEN
      RAISE EXCEPTION 'not_authenticated';
    END IF;
    v_reviewer := p_reviewer_id;
  ELSE
    IF NOT public.has_platform_admin(v_uid) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    v_reviewer := COALESCE(p_reviewer_id, v_uid);
  END IF;

  IF p_decision NOT IN ('pending', 'verified', 'rejected', 'flagged') THEN
    RAISE EXCEPTION 'invalid_decision';
  END IF;

  UPDATE public.agent_data_inputs
  SET
    status = p_decision,
    rejection_reason = CASE WHEN p_decision IN ('rejected', 'flagged') THEN p_reason ELSE NULL END,
    reviewed_at = now(),
    reviewed_by = v_reviewer
  WHERE id = p_input_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF p_lifetime_ban THEN
    INSERT INTO public.agent_data_input_bans (user_id, banned_by, reason)
    VALUES (v_row.user_id, v_reviewer, COALESCE(p_reason, 'False / hallucinated submission'))
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT, BOOLEAN, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_review_agent_data_input(
  p_id UUID,
  p_action TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.agent_data_inputs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_decision TEXT;
  v_ban BOOLEAN := FALSE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_action = 'verify' THEN
    v_decision := 'verified';
  ELSIF p_action = 'reject' THEN
    v_decision := 'rejected';
  ELSIF p_action = 'reject_and_ban' THEN
    v_decision := 'rejected';
    v_ban := TRUE;
  ELSE
    RAISE EXCEPTION 'invalid_action';
  END IF;

  RETURN public.admin_review_agent_data_input(
    p_id,
    v_decision,
    p_reason,
    v_ban,
    v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_review_agent_data_input(UUID, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_agent_data_input(
  p_closed_at DATE,
  p_property_address TEXT,
  p_property_city TEXT,
  p_transaction_type TEXT,
  p_closing_price NUMERIC,
  p_property_postal_code TEXT DEFAULT NULL,
  p_property_type TEXT DEFAULT NULL,
  p_kaek TEXT DEFAULT NULL,
  p_buyer_name TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_agent_side TEXT DEFAULT 'seller'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := (SELECT auth.uid());
  v_role public.user_role;
  v_month_start TIMESTAMPTZ;
  v_month_bucket DATE;
  v_used INTEGER;
  v_id UUID;
  v_transaction_type TEXT;
  v_agent_side TEXT := lower(trim(coalesce(p_agent_side, 'seller')));
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role INTO v_role
  FROM public.profiles
  WHERE user_id = v_user
  LIMIT 1;

  IF v_role IS DISTINCT FROM 'agent' AND NOT public.has_platform_admin(v_user) THEN
    RAISE EXCEPTION 'agent_role_required' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agent_data_input_bans WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'agent_data_input_lifetime_banned' USING ERRCODE = '42501';
  END IF;

  IF p_transaction_type NOT IN ('sale', 'rent', 'rental') THEN
    RAISE EXCEPTION 'transaction_type must be sale or rent' USING ERRCODE = '22023';
  END IF;
  IF v_agent_side NOT IN ('buyer', 'seller', 'both') THEN
    RAISE EXCEPTION 'agent_side must be buyer, seller, or both' USING ERRCODE = '22023';
  END IF;
  IF p_closing_price IS NULL OR p_closing_price <= 0 THEN
    RAISE EXCEPTION 'closing_price must be > 0' USING ERRCODE = '22023';
  END IF;
  IF p_closed_at IS NULL OR p_closed_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'closed_at must be a past or present date' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_property_address, ''))) = 0 THEN
    RAISE EXCEPTION 'property_address is required' USING ERRCODE = '22023';
  END IF;
  IF length(trim(coalesce(p_property_city, ''))) = 0 THEN
    RAISE EXCEPTION 'property_city is required' USING ERRCODE = '22023';
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  v_month_bucket := (v_month_start AT TIME ZONE 'UTC')::DATE;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::TEXT || ':' || v_month_bucket::TEXT, 0));

  SELECT COUNT(*)
  INTO v_used
  FROM public.agent_data_inputs
  WHERE user_id = v_user
    AND created_at >= v_month_start;

  IF v_used >= 20 THEN
    RAISE EXCEPTION 'agent_data_input_monthly_limit_reached'
      USING ERRCODE = '23514';
  END IF;

  v_transaction_type := CASE
    WHEN p_transaction_type = 'rent' THEN 'rental'
    ELSE p_transaction_type
  END;

  INSERT INTO public.agent_data_inputs (
    user_id,
    property_address,
    city,
    postal_code,
    kaek,
    property_type,
    transaction_type,
    agent_side,
    sale_price,
    closing_date,
    buyer_name,
    seller_name,
    notes,
    discount_pct
  ) VALUES (
    v_user,
    trim(p_property_address),
    trim(p_property_city),
    NULLIF(trim(coalesce(p_property_postal_code, '')), ''),
    NULLIF(trim(coalesce(p_kaek, '')), ''),
    COALESCE(NULLIF(trim(coalesce(p_property_type, '')), ''), 'other'),
    v_transaction_type,
    v_agent_side,
    p_closing_price,
    p_closed_at,
    NULLIF(trim(coalesce(p_buyer_name, '')), ''),
    NULLIF(trim(coalesce(p_seller_name, '')), ''),
    NULLIF(trim(coalesce(p_notes, '')), ''),
    public.agent_data_input_discount_pct_per_input()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;
