
-- Fix: firesale_requests INSERT policy was overly permissive (WITH CHECK (true))
-- Replace with a more specific policy that still allows unauthenticated submissions
-- but links user_id properly when logged in

DROP POLICY IF EXISTS "Anyone can submit a firesale request" ON public.firesale_requests;

CREATE POLICY "Anyone can submit a firesale request"
  ON public.firesale_requests FOR INSERT
  WITH CHECK (
    -- Unauthenticated users: user_id must be null
    -- Authenticated users: user_id must match their auth.uid() or be null
    user_id IS NULL OR auth.uid() = user_id
  );
