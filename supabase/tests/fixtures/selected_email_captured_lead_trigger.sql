-- Synthetic captured-table shape: 2026-09-27 catalog records this trigger, while D0 source omits it.
-- The helper body is the source fixture's 47b72756... definition, not a captured hosted body.
DO $fixture$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='public.marketing_leads'::regclass
      AND tgname='update_leads_updated_at') THEN
    RAISE EXCEPTION 'selected_email_captured_trigger_already_present';
  END IF;
  IF pg_catalog.md5(pg_catalog.pg_get_functiondef('public.update_updated_at_column()'::regprocedure))
      <> '47b72756852a143198dccf4db5943afc' THEN
    RAISE EXCEPTION 'selected_email_source_trigger_helper_drift';
  END IF;
END;
$fixture$;
CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.marketing_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
