-- =============================================================================
-- Quick Sale deals: only eligible buyers and admin have access.
-- Eligibility = approved application (active investor_subscription).
-- Removes dependency on investor/institutional profile role.
-- =============================================================================

-- Replace the subscribed-investors policy: eligibility = active subscription only
DROP POLICY IF EXISTS "Subscribed investors view firesale deal feed" ON public.firesale_requests;
DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals" ON public.firesale_requests;

CREATE POLICY "Eligible buyers view published Quick Sale deals"
  ON public.firesale_requests FOR SELECT
  TO authenticated
  USING (
    published_to_investors = true
    AND EXISTS (
      SELECT 1 FROM public.investor_subscriptions
      WHERE user_id = auth.uid()
        AND status IN ('active', 'trial')
    )
  );

COMMENT ON POLICY "Eligible buyers view published Quick Sale deals" ON public.firesale_requests IS
  'Eligibility comes from approved invitation_requests → investor_subscriptions. Admin sees all via Platform admin policy.';
