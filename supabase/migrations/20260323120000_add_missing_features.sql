-- =============================================================================
-- Add schema for missing features: price alerts, pre-sale, projects, leads, off-market, due diligence
-- =============================================================================

-- ── 1. Price alerts on favorites ─────────────────────────────────────────────
ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS price_alert BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_when_saved NUMERIC(14, 2);

COMMENT ON COLUMN public.favorites.price_alert IS 'Notify user when listing price drops';
COMMENT ON COLUMN public.favorites.price_when_saved IS 'Price at time of save, for comparison';

-- Allow users to update their own favorites (for price_alert toggle)
DROP POLICY IF EXISTS "Users can update favorites" ON public.favorites;
CREATE POLICY "Users can update favorites"
  ON public.favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ── 2. Pre-sale listings ────────────────────────────────────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_pre_sale BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_listings_is_pre_sale ON public.listings(is_pre_sale) WHERE is_pre_sale = true;


-- ── 3. Project showcase (for developers) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  address TEXT,
  city TEXT,
  cover_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view active projects"
  ON public.projects FOR SELECT
  USING (status = 'active' OR owner_id = auth.uid());

CREATE POLICY "Owners can manage projects"
  ON public.projects FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Link listings to projects
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_listings_project ON public.listings(project_id) WHERE project_id IS NOT NULL;


-- ── 4. Lead management: notes on consultation_requests ───────────────────────
ALTER TABLE public.consultation_requests
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS lead_status TEXT DEFAULT 'new' CHECK (lead_status IN ('new', 'contacted', 'qualified', 'converted', 'lost'));


-- ── 5. Contacts (CRM) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own contacts"
  ON public.contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON public.contacts(user_id);


-- ── 6. Off-market visibility ────────────────────────────────────────────────
ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS is_off_market BOOLEAN NOT NULL DEFAULT false;

-- RLS: off-market listings visible only to authenticated users with investor subscription or agent role
-- We keep existing policy; off-market is a filter. Full restriction would need a policy that checks
-- investor_subscriptions or has_role. For now, is_off_market is metadata; we can filter in app
-- and add a stricter policy later if needed.
CREATE INDEX IF NOT EXISTS idx_listings_off_market ON public.listings(is_off_market) WHERE is_off_market = true;


-- ── 7. Due diligence checklist ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_checklists (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('listing', 'firesale_request')),
  entity_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Due diligence',
  items JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, entity_id)
);

ALTER TABLE public.deal_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own checklists"
  ON public.deal_checklists FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deal_checklists_user ON public.deal_checklists(user_id);


-- ── 8. Portfolios (bulk analysis for institutional) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  listing_ids UUID[] DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own portfolios"
  ON public.portfolios FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_portfolios_user ON public.portfolios(user_id);


-- Timestamp triggers
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_deal_checklists_updated_at
  BEFORE UPDATE ON public.deal_checklists
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
