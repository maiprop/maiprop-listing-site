-- =============================================================================
-- Plan limits & usage tables: subscription cache, usage tracking, RLS enforcement
-- =============================================================================

-- 1. Add subscription_product_id to profiles (updated by check-subscription)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_product_id TEXT;

COMMENT ON COLUMN public.profiles.subscription_product_id IS 'Stripe product ID from active subscription, updated by check-subscription';

-- 2. Usage tables for add-ons
CREATE TABLE IF NOT EXISTS public.usage_ai_valuations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_ai_valuations_user_month ON public.usage_ai_valuations(user_id, (date_trunc('month', created_at)));
ALTER TABLE public.usage_ai_valuations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own valuation usage" ON public.usage_ai_valuations FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own valuation usage" ON public.usage_ai_valuations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.usage_property_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_property_reports_user_month ON public.usage_property_reports(user_id, (date_trunc('month', created_at)));
ALTER TABLE public.usage_property_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own report usage" ON public.usage_property_reports FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own report usage" ON public.usage_property_reports FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.usage_priority_ads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_usage_priority_ads_user_month ON public.usage_priority_ads(user_id, (date_trunc('month', created_at)));
ALTER TABLE public.usage_priority_ads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own priority ad usage" ON public.usage_priority_ads FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own priority ad usage" ON public.usage_priority_ads FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Table of Stripe product IDs that grant "Pro" status (for listing/limit checks)
CREATE TABLE IF NOT EXISTS public.pro_product_ids (
  product_id TEXT NOT NULL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.pro_product_ids (product_id) VALUES ('prod_U8SJbk3fZQ3xgD')
  ON CONFLICT (product_id) DO NOTHING;

-- 4. Security definer: get listing limit for user (seller/agent)
CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_bio TEXT;
  v_product_id TEXT;
  v_is_pro BOOLEAN;
BEGIN
  SELECT role::TEXT, bio INTO v_role, v_bio
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  SELECT subscription_product_id INTO v_product_id
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id));

  -- Platform admin: unlimited
  IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = p_user_id AND is_platform_admin = true) THEN
    RETURN 999;
  END IF;

  -- Seller / seller_landlord
  IF v_role = 'seller_landlord' OR (v_bio LIKE '__type:seller%') THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 2 END;
  END IF;

  -- Agent
  IF v_role = 'agent' OR (v_bio LIKE '__type:agent%') THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 5 END;
  END IF;

  -- Institutional, developer: unlimited (Pro only for developer)
  IF v_role IN ('institutional', 'developer') THEN
    RETURN 999;
  END IF;

  -- Default: no listings (buyer, professional, etc)
  RETURN 0;
END;
$$;

-- 5. Security definer: get saved search limit
CREATE OR REPLACE FUNCTION public.get_saved_search_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bio TEXT;
  v_product_id TEXT;
  v_is_pro BOOLEAN;
BEGIN
  SELECT bio, subscription_product_id INTO v_bio, v_product_id
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id));

  -- Only buyers have this limit
  IF v_bio LIKE '__type:buyer%' OR v_bio IS NULL OR v_bio = '' OR NOT (v_bio LIKE '__type:agent%' OR v_bio LIKE '__type:seller%' OR v_bio LIKE '__type:developer%' OR v_bio LIKE '__type:professional%' OR v_bio LIKE '__type:investor%' OR v_bio LIKE '__type:institutional%') THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

-- 6. Security definer: get search alerts limit (saved searches with email_alerts)
CREATE OR REPLACE FUNCTION public.get_search_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bio TEXT;
  v_product_id TEXT;
  v_is_pro BOOLEAN;
BEGIN
  SELECT bio, subscription_product_id INTO v_bio, v_product_id
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id));

  IF v_bio LIKE '__type:buyer%' OR v_bio IS NULL OR v_bio = '' OR NOT (v_bio LIKE '__type:agent%' OR v_bio LIKE '__type:seller%' OR v_bio LIKE '__type:developer%' OR v_bio LIKE '__type:professional%' OR v_bio LIKE '__type:investor%' OR v_bio LIKE '__type:institutional%') THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

-- 7. Security definer: get auction alert limit
CREATE OR REPLACE FUNCTION public.get_auction_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bio TEXT;
  v_product_id TEXT;
  v_is_pro BOOLEAN;
