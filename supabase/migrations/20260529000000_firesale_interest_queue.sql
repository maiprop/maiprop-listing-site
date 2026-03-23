-- Investor queue for Quick Sale (firesale) deals.
-- Investors express interest in a deal; those with proof of funds get priority.

CREATE TABLE IF NOT EXISTS public.firesale_interest (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id        UUID        NOT NULL REFERENCES public.firesale_requests(id) ON DELETE CASCADE,
  investor_id    UUID        NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  proof_of_funds_url TEXT,
  proof_amount   NUMERIC,
  message        TEXT,
  -- 'interested' → admin sees it, 'shortlisted' → admin shortlisted, 'engaged' → in active negotiation, 'passed' → admin passed on this investor
  status         TEXT        NOT NULL DEFAULT 'interested'
                   CHECK (status IN ('interested', 'shortlisted', 'engaged', 'passed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, investor_id)
);

ALTER TABLE public.firesale_interest ENABLE ROW LEVEL SECURITY;

-- Investors manage their own entries
CREATE POLICY "Investors manage own firesale interest"
  ON public.firesale_interest FOR ALL
  USING  (auth.uid() = investor_id)
  WITH CHECK (auth.uid() = investor_id);

-- Platform admins can read and update all (for queue management)
CREATE POLICY "Admins manage all firesale interest"
  ON public.firesale_interest FOR ALL
  USING  (public.has_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_firesale_interest_deal_id     ON public.firesale_interest(deal_id);
CREATE INDEX IF NOT EXISTS idx_firesale_interest_investor_id ON public.firesale_interest(investor_id);
CREATE INDEX IF NOT EXISTS idx_firesale_interest_status      ON public.firesale_interest(status);

CREATE TRIGGER update_firesale_interest_updated_at
  BEFORE UPDATE ON public.firesale_interest
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
