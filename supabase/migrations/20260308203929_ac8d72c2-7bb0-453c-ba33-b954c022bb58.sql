
-- Create investor_subscriptions table
CREATE TABLE public.investor_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  tier text NOT NULL CHECK (tier IN ('analyst', 'institutional', 'sovereign')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE public.investor_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "Users can view their own subscription"
  ON public.investor_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own subscription
CREATE POLICY "Users can create their own subscription"
  ON public.investor_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own subscription
CREATE POLICY "Users can update their own subscription"
  ON public.investor_subscriptions
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins (agent role) can view all subscriptions
CREATE POLICY "Admins can view all subscriptions"
  ON public.investor_subscriptions
  FOR SELECT
  USING (public.has_role(auth.uid(), 'agent'));

-- Admins can update all subscriptions
CREATE POLICY "Admins can update all subscriptions"
  ON public.investor_subscriptions
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'agent'));

-- Trigger to auto-update updated_at
CREATE TRIGGER update_investor_subscriptions_updated_at
  BEFORE UPDATE ON public.investor_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
