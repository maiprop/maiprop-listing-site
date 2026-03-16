-- =============================================================================
-- Add published_to_investors to firesale_requests.
-- Only deals approved by admin appear in the main Investor Dashboard.
-- =============================================================================

ALTER TABLE public.firesale_requests
  ADD COLUMN IF NOT EXISTS published_to_investors boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.firesale_requests.published_to_investors IS 'Admin must approve before deal appears in main Investor Dashboard for investors';

CREATE INDEX IF NOT EXISTS idx_firesale_requests_published
  ON public.firesale_requests(published_to_investors) WHERE published_to_investors = true;

-- Update RLS: subscribed investors only see published deals (admin sees all via Platform admin policy)
DROP POLICY IF EXISTS "Subscribed investors view firesale deal feed" ON public.firesale_requests;
CREATE POLICY "Subscribed investors view firesale deal feed"
  ON public.firesale_requests FOR SELECT
  TO authenticated
  USING (
    published_to_investors = true
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
        AND role::text IN ('investor', 'institutional')
    )
    AND EXISTS (
      SELECT 1 FROM public.investor_subscriptions
      WHERE user_id = auth.uid()
        AND status IN ('active', 'trial')
    )
  );
