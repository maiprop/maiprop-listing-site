CREATE OR REPLACE FUNCTION public.task18_existing_submission_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN NEW;
END
$function$;

CREATE TRIGGER new_building_leads_preserve_submission_identity
BEFORE UPDATE ON public.new_building_leads
FOR EACH ROW
EXECUTE FUNCTION public.task18_existing_submission_trigger();
