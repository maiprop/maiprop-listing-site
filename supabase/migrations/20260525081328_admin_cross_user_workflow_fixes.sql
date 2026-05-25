-- Admin cross-user workflow fixes.
--
-- Keep admin UI mutations small and make the cross-user side effects
-- database-owned so webhook/cron/manual admin paths stay consistent.

CREATE SCHEMA IF NOT EXISTS private;

DO $$ BEGIN
  CREATE TYPE public.listing_report_status AS ENUM ('pending', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.listing_reports
  ADD COLUMN IF NOT EXISTS status public.listing_report_status NOT NULL DEFAULT 'pending';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active'
    CHECK (account_status IN ('active', 'suspended', 'banned')),
  ADD COLUMN IF NOT EXISTS account_moderation_reason TEXT,
  ADD COLUMN IF NOT EXISTS account_moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS account_moderated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.profiles_guard_account_moderation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.account_moderation_reason IS DISTINCT FROM OLD.account_moderation_reason
     OR NEW.account_moderated_at IS DISTINCT FROM OLD.account_moderated_at
     OR NEW.account_moderated_by IS DISTINCT FROM OLD.account_moderated_by THEN
    IF NOT public.has_platform_admin((SELECT auth.uid())) THEN
      NEW.account_status := OLD.account_status;
      NEW.account_moderation_reason := OLD.account_moderation_reason;
      NEW.account_moderated_at := OLD.account_moderated_at;
      NEW.account_moderated_by := OLD.account_moderated_by;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_account_moderation ON public.profiles;
CREATE TRIGGER profiles_guard_account_moderation
  BEFORE UPDATE OF account_status, account_moderation_reason, account_moderated_at, account_moderated_by
  ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_guard_account_moderation();

CREATE OR REPLACE FUNCTION public.admin_update_firesale_pipeline_deal(
  p_deal_id UUID,
  p_status TEXT,
  p_admin_notes TEXT DEFAULT NULL,
  p_offer_price NUMERIC DEFAULT NULL
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
  v_actor UUID := (SELECT auth.uid());
  v_deal public.firesale_requests%ROWTYPE;
  v_previous_status TEXT;
  v_status TEXT := lower(trim(coalesce(p_status, '')));
  v_notified INTEGER := 0;
  v_deal_address TEXT;
  v_investor_id UUID;
  v_submitter_title TEXT;
  v_submitter_body TEXT;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_status NOT IN ('pending', 'reviewed', 'offer_sent', 'closed') THEN
    RAISE EXCEPTION 'invalid_status';
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

  UPDATE public.firesale_requests
  SET
    status = v_status,
    admin_notes = p_admin_notes,
    offer_price = CASE
      WHEN p_offer_price IS NOT NULL THEN p_offer_price
      ELSE offer_price
    END
  WHERE id = p_deal_id
  RETURNING * INTO v_deal;

  v_deal_address := concat_ws(', ', nullif(v_deal.address, ''), nullif(v_deal.city, ''));
  IF v_deal_address = '' THEN
    v_deal_address := 'your Quick Sale property';
  END IF;

  IF v_previous_status IS DISTINCT FROM v_status AND v_deal.user_id IS NOT NULL THEN
    v_submitter_title := CASE v_status
      WHEN 'pending' THEN 'Quick Sale submission returned to review'
      WHEN 'reviewed' THEN 'Quick Sale submission reviewed'
      WHEN 'offer_sent' THEN 'Quick Sale offer sent'
      WHEN 'closed' THEN 'Quick Sale submission closed'
      ELSE 'Quick Sale update'
    END;

    v_submitter_body := CASE v_status
      WHEN 'pending' THEN concat_ws(' ', 'Your Quick Sale submission for', v_deal_address, 'was returned to pending review.')
      WHEN 'reviewed' THEN concat_ws(' ', 'Your Quick Sale submission for', v_deal_address, 'has passed admin review.')
      WHEN 'offer_sent' THEN concat_ws(' ', 'An investor offer has been sent for', v_deal_address || '.')
      WHEN 'closed' THEN concat_ws(' ', 'Your Quick Sale submission for', v_deal_address, 'has been closed.')
      ELSE concat_ws(' ', 'Your Quick Sale submission for', v_deal_address, 'was updated.')
    END;

    PERFORM private.insert_interaction_notification(
      v_deal.user_id,
      v_actor,
      v_submitter_title,
      v_submitter_body,
      'firesale_pipeline',
      '/firesale'
    );
  END IF;

  IF v_status = 'offer_sent' AND v_previous_status IS DISTINCT FROM 'offer_sent' THEN
    FOR v_investor_id IN
      SELECT DISTINCT p.user_id
      FROM public.profiles p
      WHERE p.user_id IS NOT NULL
        AND p.user_id IS DISTINCT FROM v_deal.user_id
        AND EXISTS (
          SELECT 1
          FROM public.investor_subscriptions s
          WHERE s.user_id = p.user_id
            AND s.status IN ('active', 'trial')
        )
    LOOP
      PERFORM private.insert_interaction_notification(
        v_investor_id,
        v_actor,
        'New Quick Sale deal available',
        concat_ws(' ', 'A distressed property at', v_deal_address, 'is available. Offer sent.'),
        'investor_alert',
        '/investor-dashboard'
      );
      v_notified := v_notified + 1;
    END LOOP;
  END IF;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_notified;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_update_firesale_pipeline_deal(UUID, TEXT, TEXT, NUMERIC) IS
  'Admin-only Quick Sale pipeline workflow. Updates deal state, notifies the submitter on status changes, and alerts eligible investors when an offer is sent.';

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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_deal public.firesale_requests%ROWTYPE;
  v_interest RECORD;
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

  v_deal_address := concat_ws(', ', nullif(v_deal.address, ''), nullif(v_deal.city, ''));
  IF v_deal_address = '' THEN
    v_deal_address := 'your Quick Sale property';
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

  IF p_published IS FALSE THEN
    FOR v_interest IN
      SELECT id, investor_id
      FROM public.firesale_interest
      WHERE deal_id = p_deal_id
        AND status = 'reserved'
        AND COALESCE(reservation_expires_at, now() + interval '100 years') > now()
      FOR UPDATE
    LOOP
      UPDATE public.firesale_interest
      SET
        status = 'expired',
        reservation_expires_at = NULL,
        reserved_by = NULL,
        admin_note = COALESCE(admin_note, 'Reservation released because the deal was unpublished.')
      WHERE id = v_interest.id;

      PERFORM private.insert_interaction_notification(
        v_interest.investor_id,
        v_actor,
        'Quick Sale reservation cancelled',
        concat_ws(' ', 'Your reservation for', v_deal_address, 'was cancelled because the deal is no longer published.'),
        'firesale_reservation',
        '/investor-dashboard'
      );
    END LOOP;
  END IF;

  IF v_deal.user_id IS NOT NULL THEN
    PERFORM private.insert_interaction_notification(
      v_deal.user_id,
      v_actor,
      CASE WHEN p_published THEN 'Quick Sale deal published' ELSE 'Quick Sale deal unpublished' END,
      CASE
        WHEN p_published THEN concat_ws(' ', 'Your Quick Sale deal for', v_deal_address, 'is now visible to eligible investors.')
        ELSE concat_ws(' ', 'Your Quick Sale deal for', v_deal_address, 'is no longer visible to investors.')
      END,
      'firesale_publication',
      '/firesale'
    );
  END IF;

  RETURN QUERY SELECT v_deal.id, v_deal.status, v_deal.published_to_investors;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_set_firesale_investor_publication(UUID, BOOLEAN) IS
  'Admin-only Quick Sale publication workflow. Publishes/unpublishes deals, releases active reservations on unpublish, and notifies affected users.';

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
      ELSE concat_ws(' ', 'Your proof of funds for', COALESCE(NULLIF(v_listing_title, ''), 'an open house'), 'was rejected.', NULLIF(NEW.rejection_reason, ''))
    END,
    'pof_review',
    '/dashboard?tab=open-houses'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_open_house_pof_status_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_open_house_pof_status_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_open_house_pof_notify ON public.open_house_registrations;
CREATE TRIGGER trg_open_house_pof_notify
  AFTER UPDATE OF pof_verified_status ON public.open_house_registrations
  FOR EACH ROW
  WHEN (OLD.pof_verified_status IS DISTINCT FROM NEW.pof_verified_status)
  EXECUTE FUNCTION private.notify_open_house_pof_status_change();

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE OR REPLACE FUNCTION private.notify_professional_verification_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.verified IS TRUE AND OLD.verified IS DISTINCT FROM TRUE THEN
    v_title := 'Professional profile verified';
    v_body := 'Your professional profile has been verified and the verified badge is now visible.';
  ELSIF NEW.rejection_reason IS NOT NULL
        AND NEW.verified IS FALSE
        AND NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
    v_title := 'Professional verification rejected';
    v_body := concat_ws(' ', 'Your professional verification was rejected.', NULLIF(NEW.rejection_reason, ''));
  ELSE
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    NEW.user_id,
    v_actor,
    v_title,
    v_body,
    'professional_verification',
    '/dashboard/profile'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_professional_verification_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_professional_verification_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_professional_verification_notify ON public.professionals;
CREATE TRIGGER trg_professional_verification_notify
  AFTER UPDATE OF verified, rejection_reason ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_professional_verification_change();

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION private.notify_featured_listing_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.owner_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.is_featured IS DISTINCT FROM OLD.is_featured THEN
    v_title := CASE WHEN NEW.is_featured THEN 'Listing featured' ELSE 'Listing removed from featured' END;
    v_body := CASE
      WHEN NEW.is_featured THEN concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'is now featured.')
      ELSE concat_ws(' ', 'Your listing', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT), 'is no longer featured.')
    END;
  ELSIF NEW.priority_placement IS DISTINCT FROM OLD.priority_placement THEN
    v_title := 'Listing priority updated';
    v_body := concat_ws(' ', 'The priority placement was updated for', COALESCE(NULLIF(NEW.title, ''), NEW.id::TEXT) || '.');
  ELSE
    RETURN NEW;
  END IF;

  PERFORM private.insert_interaction_notification(
    NEW.owner_id,
    v_actor,
    v_title,
    v_body,
    'featured_listing',
    '/dashboard/listings'
  );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_featured_listing_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_featured_listing_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_featured_listing_notify ON public.listings;
