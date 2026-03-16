-- investor_subscriptions: change tiers from analyst/institutional/sovereign to private/institutional/developer

-- Migrate existing data: analyst -> private, sovereign -> institutional, institutional stays
UPDATE public.investor_subscriptions SET tier = 'private' WHERE tier = 'analyst';
UPDATE public.investor_subscriptions SET tier = 'institutional' WHERE tier = 'sovereign';
-- institutional stays as is

-- Drop old check constraint (find by table constraint name)
ALTER TABLE public.investor_subscriptions DROP CONSTRAINT IF EXISTS investor_subscriptions_tier_check;

-- Add new check constraint
ALTER TABLE public.investor_subscriptions ADD CONSTRAINT investor_subscriptions_tier_check
  CHECK (tier IN ('private', 'institutional', 'developer'));
