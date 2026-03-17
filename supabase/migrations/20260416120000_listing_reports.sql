-- =============================================================================
-- listing_reports: user reports on listings, auctions, open houses, firesale deals
-- Admin can view in Admin Dashboard > Reports
-- =============================================================================

CREATE TABLE public.listing_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL CHECK (entity_type IN ('listing', 'firesale_request')),
  entity_id uuid NOT NULL,
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.listing_reports IS 'User reports on ads, auctions, open houses. Admin reviews in Admin Dashboard.';

CREATE INDEX idx_listing_reports_entity ON public.listing_reports(entity_type, entity_id);
CREATE INDEX idx_listing_reports_reporter ON public.listing_reports(reporter_id);
CREATE INDEX idx_listing_reports_created ON public.listing_reports(created_at DESC);

ALTER TABLE public.listing_reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can report (INSERT only)
CREATE POLICY "Authenticated can report"
  ON public.listing_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Platform admin can view all reports
CREATE POLICY "Platform admin can view reports"
  ON public.listing_reports FOR SELECT
  USING (public.has_platform_admin(auth.uid()));
