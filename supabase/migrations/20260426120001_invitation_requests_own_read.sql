-- Allow users to read their own Quick Sale access application (for dashboard tracking)
CREATE POLICY "Users can view own invitation request"
  ON public.invitation_requests FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
