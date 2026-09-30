-- Synthetic 2026-09-27 selected captured marketing_leads table metadata.
-- Apply only to a D0 local clone after the accepted T12b1 migration.
-- The captured catalog gives these columns, constraints, indexes and trigger definition.
-- Its trigger helper body was not captured; this fixture requires the matching D0 source helper.
BEGIN;
DO $fixture$
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_attribute WHERE attrelid='public.marketing_leads'::regclass
    AND attnum>0 AND NOT attisdropped)<>13
    OR (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgrelid='public.marketing_leads'::regclass
      AND NOT tgisinternal)<>0
    OR pg_catalog.md5(pg_catalog.pg_get_functiondef('public.update_updated_at_column()'::regprocedure))
      <> '47b72756852a143198dccf4db5943afc' THEN
    RAISE EXCEPTION 'selected_email_captured_fixture_source_drift';
  END IF;
END;
$fixture$;
ALTER TABLE public.marketing_leads
  ADD COLUMN source text NOT NULL DEFAULT 'manual',
  ADD COLUMN listing_id uuid,
  ADD COLUMN professional_id uuid,
  ADD COLUMN project_id uuid,
  ADD COLUMN message text,
  ADD COLUMN notes text,
  ADD COLUMN follow_up_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.marketing_leads DROP CONSTRAINT marketing_leads_owner_id_fkey;
ALTER TABLE public.marketing_leads ADD CONSTRAINT leads_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.marketing_leads ADD CONSTRAINT leads_listing_id_fkey
  FOREIGN KEY (listing_id) REFERENCES public.listings(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_leads ADD CONSTRAINT leads_professional_id_fkey
  FOREIGN KEY (professional_id) REFERENCES public.professionals(id) ON DELETE SET NULL;
ALTER TABLE public.marketing_leads ADD CONSTRAINT leads_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE SET NULL;
CREATE INDEX idx_marketing_leads_listing_id ON public.marketing_leads(listing_id);
CREATE INDEX idx_marketing_leads_professional_id ON public.marketing_leads(professional_id);
CREATE INDEX idx_marketing_leads_project_id ON public.marketing_leads(project_id);
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
COMMIT;
