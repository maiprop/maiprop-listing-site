-- Pricing configuration table for plans, modules, usage, etc.
-- This is intentionally flexible: each row represents one priced item
-- (e.g. "firesale_investor_basic", "firesale_investor_pro", "ai_calls_bundle").

CREATE TABLE IF NOT EXISTS public.pricing_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,                          -- machine key, e.g. 'firesale_investor_basic'
  label TEXT NOT NULL,                               -- human label shown in UI
  description TEXT,                                  -- longer description
  audience TEXT NOT NULL,                            -- e.g. 'investor', 'seller', 'professional', 'admin'
  module TEXT NOT NULL,                              -- e.g. 'firesale_dashboard', 'auctions', 'ai_tools'
  unit TEXT NOT NULL DEFAULT 'monthly',              -- 'monthly', 'yearly', 'per_use', 'per_ai_call', etc.
  currency TEXT NOT NULL DEFAULT 'EUR',
  amount NUMERIC(14,2) NOT NULL DEFAULT 0,           -- base price for the unit
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,                -- free-form config (limits, included usage, etc.)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.pricing_configs ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing; only authenticated users can modify for now.
CREATE POLICY "Anyone can read pricing_configs"
  ON public.pricing_configs FOR SELECT
  USING (true);

CREATE POLICY "Authenticated can modify pricing_configs"
  ON public.pricing_configs FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can update pricing_configs"
  ON public.pricing_configs FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete pricing_configs"
  ON public.pricing_configs FOR DELETE
  USING (auth.role() = 'authenticated');

CREATE TRIGGER update_pricing_configs_updated_at
  BEFORE UPDATE ON public.pricing_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

