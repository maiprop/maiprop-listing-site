-- Cache generated MAIProp OS property reports for 30 days.
-- Report HTML is served only through the authenticated Edge Function so the
-- function can decide whether the current user should be charged.

CREATE TABLE IF NOT EXISTS public.property_report_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  report_type TEXT NOT NULL DEFAULT 'valuation',
  lang TEXT NOT NULL DEFAULT 'en',
  source TEXT NOT NULL DEFAULT 'os',
  html TEXT NOT NULL,
  ai JSONB,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  file_name TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT property_report_cache_report_type_check
    CHECK (report_type IN ('valuation')),
  CONSTRAINT property_report_cache_lang_check
    CHECK (lang IN ('en', 'el')),
  CONSTRAINT property_report_cache_expires_after_generated_check
    CHECK (expires_at > generated_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_property_report_cache_listing_type_lang
  ON public.property_report_cache (listing_id, report_type, lang);

CREATE INDEX IF NOT EXISTS idx_property_report_cache_expires_at
  ON public.property_report_cache (expires_at);

ALTER TABLE public.property_report_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages property report cache" ON public.property_report_cache;
CREATE POLICY "Service role manages property report cache"
  ON public.property_report_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.property_report_cache IS
  '30-day cache of MAIProp OS printable property report HTML. Access is mediated by fetch-report-from-os.';
