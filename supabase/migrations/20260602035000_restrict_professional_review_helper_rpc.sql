-- can_review_professional() is a trigger/helper function used by
-- guard_professional_review_write(); browser clients insert/update reviews via
-- table policies and the trigger enforces eligibility. Direct Data API execute
-- access is unnecessary and broadens the SECURITY DEFINER surface.

REVOKE ALL ON FUNCTION public.can_review_professional(UUID, UUID)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.can_review_professional(UUID, UUID)
  TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.can_review_professional(uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.can_review_professional(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'can_review_professional(uuid,uuid) must not be browser-executable';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.can_review_professional(uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'can_review_professional(uuid,uuid) must remain service-callable';
  END IF;
END $$;
