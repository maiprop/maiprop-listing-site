-- =============================================================================
-- Leads table — unified lead capture for agents, professionals, developers
-- Replaces legacy marketing leads; used by LeadsCRM for all users who need contacts
-- =============================================================================

-- If a legacy "leads" table exists without owner_id (marketing schema), rename it
-- out of the way so the new CRM schema can be created. Safe on fresh installs where
-- neither table exists yet.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'leads'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'owner_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.leads RENAME TO marketing_leads';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN (
    'manual', 'listing_inquiry', 'consultation', 'callback', 'project_inquiry', 'viewing', 'message'
  )),
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost'
  )),
  notes TEXT,
  follow_up_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

-- Users see their own leads
CREATE POLICY "Users select own leads"
  ON public.leads FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users insert own leads"
  ON public.leads FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users update own leads"
  ON public.leads FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users delete own leads"
  ON public.leads FOR DELETE
  USING (owner_id = auth.uid());

-- Platform admin sees all leads
CREATE POLICY "Admin select all leads"
  ON public.leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
      AND (role = 'admin' OR is_platform_admin = true)
    )
  );

CREATE INDEX idx_leads_owner ON public.leads(owner_id);
CREATE INDEX idx_leads_status ON public.leads(status);
CREATE INDEX idx_leads_source ON public.leads(source);
CREATE INDEX idx_leads_follow_up ON public.leads(follow_up_at);
CREATE INDEX idx_leads_listing ON public.leads(listing_id);
CREATE INDEX idx_leads_created ON public.leads(created_at DESC);

CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
