-- =============================================================================
-- Prevent agents from self-granting investor subscriptions
-- Agents can only INSERT subscriptions for OTHER users (e.g. granting to investors)
-- Self-subscription must go through payment webhook (service_role)
-- =============================================================================

DROP POLICY IF EXISTS "Admins can insert investor subscriptions" ON public.investor_subscriptions;

CREATE POLICY "Admins can insert investor subscriptions for others only"
  ON public.investor_subscriptions FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'agent'::public.user_role)
    AND (user_id IS NULL OR user_id != auth.uid())
  );
