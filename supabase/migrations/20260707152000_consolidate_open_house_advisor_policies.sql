-- Consolidate open-house requester/bidder and listing-owner policies into
-- one OR-equivalent policy per action. This removes Supabase advisor
-- multiple-permissive-policy noise without changing the business model:
-- requesters/bidders can manage their own rows, and listing owners can review
-- rows tied to their listings.

BEGIN;

DROP POLICY IF EXISTS "oh_offers_bidder" ON public.open_house_offers;
DROP POLICY IF EXISTS "oh_offers_owner_select" ON public.open_house_offers;
DROP POLICY IF EXISTS "oh_offers_owner_update" ON public.open_house_offers;
DROP POLICY IF EXISTS "oh_offers_insert" ON public.open_house_offers;
DROP POLICY IF EXISTS "oh_offers_select" ON public.open_house_offers;
DROP POLICY IF EXISTS "oh_offers_update" ON public.open_house_offers;
DROP POLICY IF EXISTS "oh_offers_delete" ON public.open_house_offers;

CREATE POLICY "oh_offers_insert"
  ON public.open_house_offers
  FOR INSERT
  TO public
  WITH CHECK (bidder_id = (SELECT auth.uid()));

CREATE POLICY "oh_offers_select"
  ON public.open_house_offers
  FOR SELECT
  TO public
  USING (
    bidder_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_offers.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "oh_offers_update"
  ON public.open_house_offers
  FOR UPDATE
  TO public
  USING (
    bidder_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_offers.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bidder_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_offers.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "oh_offers_delete"
  ON public.open_house_offers
  FOR DELETE
  TO public
  USING (bidder_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "oh_regs_requester_insert" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_requester_select" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_requester_update" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_owner_select" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_owner_update" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_insert" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_select" ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_update" ON public.open_house_registrations;

CREATE POLICY "oh_regs_insert"
  ON public.open_house_registrations
  FOR INSERT
  TO public
  WITH CHECK (
    requester_id = (SELECT auth.uid())
    AND status = 'pending'::oh_registration_status
  );

CREATE POLICY "oh_regs_select"
  ON public.open_house_registrations
  FOR SELECT
  TO public
  USING (
    requester_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "oh_regs_update"
  ON public.open_house_registrations
  FOR UPDATE
  TO public
  USING (
    requester_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    requester_id = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1
      FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id
        AND l.owner_id = (SELECT auth.uid())
    )
  );

COMMIT;