CREATE TRIGGER trg_featured_listing_notify
  AFTER UPDATE OF is_featured, priority_placement ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_featured_listing_change();

CREATE OR REPLACE FUNCTION private.notify_investor_subscription_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_has_active_access BOOLEAN;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status IN ('cancelled', 'expired') THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.investor_subscriptions s
      WHERE s.user_id = NEW.user_id
        AND s.id <> NEW.id
        AND s.status IN ('active', 'trial')
    ) INTO v_has_active_access;

    IF NOT v_has_active_access THEN
      UPDATE public.profiles
      SET investor_mode = false,
          updated_at = now()
      WHERE user_id = NEW.user_id
        AND investor_mode = true;
    END IF;

    PERFORM private.insert_interaction_notification(
      NEW.user_id,
      v_actor,
      'Investor access updated',
      CASE
        WHEN v_has_active_access THEN 'One investor subscription changed, but your investor access remains active.'
        WHEN NEW.status = 'cancelled' THEN 'Your investor subscription was cancelled and investor mode has been turned off.'
        ELSE 'Your investor subscription expired and investor mode has been turned off.'
      END,
      'subscription',
      '/dashboard/billing'
    );
  ELSIF NEW.status IN ('active', 'trial') AND OLD.status NOT IN ('active', 'trial') THEN
    PERFORM private.insert_interaction_notification(
      NEW.user_id,
      v_actor,
      'Investor access active',
      'Your investor access is active.',
      'subscription',
      '/investor-dashboard'
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_investor_subscription_status_change() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.notify_investor_subscription_status_change() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_investor_subscription_status_notify ON public.investor_subscriptions;
CREATE TRIGGER trg_investor_subscription_status_notify
  AFTER UPDATE OF status ON public.investor_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION private.notify_investor_subscription_status_change();

CREATE OR REPLACE FUNCTION public.admin_broadcast_notification(
  p_segment TEXT,
  p_title TEXT,
  p_body TEXT,
  p_type TEXT DEFAULT 'admin_broadcast',
  p_link TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_segment TEXT := lower(trim(coalesce(p_segment, '')));
  v_rec RECORD;
  v_count INTEGER := 0;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF v_segment NOT IN ('all', 'investors', 'sellers', 'agents', 'professionals', 'developers') THEN
    RAISE EXCEPTION 'invalid_segment';
  END IF;

  IF length(trim(coalesce(p_title, ''))) = 0 OR length(trim(coalesce(p_body, ''))) = 0 THEN
    RAISE EXCEPTION 'title_and_body_required';
  END IF;

  FOR v_rec IN
    SELECT DISTINCT p.user_id
    FROM public.profiles p
    WHERE p.user_id IS NOT NULL
      AND p.user_id <> v_actor
      AND COALESCE(p.account_status, 'active') = 'active'
      AND (
        v_segment = 'all'
        OR (v_segment = 'investors' AND (
          p.investor_mode = true
          OR p.role::TEXT IN ('investor', 'institutional')
          OR p.participant_type IN ('investor', 'institutional')
          OR EXISTS (
            SELECT 1
            FROM public.investor_subscriptions s
            WHERE s.user_id = p.user_id
              AND s.status IN ('active', 'trial')
          )
        ))
        OR (v_segment = 'sellers' AND (p.role::TEXT = 'seller_landlord' OR p.participant_type = 'seller'))
        OR (v_segment = 'agents' AND (p.role::TEXT = 'agent' OR p.participant_type = 'agent'))
        OR (v_segment = 'professionals' AND (p.role::TEXT = 'professional' OR p.participant_type = 'professional'))
        OR (v_segment = 'developers' AND (p.role::TEXT = 'developer' OR p.participant_type = 'developer'))
      )
  LOOP
    PERFORM private.insert_interaction_notification(
      v_rec.user_id,
      v_actor,
      trim(p_title),
      trim(p_body),
      COALESCE(NULLIF(trim(p_type), ''), 'admin_broadcast'),
      NULLIF(trim(coalesce(p_link, '')), '')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_notification(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_suspend_reported_listing(
  p_report_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS public.listing_reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_report public.listing_reports%ROWTYPE;
  v_listing RECORD;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_report
  FROM public.listing_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'listing_report_not_found';
  END IF;

  IF v_report.entity_type <> 'listing' THEN
    RAISE EXCEPTION 'report_entity_is_not_listing';
  END IF;

  SELECT id, owner_id, title INTO v_listing
  FROM public.listings
  WHERE id = v_report.entity_id
  FOR UPDATE;

  IF v_listing.id IS NULL THEN
    RAISE EXCEPTION 'listing_not_found';
  END IF;

  UPDATE public.listings
  SET status = 'paused'::public.listing_status,
      updated_at = now()
  WHERE id = v_listing.id;

  UPDATE public.listing_reports
  SET status = 'resolved'::public.listing_report_status
  WHERE id = v_report.id
  RETURNING * INTO v_report;

  PERFORM private.insert_interaction_notification(
    v_listing.owner_id,
    v_actor,
    'Listing suspended',
    concat_ws(' ', 'Your listing', COALESCE(NULLIF(v_listing.title, ''), v_listing.id::TEXT), 'was paused after a moderation review.', NULLIF(p_reason, '')),
    'moderation',
    '/dashboard/listings'
  );

  RETURN v_report;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_suspend_reported_listing(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_suspend_reported_listing(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_ban_reported_content_owner(
  p_report_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := (SELECT auth.uid());
  v_report public.listing_reports%ROWTYPE;
  v_owner_id UUID;
BEGIN
  IF v_actor IS NULL OR NOT public.has_platform_admin(v_actor) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO v_report
  FROM public.listing_reports
  WHERE id = p_report_id
  FOR UPDATE;

  IF v_report.id IS NULL THEN
    RAISE EXCEPTION 'listing_report_not_found';
  END IF;

  IF v_report.entity_type = 'listing' THEN
    SELECT owner_id INTO v_owner_id
    FROM public.listings
    WHERE id = v_report.entity_id;
  ELSIF v_report.entity_type = 'firesale_request' THEN
    SELECT user_id INTO v_owner_id
    FROM public.firesale_requests
    WHERE id = v_report.entity_id;
  ELSE
    RAISE EXCEPTION 'unsupported_report_entity';
  END IF;

  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'reported_owner_not_found';
  END IF;

  UPDATE public.profiles
  SET account_status = 'banned',
      account_moderation_reason = COALESCE(NULLIF(p_reason, ''), 'Banned after moderation review.'),
      account_moderated_at = now(),
      account_moderated_by = v_actor,
      investor_mode = false,
      updated_at = now()
  WHERE user_id = v_owner_id;

  UPDATE public.listing_reports
  SET status = 'resolved'::public.listing_report_status
  WHERE id = v_report.id;

  PERFORM private.insert_interaction_notification(
    v_owner_id,
    v_actor,
    'Account banned',
    COALESCE(NULLIF(p_reason, ''), 'Your account was banned after a moderation review.'),
    'moderation',
    '/dashboard/settings'
  );

  RETURN v_owner_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_reported_content_owner(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_ban_reported_content_owner(UUID, TEXT) TO authenticated, service_role;
