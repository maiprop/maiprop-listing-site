-- Validate scheduled consultation preferences against a professional's weekly
-- availability without blocking the existing manual-confirmation flow when no
-- availability has been configured.

CREATE OR REPLACE FUNCTION public.validate_consultation_request_availability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_preferred_time time;
  v_active_availability_count integer;
BEGIN
  IF NEW.request_type IS DISTINCT FROM 'consultation' THEN
    RETURN NEW;
  END IF;

  NEW.preferred_time := NULLIF(BTRIM(COALESCE(NEW.preferred_time, '')), '');

  IF NEW.preferred_date IS NULL AND NEW.preferred_time IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.preferred_date IS NULL OR NEW.preferred_time IS NULL THEN
    RAISE EXCEPTION 'Consultation requests need both preferred_date and preferred_time when either is supplied'
      USING ERRCODE = '23514';
  END IF;

  BEGIN
    v_preferred_time := NEW.preferred_time::time;
  EXCEPTION
    WHEN invalid_datetime_format OR invalid_text_representation THEN
      RAISE EXCEPTION 'preferred_time must be a valid time'
        USING ERRCODE = '22007';
  END;

  SELECT COUNT(*)
    INTO v_active_availability_count
    FROM public.professional_availability pa
   WHERE pa.professional_id = NEW.professional_id
     AND pa.is_active = true;

  IF v_active_availability_count = 0 THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.professional_availability pa
     WHERE pa.professional_id = NEW.professional_id
       AND pa.is_active = true
       AND pa.day_of_week = EXTRACT(DOW FROM NEW.preferred_date)::smallint
       AND v_preferred_time >= pa.start_time
       AND v_preferred_time <= pa.end_time
  ) THEN
    RAISE EXCEPTION 'Preferred consultation time is outside professional availability'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_consultation_request_availability() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.validate_consultation_request_availability() FROM anon, authenticated;

DROP TRIGGER IF EXISTS validate_consultation_request_availability
  ON public.consultation_requests;

CREATE TRIGGER validate_consultation_request_availability
  BEFORE INSERT OR UPDATE OF professional_id, request_type, preferred_date, preferred_time
  ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_consultation_request_availability();

COMMENT ON FUNCTION public.validate_consultation_request_availability() IS
  'Validates consultation preferred_date/preferred_time against active professional_availability rows when a schedule exists; allows unscheduled manual requests.';