BEGIN
  SELECT bio, subscription_product_id INTO v_bio, v_product_id
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id));

  IF v_bio LIKE '__type:buyer%' OR v_bio IS NULL OR v_bio = '' OR NOT (v_bio LIKE '__type:agent%' OR v_bio LIKE '__type:seller%' OR v_bio LIKE '__type:developer%' OR v_bio LIKE '__type:professional%' OR v_bio LIKE '__type:investor%' OR v_bio LIKE '__type:institutional%') THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

-- 8. Security definer: get viewings-per-month limit (requester = buyer, owner = agent)
CREATE OR REPLACE FUNCTION public.get_viewing_limit(p_user_id UUID, p_is_requester BOOLEAN)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_bio TEXT;
  v_product_id TEXT;
  v_is_pro BOOLEAN;
BEGIN
  SELECT role::TEXT, bio, subscription_product_id INTO v_role, v_bio, v_product_id
  FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id));

  -- Buyer (requester)
  IF p_is_requester AND (v_bio LIKE '__type:buyer%' OR v_bio IS NULL OR v_bio = '' OR NOT (v_bio LIKE '__type:agent%' OR v_bio LIKE '__type:seller%' OR v_bio LIKE '__type:developer%' OR v_bio LIKE '__type:professional%' OR v_bio LIKE '__type:investor%' OR v_bio LIKE '__type:institutional%')) THEN
    RETURN CASE WHEN v_is_pro THEN 10 ELSE 1 END;
  END IF;

  -- Agent (owner - viewings on their listings)
  IF NOT p_is_requester AND (v_role = 'agent' OR v_bio LIKE '__type:agent%') THEN
    RETURN CASE WHEN v_is_pro THEN 10 ELSE 3 END;
  END IF;

  RETURN 999;
END;
$$;

-- 9. Trigger: enforce saved search limit
CREATE OR REPLACE FUNCTION public.check_saved_search_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
  v_alert_count INT;
  v_alert_limit INT;
BEGIN
  v_limit := public.get_saved_search_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM public.saved_searches WHERE user_id = NEW.user_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'saved_search_limit_reached' USING HINT = 'Upgrade to Pro for more saved searches';
  END IF;

  -- If enabling alert, also check alert limit
  IF NEW.email_alerts THEN
    v_alert_limit := public.get_search_alert_limit(NEW.user_id);
    IF v_alert_limit < 999 THEN
      SELECT COUNT(*) INTO v_alert_count FROM public.saved_searches WHERE user_id = NEW.user_id AND email_alerts = true;
      IF v_alert_count >= v_alert_limit THEN
        RAISE EXCEPTION 'search_alert_limit_reached' USING HINT = 'Upgrade to Pro for more search alerts';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_saved_search_limit ON public.saved_searches;
CREATE TRIGGER trg_check_saved_search_limit
  BEFORE INSERT ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.check_saved_search_limit();

-- 10. Trigger: enforce saved search alert limit on UPDATE (toggle email_alerts)
CREATE OR REPLACE FUNCTION public.check_saved_search_alert_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_alert_limit INT;
  v_alert_count INT;
BEGIN
  IF NEW.email_alerts = OLD.email_alerts THEN RETURN NEW; END IF;
  IF NOT NEW.email_alerts THEN RETURN NEW; END IF;

  v_alert_limit := public.get_search_alert_limit(NEW.user_id);
  IF v_alert_limit >= 999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_alert_count FROM public.saved_searches WHERE user_id = NEW.user_id AND email_alerts = true;
  IF v_alert_count >= v_alert_limit THEN
    RAISE EXCEPTION 'search_alert_limit_reached' USING HINT = 'Upgrade to Pro for more search alerts';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_saved_search_alert_update ON public.saved_searches;
CREATE TRIGGER trg_check_saved_search_alert_update
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.check_saved_search_alert_on_update();

-- 11. Trigger: enforce auction alert limit
CREATE OR REPLACE FUNCTION public.check_auction_alert_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  v_limit := public.get_auction_alert_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM public.auction_alerts WHERE user_id = NEW.user_id AND active = true;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'auction_alert_limit_reached' USING HINT = 'Upgrade to Pro for more auction alerts';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_auction_alert_limit ON public.auction_alerts;
CREATE TRIGGER trg_check_auction_alert_limit
  BEFORE INSERT ON public.auction_alerts
  FOR EACH ROW EXECUTE FUNCTION public.check_auction_alert_limit();

