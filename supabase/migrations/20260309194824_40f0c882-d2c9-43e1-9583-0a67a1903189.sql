-- ── Professional Services ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_services (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL,
  service_key text NOT NULL,
  service_name text NOT NULL,
  description text,
  category text NOT NULL,
  pricing_model text NOT NULL DEFAULT 'hourly',
  rate_amount numeric,
  currency text NOT NULL DEFAULT 'EUR',
  estimated_hours numeric,
  is_active boolean NOT NULL DEFAULT true,
  video_enabled boolean NOT NULL DEFAULT false,
  is_premium boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT professional_services_uniq UNIQUE (professional_id, service_key)
);

ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professional services are publicly viewable"
  ON public.professional_services FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Professionals can manage own services"
  ON public.professional_services FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_services.professional_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_services.professional_id
        AND p.user_id = auth.uid()
    )
  );

CREATE TRIGGER update_professional_services_updated_at
  BEFORE UPDATE ON public.professional_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Professional Availability ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.professional_availability (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  professional_id uuid NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.professional_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Availability is publicly viewable"
  ON public.professional_availability FOR SELECT TO public
  USING (is_active = true);

CREATE POLICY "Professionals can manage own availability"
  ON public.professional_availability FOR ALL TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_availability.professional_id
        AND p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.professionals p
      WHERE p.id = professional_availability.professional_id
        AND p.user_id = auth.uid()
    )
  );

-- ── Extra columns on professionals ───────────────────────────────────────────
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS video_link text,
  ADD COLUMN IF NOT EXISTS calendar_notes text,
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'free';
