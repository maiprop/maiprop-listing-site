
-- Add admin_notes column to firesale_requests
ALTER TABLE public.firesale_requests ADD COLUMN IF NOT EXISTS admin_notes text;

-- Add RLS policy for admin to view ALL firesale requests
CREATE POLICY "Admins can view all firesale requests"
  ON public.firesale_requests
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'agent'::public.user_role));

-- Add RLS policy for admin to update ALL firesale requests (status + notes)
CREATE POLICY "Admins can update all firesale requests"
  ON public.firesale_requests
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'agent'::public.user_role));
