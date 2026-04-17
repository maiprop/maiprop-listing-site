-- Harden firesale_requests INSERT policy.
-- The previous policy allowed auth.role() IN ('anon', 'authenticated') with no user_id
-- ownership check — an authenticated user could submit a request with any user_id.
-- This migration replaces it: the submitted user_id must match the caller (or be NULL
-- for genuinely anonymous inquiries where user_id is not provided).

DROP POLICY IF EXISTS "firesale_requests_insert" ON public.firesale_requests;

CREATE POLICY "firesale_requests_insert" ON public.firesale_requests
  FOR INSERT
  WITH CHECK (
    -- Anonymous submissions must leave user_id NULL
    -- Authenticated submissions must use their own uid
    user_id IS NULL
    OR (select auth.uid()) = user_id
  );
