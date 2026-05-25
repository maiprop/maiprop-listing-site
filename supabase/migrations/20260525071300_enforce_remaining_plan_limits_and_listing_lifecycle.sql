-- Enforce remaining plan limits and automate listing lifecycle side effects.
--
-- This migration intentionally keeps the existing UX model intact:
--   - contactsPerMonth limits new property/sell-side contact threads, not
--     ongoing messages inside an already-open conversation.
--   - openHouseRsvp limits new active RSVPs per month; existing registrations
--     and cancelled/rejected rows are not counted.
--   - price alerts notify only on real price drops and then advance the saved
--     comparison price so future drops can notify again.
--   - listing terminal statuses cancel pending dependent rows but do not rewrite
--     completed/attended history.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- Plan-limit helpers for the formerly decorative limits.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.remaining_plan_limit_role(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE COALESCE(p.role::TEXT, 'individual')
    WHEN 'individual' THEN 'buyer'
    WHEN 'seller_landlord' THEN 'seller'
    ELSE p.role::TEXT
  END
  FROM public.profiles p
  WHERE p.user_id = p_user_id
  LIMIT 1;
$$;

COMMENT ON FUNCTION private.remaining_plan_limit_role(UUID) IS
  'Normalizes legacy and current profile roles for remaining plan-limit enforcement.';

CREATE OR REPLACE FUNCTION public.get_contact_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.remaining_plan_limit_role(p_user_id);

  IF v_role = 'buyer' THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 1 END;
  END IF;

  RETURN 999;
END;
$$;

COMMENT ON FUNCTION public.get_contact_monthly_limit(UUID) IS
  'Monthly property/sell-side contact-thread limit. Free buyers get 1; paid/high-trust roles are unlimited.';

CREATE OR REPLACE FUNCTION public.get_open_house_rsvp_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.remaining_plan_limit_role(p_user_id);

  IF v_role = 'buyer' THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 3 END;
  END IF;

  RETURN 999;
END;
$$;

COMMENT ON FUNCTION public.get_open_house_rsvp_monthly_limit(UUID) IS
  'Monthly open-house RSVP limit. Free buyers get 3 active RSVPs; paid/high-trust roles are unlimited.';

CREATE OR REPLACE FUNCTION public.get_professionals_per_category_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.remaining_plan_limit_role(p_user_id);

  IF v_role = 'buyer' THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 5 END;
  END IF;

  RETURN 999;
END;
$$;

COMMENT ON FUNCTION public.get_professionals_per_category_limit(UUID) IS
  'Directory visibility limit by professional category. Free buyers see 5 per category; paid/high-trust roles are unlimited.';

CREATE OR REPLACE FUNCTION public.get_auction_listing_visible_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role TEXT;
BEGIN
  v_role := private.remaining_plan_limit_role(p_user_id);

  IF v_role IN ('buyer', 'seller', 'agent') THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 600 ELSE 60 END;
  END IF;

  RETURN 999;
END;
$$;

COMMENT ON FUNCTION public.get_auction_listing_visible_limit(UUID) IS
  'Auction listing visibility window. Free marketplace users see 60, Pro marketplace users see 600, high-trust roles are unlimited.';

-- ---------------------------------------------------------------------------
-- contactsPerMonth: server-side contact-thread enforcement.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION private.is_property_contact_conversation(
  p_participant_a UUID,
  p_participant_b UUID,
  p_listing_id UUID,
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_other_user_id UUID;
  v_other_role TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_participant_a IS DISTINCT FROM p_user_id
     AND p_participant_b IS DISTINCT FROM p_user_id THEN
    RETURN FALSE;
  END IF;

  -- Listing-scoped conversations are property contacts regardless of the
  -- owner's current role label.
  IF p_listing_id IS NOT NULL THEN
    RETURN TRUE;
  END IF;

  v_other_user_id := CASE
    WHEN p_participant_a = p_user_id THEN p_participant_b
    ELSE p_participant_a
  END;

  IF v_other_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  v_other_role := private.remaining_plan_limit_role(v_other_user_id);

  RETURN v_other_role IN ('seller', 'agent', 'developer');
END;
$$;

COMMENT ON FUNCTION private.is_property_contact_conversation(UUID, UUID, UUID, UUID) IS
  'Returns true when a conversation should consume a monthly property/sell-side contact allowance for the supplied user.';

CREATE INDEX IF NOT EXISTS idx_conversations_participant_a_created_at
  ON public.conversations(participant_a, created_at);

CREATE INDEX IF NOT EXISTS idx_conversations_participant_b_created_at
  ON public.conversations(participant_b, created_at);

CREATE OR REPLACE FUNCTION public.check_conversation_contact_monthly_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ := date_trunc('month', now())::timestamptz;
BEGIN
  -- Service-role maintenance and system inserts do not have an end-user JWT.
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_property_contact_conversation(
    NEW.participant_a,
    NEW.participant_b,
    NEW.listing_id,
    v_uid
  ) THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_contact_monthly_limit(v_uid);
  IF v_limit >= 999 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_count
  FROM public.conversations c
  WHERE c.created_at >= v_month_start
    AND private.is_property_contact_conversation(
      c.participant_a,
      c.participant_b,
      c.listing_id,
      v_uid
    );

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'contact_limit_reached'
      USING HINT = 'Upgrade to Pro for more property contacts per month';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_conversation_contact_monthly_limit
  ON public.conversations;
CREATE TRIGGER trg_check_conversation_contact_monthly_limit
  BEFORE INSERT ON public.conversations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_conversation_contact_monthly_limit();

CREATE OR REPLACE FUNCTION public.check_message_contact_monthly_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_conversation public.conversations%ROWTYPE;
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ := date_trunc('month', now())::timestamptz;
BEGIN
  IF v_uid IS NULL OR NEW.sender_id IS DISTINCT FROM v_uid THEN
    RETURN NEW;
  END IF;

  -- Ongoing messages in the same thread must remain unrestricted.
  IF EXISTS (
    SELECT 1
    FROM public.messages m
    WHERE m.conversation_id = NEW.conversation_id
      AND m.sender_id = NEW.sender_id
    LIMIT 1
  ) THEN
    RETURN NEW;
  END IF;

  SELECT *
    INTO v_conversation
  FROM public.conversations
  WHERE id = NEW.conversation_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NOT private.is_property_contact_conversation(
    v_conversation.participant_a,
    v_conversation.participant_b,
    v_conversation.listing_id,
    v_uid
  ) THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_contact_monthly_limit(v_uid);
  IF v_limit >= 999 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_count
  FROM public.conversations c
  WHERE c.created_at >= v_month_start
    AND c.id IS DISTINCT FROM NEW.conversation_id
    AND private.is_property_contact_conversation(
      c.participant_a,
      c.participant_b,
      c.listing_id,
      v_uid
    );

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'contact_limit_reached'
      USING HINT = 'Upgrade to Pro for more property contacts per month';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_message_contact_monthly_limit
  ON public.messages;
CREATE TRIGGER trg_check_message_contact_monthly_limit
  BEFORE INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.check_message_contact_monthly_limit();

-- ---------------------------------------------------------------------------
-- openHouseRsvp: server-side monthly RSVP enforcement.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_open_house_registrations_requester_month_active
  ON public.open_house_registrations(requester_id, created_at)
  WHERE status NOT IN ('cancelled', 'rejected');

CREATE OR REPLACE FUNCTION public.check_open_house_rsvp_monthly_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit INTEGER;
  v_count INTEGER;
  v_month_start TIMESTAMPTZ := date_trunc('month', now())::timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  v_limit := public.get_open_house_rsvp_monthly_limit(NEW.requester_id);
  IF v_limit >= 999 THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_count
  FROM public.open_house_registrations r
  WHERE r.requester_id = NEW.requester_id
    AND r.created_at >= v_month_start
    AND r.status NOT IN ('cancelled', 'rejected');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'open_house_rsvp_limit_reached'
      USING HINT = 'Upgrade to Pro for unlimited open-house RSVPs';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_open_house_rsvp_monthly_limit
  ON public.open_house_registrations;
CREATE TRIGGER trg_check_open_house_rsvp_monthly_limit
  BEFORE INSERT ON public.open_house_registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.check_open_house_rsvp_monthly_limit();

-- ---------------------------------------------------------------------------
-- Price alerts: notify users when a favorited listing drops below saved price.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_favorites_listing_price_alert
  ON public.favorites(listing_id)
  WHERE price_alert = TRUE;

CREATE OR REPLACE FUNCTION private.notify_favorite_price_drop()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.price IS NULL
     OR NEW.price IS NULL
     OR NEW.price >= OLD.price
     OR NEW.status IS DISTINCT FROM 'active'::public.listing_status THEN
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    f.user_id,
    NEW.owner_id,
    'Price drop alert',
    concat(
      COALESCE(NULLIF(NEW.title, ''), 'A saved listing'),
      ' dropped from EUR ',
      OLD.price::TEXT,
      ' to EUR ',
      NEW.price::TEXT,
      '.'
    ),
    'price_alert',
    '/property/' || NEW.id::TEXT
  )
  FROM public.favorites f
  WHERE f.listing_id = NEW.id
    AND f.price_alert = TRUE
    AND f.user_id IS DISTINCT FROM NEW.owner_id
    AND (
      f.price_when_saved IS NULL
      OR NEW.price < f.price_when_saved
    );

  UPDATE public.favorites f
  SET price_when_saved = NEW.price
  WHERE f.listing_id = NEW.id
    AND f.price_alert = TRUE
    AND f.user_id IS DISTINCT FROM NEW.owner_id
    AND (
      f.price_when_saved IS NULL
      OR NEW.price < f.price_when_saved
    );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listing_price_drop_notify_favorites
  ON public.listings;
CREATE TRIGGER listing_price_drop_notify_favorites
  AFTER UPDATE OF price ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_favorite_price_drop();

-- ---------------------------------------------------------------------------
-- Listing lifecycle: terminal status changes cancel pending dependent rows and
-- notify interested users.
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_viewings_listing_status
  ON public.viewings(listing_id, status);

CREATE INDEX IF NOT EXISTS idx_open_house_registrations_listing_status
  ON public.open_house_registrations(listing_id, status);

CREATE OR REPLACE FUNCTION private.handle_listing_terminal_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_title TEXT := COALESCE(NULLIF(NEW.title, ''), 'A listing');
  v_status TEXT := NEW.status::TEXT;
  v_requester_id UUID;
  v_favorite_user_id UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN (
    'sold'::public.listing_status,
    'rented'::public.listing_status,
    'expired'::public.listing_status
  ) THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN (
    'sold'::public.listing_status,
    'rented'::public.listing_status,
    'expired'::public.listing_status
  ) THEN
    RETURN NEW;
  END IF;

  -- Existing viewing status triggers notify requesters about the cancellation,
  -- so this update intentionally relies on those triggers instead of inserting
  -- a second viewing notification here.
  UPDATE public.viewings v
  SET status = 'cancelled'::public.viewing_status,
      updated_at = now()
  WHERE v.listing_id = NEW.id
    AND v.status IN (
      'pending'::public.viewing_status,
      'confirmed'::public.viewing_status
    );

  FOR v_requester_id IN
    UPDATE public.open_house_registrations r
    SET status = 'cancelled'::public.oh_registration_status,
        updated_at = now()
    WHERE r.listing_id = NEW.id
      AND r.status IN (
        'pending'::public.oh_registration_status,
        'approved'::public.oh_registration_status
      )
    RETURNING r.requester_id
  LOOP
    PERFORM private.insert_interaction_notification(
      v_requester_id,
      NEW.owner_id,
      'Open-house registration cancelled',
      concat(v_title, ' is now ', v_status, ', so your open-house registration was cancelled.'),
      'open_house',
      '/open-house/' || NEW.id::TEXT
    );
  END LOOP;

  FOR v_favorite_user_id IN
    SELECT f.user_id
    FROM public.favorites f
    WHERE f.listing_id = NEW.id
      AND f.user_id IS DISTINCT FROM NEW.owner_id
  LOOP
    PERFORM private.insert_interaction_notification(
      v_favorite_user_id,
      NEW.owner_id,
      'Saved listing update',
      concat(v_title, ' is now ', v_status, '.'),
      'listing',
      CASE
        WHEN NEW.listing_type = 'open_house' THEN '/open-house/' || NEW.id::TEXT
        ELSE '/property/' || NEW.id::TEXT
      END
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS listing_terminal_status_lifecycle
  ON public.listings;
CREATE TRIGGER listing_terminal_status_lifecycle
  AFTER UPDATE OF status ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.handle_listing_terminal_status();

-- ---------------------------------------------------------------------------
-- Function grants.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.get_contact_monthly_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_contact_monthly_limit(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_open_house_rsvp_monthly_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_open_house_rsvp_monthly_limit(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_professionals_per_category_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_professionals_per_category_limit(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_auction_listing_visible_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auction_listing_visible_limit(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_conversation_contact_monthly_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_message_contact_monthly_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_open_house_rsvp_monthly_limit() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION private.remaining_plan_limit_role(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.is_property_contact_conversation(UUID, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.notify_favorite_price_drop() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.handle_listing_terminal_status() FROM PUBLIC, anon, authenticated;
