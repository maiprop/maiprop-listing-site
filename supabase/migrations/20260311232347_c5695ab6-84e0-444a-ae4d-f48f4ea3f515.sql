
-- Drop the vulnerable SELECT policies on firesale_requests
DROP POLICY IF EXISTS "Users can view own firesale requests" ON public.firesale_requests;

-- Recreate: authenticated users can only view their OWN rows (user_id must match)
CREATE POLICY "Users can view own firesale requests"
ON public.firesale_requests
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);
