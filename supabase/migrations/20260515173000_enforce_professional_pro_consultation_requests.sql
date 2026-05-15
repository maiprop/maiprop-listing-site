-- Professional directory monetisation guard.
-- Free professional profiles expose public contact/profile details only. Any
-- workflow row that creates a message, callback, or consultation request must
-- target a Pro professional, so direct Supabase calls cannot bypass the UI.

CREATE OR REPLACE FUNCTION public.enforce_professional_pro_consultation_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_tier text;
BEGIN
  SELECT lower(coalesce(subscription_tier, 'free'))
    INTO target_tier
  FROM public.professionals
  WHERE id = NEW.professional_id;

  IF target_tier IS NULL THEN
    RAISE EXCEPTION 'Professional profile not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF target_tier <> 'pro' THEN
    RAISE EXCEPTION 'Client actions are available only for Pro professional profiles'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_professional_pro_consultation_request
  ON public.consultation_requests;

CREATE TRIGGER enforce_professional_pro_consultation_request
  BEFORE INSERT ON public.consultation_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_professional_pro_consultation_request();

COMMENT ON FUNCTION public.enforce_professional_pro_consultation_request() IS
  'Rejects consultation/message/callback requests unless the target professional has subscription_tier=pro.';
