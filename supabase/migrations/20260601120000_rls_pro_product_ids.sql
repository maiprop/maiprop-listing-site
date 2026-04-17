-- Enable RLS on pro_product_ids.
-- This is a read-only reference table (Stripe product IDs that grant Pro status).
-- All mutating access goes through the service role only.
-- SECURITY DEFINER functions that reference this table bypass RLS automatically.

ALTER TABLE public.pro_product_ids ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read the list of pro product IDs.
-- The values are not sensitive (they are Stripe product IDs, not keys).
CREATE POLICY "Authenticated users can read pro product ids"
  ON public.pro_product_ids
  FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies — only the service role (e.g. Stripe webhook
-- edge function) may modify this table, and the service role bypasses RLS entirely.
