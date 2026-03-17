-- =============================================================================
-- Developer Dashboard: project leads, views tracking, analytics
-- =============================================================================

-- ── 1. Project leads (lead management per project) ───────────────────────────

CREATE TABLE IF NOT EXISTS public.project_leads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT,
  unit_id TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project leads follow project access"
  ON public.project_leads FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
      AND (p.status = 'active' OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Owners can manage project leads"
  ON public.project_leads FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  );

CREATE INDEX idx_project_leads_project ON public.project_leads(project_id);
CREATE INDEX idx_project_leads_status ON public.project_leads(status);

CREATE TRIGGER update_project_leads_updated_at
  BEFORE UPDATE ON public.project_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── 2. Project views (analytics: track views per project) ────────────────────

CREATE TABLE IF NOT EXISTS public.project_views (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  viewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can see project views"
  ON public.project_views FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  );

CREATE POLICY "Anyone can insert project view"
  ON public.project_views FOR INSERT
  WITH CHECK (true);

CREATE INDEX idx_project_views_project ON public.project_views(project_id);
CREATE INDEX idx_project_views_viewed_at ON public.project_views(viewed_at);
