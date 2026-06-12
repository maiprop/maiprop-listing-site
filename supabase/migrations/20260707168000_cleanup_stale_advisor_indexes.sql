-- Finalize the safe portion of the stale health-remediation branch.
--
-- Live production still had two useful user-scoped lookup indexes missing and
-- three single-column indexes that are covered by left-prefix unique indexes.

CREATE INDEX IF NOT EXISTS idx_notifications_user_id
  ON public.notifications (user_id);

CREATE INDEX IF NOT EXISTS idx_viewings_requester_id
  ON public.viewings (requester_id);

-- Covered by firesale_interest_deal_id_investor_id_key (deal_id, investor_id).
DROP INDEX IF EXISTS public.idx_firesale_interest_deal_id;

-- Covered by open_house_registrations_listing_id_requester_id_key
-- (listing_id, requester_id).
DROP INDEX IF EXISTS public.idx_oh_reg_listing;

-- Covered by open_house_offers_listing_id_bidder_id_key (listing_id, bidder_id).
DROP INDEX IF EXISTS public.idx_oh_offers_listing;

DO $$
DECLARE
  missing_index text;
BEGIN
  FOREACH missing_index IN ARRAY ARRAY[
    'idx_notifications_user_id',
    'idx_viewings_requester_id'
  ] LOOP
    IF to_regclass('public.' || missing_index) IS NULL THEN
      RAISE EXCEPTION 'advisor lookup index was not created: %', missing_index;
    END IF;
  END LOOP;

  FOREACH missing_index IN ARRAY ARRAY[
    'idx_firesale_interest_deal_id',
    'idx_oh_reg_listing',
    'idx_oh_offers_listing'
  ] LOOP
    IF to_regclass('public.' || missing_index) IS NOT NULL THEN
      RAISE EXCEPTION 'redundant advisor index still exists: %', missing_index;
    END IF;
  END LOOP;
END $$;
