-- =============================================================================
-- Developer Projects: full schema for pre-sale / development projects
-- Building permit, basic info, location, timeline, units, media
-- =============================================================================

-- ── 1. Extend projects table ─────────────────────────────────────────────────

-- Basic project info
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS building_permit_number TEXT,
  ADD COLUMN IF NOT EXISTS developer_company TEXT,
  ADD COLUMN IF NOT EXISTS architect_group TEXT,
  ADD COLUMN IF NOT EXISTS construction_company TEXT;

COMMENT ON COLUMN public.projects.building_permit_number IS 'Αριθμός Οικοδομικής Άδειας - mandatory for active projects';
COMMENT ON COLUMN public.projects.developer_company IS 'Developer company name';
COMMENT ON COLUMN public.projects.architect_group IS 'Architect / developer group';
COMMENT ON COLUMN public.projects.construction_company IS 'Construction company';

-- Location (address, city already exist)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS municipality TEXT,
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS area_description TEXT;

COMMENT ON COLUMN public.projects.area_description IS 'Area / neighbourhood description';

-- Project timeline
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS permit_approval_date DATE,
  ADD COLUMN IF NOT EXISTS construction_start_date DATE,
  ADD COLUMN IF NOT EXISTS structural_completion_date DATE,
  ADD COLUMN IF NOT EXISTS delivery_date DATE;


-- ── 2. Project media (renderings, floor plans, brochure PDF) ──────────────────

CREATE TABLE IF NOT EXISTS public.project_media (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  media_type TEXT NOT NULL CHECK (media_type IN (
    'rendering', 'floor_plan', 'site_plan', 'brochure_pdf',
    'drone', 'walkthrough', 'progress', 'video'
  )),
  title TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project media follows project access"
  ON public.project_media FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
      AND (p.status = 'active' OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Owners can manage project media"
  ON public.project_media FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  );

CREATE INDEX idx_project_media_project ON public.project_media(project_id);


-- ── 3. Project units (apartments / units within a project) ────────────────────

CREATE TABLE IF NOT EXISTS public.project_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  unit_id TEXT,
  floor INTEGER,
  unit_number TEXT,
  availability_status TEXT NOT NULL DEFAULT 'available' CHECK (availability_status IN ('available', 'reserved', 'sold')),

  -- Size
  internal_sqm NUMERIC(8, 2),
  balcony_sqm NUMERIC(6, 2),
  storage_sqm NUMERIC(6, 2),
  parking_sqm NUMERIC(6, 2),

  -- Layout
  bedrooms INTEGER,
  bathrooms INTEGER,
  kitchen_type TEXT,
  living_rooms INTEGER,

  -- Pricing
  price NUMERIC(14, 2),
  price_per_sqm NUMERIC(10, 2),
  vat_included BOOLEAN DEFAULT true,
  parking_price NUMERIC(10, 2),
  storage_price NUMERIC(10, 2),

  -- Orientation
  sea_view BOOLEAN DEFAULT false,
  city_view BOOLEAN DEFAULT false,
  mountain_view BOOLEAN DEFAULT false,

  -- Energy
  energy_class TEXT,
  heating_system TEXT,
  cooling_system TEXT,

  -- Optional link to full listing
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.project_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Project units follow project access"
  ON public.project_units FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_id
      AND (p.status = 'active' OR p.owner_id = auth.uid())
    )
  );

CREATE POLICY "Owners can manage project units"
  ON public.project_units FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.projects WHERE id = project_id AND owner_id = auth.uid())
  );

CREATE INDEX idx_project_units_project ON public.project_units(project_id);
CREATE INDEX idx_project_units_status ON public.project_units(availability_status);

CREATE TRIGGER update_project_units_updated_at
  BEFORE UPDATE ON public.project_units
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ── 4. Storage bucket for project media ──────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-media',
  'project-media',
  true,
  20971520,
  ARRAY['image/jpeg','image/png','image/webp','image/gif','application/pdf','video/mp4','video/webm']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "project_media_select" ON storage.objects;
CREATE POLICY "project_media_select"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-media');

DROP POLICY IF EXISTS "project_media_insert" ON storage.objects;
CREATE POLICY "project_media_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'project-media' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "project_media_delete" ON storage.objects;
CREATE POLICY "project_media_delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'project-media' AND auth.uid()::text = (storage.foldername(name))[1]);
