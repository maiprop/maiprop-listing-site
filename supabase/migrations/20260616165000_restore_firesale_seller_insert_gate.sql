-- Restore the authoritative seller-only gate for Quick Sale request inserts.
-- A later ownership-only cleanup accidentally weakened the policy to allow any
-- authenticated user to insert a request for themselves. The UI already treats
-- Quick Sale submission as a seller-only flow; RLS must enforce the same rule.

DROP POLICY IF EXISTS "firesale_requests_insert" ON public.firesale_requests;

CREATE POLICY "firesale_requests_insert"
  ON public.firesale_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND public.authoritative_role((SELECT auth.uid())) = 'seller'::public.user_role
  );
