-- =============================================================================
-- Restructure platform roles: Retailers, Buy-side, Sell-side, Market Professionals
-- =============================================================================
-- New model:
--   Retailers: individual (buyer), seller_landlord (seller)
--   Buy-side: investor, institutional
--   Sell-side: institutional, developer
--   Market Professionals: agent, professional
--
-- institutional is both buy-side and sell-side (institutions invest and sell)
-- =============================================================================

-- 1. Add new roles to enum
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'investor';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'institutional';
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'developer';

-- 2. Helper: sell-side roles (can create listings, firesale admin, etc.)
CREATE OR REPLACE FUNCTION public.has_sell_side_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND role::text IN ('agent', 'institutional', 'developer')
  );
$$;

-- 3. Helper: buy-side roles (investor dashboard, deal flow)
CREATE OR REPLACE FUNCTION public.has_buy_side_role(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
    AND role::text IN ('investor', 'institutional')
  );
$$;

-- 4. Profiles RLS: allow individual -> investor, institutional, developer (self-assign)
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      role = (SELECT p.role FROM public.profiles p WHERE p.user_id = auth.uid())
      OR
      ( (SELECT p.role::text FROM public.profiles p WHERE p.user_id = auth.uid()) = 'individual'
        AND role::text IN ('seller_landlord', 'professional', 'investor', 'institutional', 'developer') )
      OR
      ( (SELECT p.role::text FROM public.profiles p WHERE p.user_id = auth.uid()) = 'seller_landlord'
        AND role::text = 'individual' )
    )
  );

-- 5. Investor subscriptions: agent can grant (platform admin)
DROP POLICY IF EXISTS "Admins can insert investor subscriptions" ON public.investor_subscriptions;
CREATE POLICY "Admins can insert investor subscriptions"
  ON public.investor_subscriptions FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'agent'::public.user_role));

-- 6. Professionals guard: agent can change subscription_tier (keep agent-only for pro directory admin)
-- No change - professionals_guard_subscription_tier stays has_role(agent)

-- 8. Firesale requests: sell-side can manage (agent, institutional, developer)
-- Check existing policies
-- listings: owner_id = auth.uid() - no role check for insert. CreateListing is app-gated.
-- We rely on app logic + participantType. DB doesn't restrict listing creation by role in the same way.

-- 8. Migrate existing users: institutional/developer with role=agent and bio __type:institutional/__type:developer
-- Set their role to institutional or developer
UPDATE public.profiles
SET role = 'institutional'::public.user_role
WHERE role::text = 'agent' AND bio LIKE '__type:institutional%';

UPDATE public.profiles
SET role = 'developer'::public.user_role
WHERE role::text = 'agent' AND bio LIKE '__type:developer%';

UPDATE public.profiles
SET role = 'investor'::public.user_role
WHERE role::text = 'individual' AND bio LIKE '__type:investor%';
