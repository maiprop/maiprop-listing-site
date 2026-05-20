-- Professional client actions must be tied to a signed-in user.
-- Public directory/profile browsing remains available, but creating a message,
-- callback, or consultation request must not be possible through the anon key.

DROP POLICY IF EXISTS "consultation_requests_insert_anon"
  ON public.consultation_requests;
DROP POLICY IF EXISTS "Consultation requests insert (anon no-identity)"
  ON public.consultation_requests;
DROP POLICY IF EXISTS "Anyone can create consultation requests"
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
  IS 'Signed-in users may create professional requests only for themselves; anon inserts are intentionally unsupported.';

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
        'Anyone can create consultation requests'
      )
  ) THEN
    RAISE EXCEPTION 'Anonymous consultation request insert policy still exists';
  END IF;
END $$;
