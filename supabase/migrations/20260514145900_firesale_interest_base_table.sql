-- Clean-replay compatibility: the reservation workflow dated 20260514150000
-- hardens firesale_interest, while the original base-table migration was
-- later dated 20260529000000. Create the base shape first when replaying all
-- migrations from an empty database. Existing/live databases no-op here.

CREATE TABLE IF NOT EXISTS public.firesale_interest (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.firesale_requests(id) ON DELETE CASCADE,
  investor_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  proof_of_funds_url TEXT,
  proof_amount NUMERIC,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'interested'
    CHECK (status IN ('interested', 'shortlisted', 'engaged', 'passed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, investor_id)
);