-- 12. Trigger: enforce auction alert limit on UPDATE (activate)
CREATE OR REPLACE FUNCTION public.check_auction_alert_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  IF NEW.active = OLD.active THEN RETURN NEW; END IF;
  IF NOT NEW.active THEN RETURN NEW; END IF;

  v_limit := public.get_auction_alert_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_count FROM public.auction_alerts WHERE user_id = NEW.user_id AND active = true;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'auction_alert_limit_reached' USING HINT = 'Upgrade to Pro for more auction alerts';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_auction_alert_update ON public.auction_alerts;
CREATE TRIGGER trg_check_auction_alert_update
  BEFORE UPDATE ON public.auction_alerts
  FOR EACH ROW EXECUTE FUNCTION public.check_auction_alert_on_update();

-- 13. Trigger: enforce viewing limit (monthly)
CREATE OR REPLACE FUNCTION public.check_viewing_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit_requester INT;
  v_limit_owner INT;
  v_count_requester INT;
  v_count_owner INT;
  v_month_start TIMESTAMPTZ;
BEGIN
  v_month_start := date_trunc('month', now())::timestamptz;

  -- Check requester (buyer) limit
  v_limit_requester := public.get_viewing_limit(NEW.requester_id, true);
  IF v_limit_requester < 999 THEN
    SELECT COUNT(*) INTO v_count_requester FROM public.viewings
    WHERE requester_id = NEW.requester_id AND created_at >= v_month_start;
    IF v_count_requester >= v_limit_requester THEN
      RAISE EXCEPTION 'viewing_limit_reached' USING HINT = 'Upgrade to Pro for more viewings per month';
    END IF;
  END IF;

  -- Check owner (agent) limit - viewings on their listings
  v_limit_owner := public.get_viewing_limit(NEW.owner_id, false);
  IF v_limit_owner < 999 THEN
    SELECT COUNT(*) INTO v_count_owner FROM public.viewings
    WHERE owner_id = NEW.owner_id AND created_at >= v_month_start;
    IF v_count_owner >= v_limit_owner THEN
      RAISE EXCEPTION 'viewing_limit_reached' USING HINT = 'Listing owner has reached viewing limit. Upgrade to Pro for more.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_viewing_limit ON public.viewings;
CREATE TRIGGER trg_check_viewing_limit
  BEFORE INSERT ON public.viewings
  FOR EACH ROW EXECUTE FUNCTION public.check_viewing_limit();

-- 14. Trigger: enforce listing limit
CREATE OR REPLACE FUNCTION public.check_listing_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  v_limit := public.get_listing_limit(NEW.owner_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'listing_not_allowed' USING HINT = 'Your account type cannot create listings';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.listings WHERE owner_id = NEW.owner_id;
  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'listing_limit_reached' USING HINT = 'Upgrade to Pro for more listings';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_listing_limit ON public.listings;
CREATE TRIGGER trg_check_listing_limit
  BEFORE INSERT ON public.listings
  FOR EACH ROW EXECUTE FUNCTION public.check_listing_limit();

-- 15. Private Owner Ad Alerts (agents get notified when private sellers list)
CREATE TABLE IF NOT EXISTS public.private_owner_ad_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);
ALTER TABLE public.private_owner_ad_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own private owner alerts" ON public.private_owner_ad_alerts FOR ALL USING (auth.uid() = user_id);

-- 16. RPC: professionals with priority (Pro users first)
CREATE OR REPLACE FUNCTION public.get_professionals_with_priority(p_category TEXT DEFAULT NULL)
RETURNS SETOF public.professionals
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.*
  FROM public.professionals p
  LEFT JOIN public.profiles pr ON pr.user_id = p.user_id
  LEFT JOIN public.pro_product_ids pp ON pp.product_id = pr.subscription_product_id
  WHERE (p_category IS NULL OR p.category = p_category::public.professional_category)
  ORDER BY (pp.product_id IS NOT NULL) DESC NULLS LAST, p.rating DESC NULLS LAST;
$$;
