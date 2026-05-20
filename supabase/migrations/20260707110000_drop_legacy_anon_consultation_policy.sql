-- Follow-up to the auth-required professional request guard.
-- Some live projects still carried this older permissive INSERT policy name,
-- which allowed anon requests with requester_id IS NULL to reach the trigger.

DROP POLICY IF EXISTS "Consultation requests with identity check"
  ON public.consultation_requests;

DROP POLICY IF EXISTS "consultation_requests_insert_auth"
  ON public.consultation_requests;

CREATE POLICY "consultation_requests_insert_auth"
  ON public.consultation_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (requester_id = (select auth.uid()));

COMMENT ON POLICY "consultation_requests_insert_auth"
  ON public.consultation_requests
  IS 'Only signed-in users may create professional requests; requester_id must match auth.uid().';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'consultation_requests'
      AND policyname IN (
        'consultation_requests_insert_anon',
        'Consultation requests insert (anon no-identity)',
        'Anyone can create consultation requests',
        'Consultation requests with identity check'
      )
  ) THEN
    RAISE EXCEPTION 'Anonymous consultation request insert policy still exists';
  END IF;
END $$;
