-- =============================================================================
-- invitation_requests: users request access to Quick Sale investor deal flow
-- Admin invites by adding to investor_subscriptions
-- =============================================================================

CREATE TABLE public.invitation_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  company text,
  message text,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);

COMMENT ON TABLE public.invitation_requests IS 'Request access to Quick Sale investor deal flow. Admin approves by inviting user.';

CREATE INDEX idx_invitation_requests_status ON public.invitation_requests(status);
CREATE INDEX idx_invitation_requests_created ON public.invitation_requests(created_at DESC);

ALTER TABLE public.invitation_requests ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can submit a request (INSERT only)
CREATE POLICY "Authenticated can request invitation"
  ON public.invitation_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Allow anon to submit (for logged-out users)
CREATE POLICY "Anyone can submit invitation request"
  ON public.invitation_requests FOR INSERT
  TO anon
  WITH CHECK (user_id IS NULL);

-- Platform admin can view and update
CREATE POLICY "Platform admin can view invitation requests"
  ON public.invitation_requests FOR SELECT
  USING (public.has_platform_admin(auth.uid()));

CREATE POLICY "Platform admin can update invitation requests"
  ON public.invitation_requests FOR UPDATE
  USING (public.has_platform_admin(auth.uid()));
