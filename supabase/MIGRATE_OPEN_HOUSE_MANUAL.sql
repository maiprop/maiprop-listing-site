-- =============================================================================
-- OPEN HOUSE - MANUAL MIGRATION
-- Run in Supabase Dashboard → SQL Editor
--
-- IMPORTANT: Run PART A first, Execute it, THEN run PART B.
-- PostgreSQL requires new enum values to be committed before use.
-- =============================================================================

-- =============================================================================
-- PART A — RUN THIS FIRST, EXECUTE, WAIT FOR SUCCESS
-- =============================================================================

ALTER TYPE public.listing_type ADD VALUE IF NOT EXISTS 'open_house';

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS open_house_date TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.listings.open_house_date IS 'When the open house viewing takes place (for listing_type = open_house)';

-- =============================================================================
-- PART B — RUN THIS AFTER PART A HAS SUCCEEDED
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_listings_open_house_date
  ON public.listings (open_house_date)
  WHERE listing_type = 'open_house' AND status = 'active';

-- ── Step 2: Asset Control tables & storage (20260406120000) ───────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('open-house-docs', 'open-house-docs', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Open house docs upload own" ON storage.objects;
CREATE POLICY "Open house docs upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'open-house-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Open house docs read authenticated" ON storage.objects;
CREATE POLICY "Open house docs read authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'open-house-docs');

CREATE TABLE IF NOT EXISTS public.open_house_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE CASCADE,
  timeslots JSONB DEFAULT '[]',
  max_visitors_per_slot INTEGER DEFAULT 10,
  max_total_visitors INTEGER,
  broker_required BOOLEAN DEFAULT false,
  require_proof_of_funds BOOLEAN DEFAULT false,
  min_proof_amount NUMERIC,
  require_investor_declaration BOOLEAN DEFAULT false,
  offer_deadline TIMESTAMP WITH TIME ZONE,
  allow_sealed_bids BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.open_house_settings IS 'Per-listing asset control: timeslots, limits, qualified buyers, offer deadline';

CREATE INDEX IF NOT EXISTS idx_open_house_settings_listing ON public.open_house_settings(listing_id);

ALTER TABLE public.open_house_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Open house settings: public read" ON public.open_house_settings;
CREATE POLICY "Open house settings: public read"
  ON public.open_house_settings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Open house settings: owner manage" ON public.open_house_settings;
CREATE POLICY "Open house settings: owner manage"
  ON public.open_house_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_settings.listing_id AND l.owner_id = auth.uid()
    )
  );

-- Registrations
DO $$ BEGIN
  CREATE TYPE public.oh_registration_status AS ENUM ('pending','approved','rejected','attended','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.oh_id_doc_type AS ENUM ('id_card', 'passport');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.open_house_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timeslot_index INTEGER,
  id_doc_type public.oh_id_doc_type,
  id_doc_url TEXT,
  id_verified_at TIMESTAMPTZ,
  waiver_signed_at TIMESTAMPTZ,
  waiver_url TEXT,
  proof_of_funds_url TEXT,
  proof_amount NUMERIC,
  investor_declaration_signed_at TIMESTAMPTZ,
  status public.oh_registration_status DEFAULT 'pending',
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  attended_at TIMESTAMPTZ,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(listing_id, requester_id)
);

COMMENT ON TABLE public.open_house_registrations IS 'Visitor pre-registration: ID, waiver, approval, attendance';

CREATE INDEX IF NOT EXISTS idx_oh_reg_listing ON public.open_house_registrations(listing_id);
CREATE INDEX IF NOT EXISTS idx_oh_reg_requester ON public.open_house_registrations(requester_id);
CREATE INDEX IF NOT EXISTS idx_oh_reg_status ON public.open_house_registrations(status);

ALTER TABLE public.open_house_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OH regs: requester read/insert/update own" ON public.open_house_registrations;
CREATE POLICY "OH regs: requester read/insert/update own"
  ON public.open_house_registrations FOR ALL
  USING (requester_id = auth.uid())
  WITH CHECK (requester_id = auth.uid());

DROP POLICY IF EXISTS "OH regs: owner read/update all for their listing" ON public.open_house_registrations;
CREATE POLICY "OH regs: owner read/update all for their listing"
  ON public.open_house_registrations FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = open_house_registrations.listing_id AND l.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "OH regs: owner update (approval, attendance)" ON public.open_house_registrations;
CREATE POLICY "OH regs: owner update (approval, attendance)"
  ON public.open_house_registrations FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = open_house_registrations.listing_id AND l.owner_id = auth.uid())
  );

-- Offers
DO $$ BEGIN
  CREATE TYPE public.oh_offer_status AS ENUM ('submitted','revealed','accepted','rejected','withdrawn');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.open_house_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'EUR',
  message TEXT,
  status public.oh_offer_status DEFAULT 'submitted',
  submitted_at TIMESTAMPTZ DEFAULT now(),
  revealed_at TIMESTAMPTZ,
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  UNIQUE(listing_id, bidder_id)
);

COMMENT ON TABLE public.open_house_offers IS 'Sealed offers for open house properties';

CREATE INDEX IF NOT EXISTS idx_oh_offers_listing ON public.open_house_offers(listing_id);
CREATE INDEX IF NOT EXISTS idx_oh_offers_bidder ON public.open_house_offers(bidder_id);

ALTER TABLE public.open_house_offers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "OH offers: bidder insert own, read own" ON public.open_house_offers;
CREATE POLICY "OH offers: bidder insert own, read own"
  ON public.open_house_offers FOR ALL
  USING (bidder_id = auth.uid())
  WITH CHECK (bidder_id = auth.uid());

DROP POLICY IF EXISTS "OH offers: owner read/update for their listing" ON public.open_house_offers;
CREATE POLICY "OH offers: owner read/update for their listing"
  ON public.open_house_offers FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = open_house_offers.listing_id AND l.owner_id = auth.uid())
  );

DROP POLICY IF EXISTS "OH offers: owner update (reveal, accept, reject)" ON public.open_house_offers;
CREATE POLICY "OH offers: owner update (reveal, accept, reject)"
  ON public.open_house_offers FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.listings l WHERE l.id = open_house_offers.listing_id AND l.owner_id = auth.uid())
  );

-- Triggers
CREATE OR REPLACE FUNCTION set_open_house_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS open_house_settings_updated_at ON public.open_house_settings;
CREATE TRIGGER open_house_settings_updated_at
  BEFORE UPDATE ON public.open_house_settings
  FOR EACH ROW EXECUTE FUNCTION set_open_house_updated_at();

DROP TRIGGER IF EXISTS open_house_registrations_updated_at ON public.open_house_registrations;
CREATE TRIGGER open_house_registrations_updated_at
  BEFORE UPDATE ON public.open_house_registrations
  FOR EACH ROW EXECUTE FUNCTION set_open_house_updated_at();

-- ── Step 3: Fixes - profiles FK for embeds & storage DELETE (20260406130000) ──
ALTER TABLE public.open_house_registrations
  DROP CONSTRAINT IF EXISTS open_house_registrations_requester_id_fkey;

ALTER TABLE public.open_house_registrations
  ADD CONSTRAINT open_house_registrations_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

ALTER TABLE public.open_house_offers
  DROP CONSTRAINT IF EXISTS open_house_offers_bidder_id_fkey;

ALTER TABLE public.open_house_offers
  ADD CONSTRAINT open_house_offers_bidder_id_fkey
  FOREIGN KEY (bidder_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;

DROP POLICY IF EXISTS "Open house docs delete own" ON storage.objects;
CREATE POLICY "Open house docs delete own"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'open-house-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
