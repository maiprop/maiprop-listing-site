-- Open House Asset Control
-- Pre-registration, ID verification, waiver, approval, timeslots, qualified buyers, sealed offers

-- Storage bucket for ID docs and waivers (authenticated upload, owner/participant read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('open-house-docs', 'open-house-docs', false, 10485760, ARRAY['image/jpeg','image/png','image/webp','application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Policy: upload only to path starting with own user_id
CREATE POLICY "Open house docs upload own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'open-house-docs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: authenticated can read (app controls which paths are shown)
CREATE POLICY "Open house docs read authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'open-house-docs');

-- ── 1. Open house settings (per listing) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.open_house_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL UNIQUE REFERENCES public.listings(id) ON DELETE CASCADE,
  -- Timeslots: JSONB array of {start, end, max_visitors} per slot
  timeslots JSONB DEFAULT '[]',
  -- Visitor limits
  max_visitors_per_slot INTEGER DEFAULT 10,
  max_total_visitors INTEGER,
  -- Access control
  broker_required BOOLEAN DEFAULT false,
  -- Qualified buyers filters
  require_proof_of_funds BOOLEAN DEFAULT false,
  min_proof_amount NUMERIC,
  require_investor_declaration BOOLEAN DEFAULT false,
  -- Offer submission
  offer_deadline TIMESTAMP WITH TIME ZONE,
  allow_sealed_bids BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.open_house_settings IS 'Per-listing asset control: timeslots, limits, qualified buyers, offer deadline';

CREATE INDEX IF NOT EXISTS idx_open_house_settings_listing ON public.open_house_settings(listing_id);

-- RLS
ALTER TABLE public.open_house_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open house settings: public read"
  ON public.open_house_settings FOR SELECT
  USING (true);

CREATE POLICY "Open house settings: owner manage"
  ON public.open_house_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_settings.listing_id AND l.owner_id = auth.uid()
    )
  );

-- ── 2. Open house registrations (visitor pre-registration) ──────────────────────
CREATE TYPE public.oh_registration_status AS ENUM (
  'pending',      -- submitted, awaiting approval
  'approved',     -- asset manager approved
  'rejected',     -- asset manager rejected
  'attended',     -- marked as attended
  'cancelled'
);

CREATE TYPE public.oh_id_doc_type AS ENUM ('id_card', 'passport');

CREATE TABLE IF NOT EXISTS public.open_house_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Selected timeslot index (from settings.timeslots)
  timeslot_index INTEGER,
  -- ID verification
  id_doc_type oh_id_doc_type,
  id_doc_url TEXT,
  id_verified_at TIMESTAMPTZ,
  -- Waiver
  waiver_signed_at TIMESTAMPTZ,
  waiver_url TEXT,
  -- Qualified buyers
  proof_of_funds_url TEXT,
  proof_amount NUMERIC,
  investor_declaration_signed_at TIMESTAMPTZ,
  -- Approval
  status oh_registration_status DEFAULT 'pending',
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

CREATE POLICY "OH regs: requester read/insert/update own"
  ON public.open_house_registrations FOR ALL
  USING (requester_id = auth.uid())
  WITH CHECK (requester_id = auth.uid());

CREATE POLICY "OH regs: owner read/update all for their listing"
  ON public.open_house_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY "OH regs: owner update (approval, attendance)"
  ON public.open_house_registrations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_registrations.listing_id AND l.owner_id = auth.uid()
    )
  );

-- ── 3. Open house offers (sealed bids) ────────────────────────────────────────
CREATE TYPE public.oh_offer_status AS ENUM (
  'submitted',   -- sealed, awaiting deadline
  'revealed',    -- deadline passed, visible to owner
  'accepted',    -- owner accepted
  'rejected',    -- owner rejected
  'withdrawn'
);

CREATE TABLE IF NOT EXISTS public.open_house_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  bidder_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'EUR',
  message TEXT,
  status oh_offer_status DEFAULT 'submitted',
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

CREATE POLICY "OH offers: bidder insert own, read own"
  ON public.open_house_offers FOR ALL
  USING (bidder_id = auth.uid())
  WITH CHECK (bidder_id = auth.uid());

CREATE POLICY "OH offers: owner read/update for their listing"
  ON public.open_house_offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_offers.listing_id AND l.owner_id = auth.uid()
    )
  );

CREATE POLICY "OH offers: owner update (reveal, accept, reject)"
  ON public.open_house_offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.listings l
      WHERE l.id = open_house_offers.listing_id AND l.owner_id = auth.uid()
    )
  );

-- ── Trigger: updated_at ────────────────────────────────────────────────────────
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
