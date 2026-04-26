-- =============================================================================
-- 20260623150000_plan_limit_enforcement.sql
-- =============================================================================
-- Tighten plan-limit enforcement on two fronts:
--
-- A) Replace bio-based participant detection with authoritative_role().
--    The legacy helpers in 20260517120000_plan_limits_usage_tables.sql
--    determine the user's tier via `bio LIKE '__type:agent%'`. The bio is
--    user-editable, so a buyer could set `bio = '__type:agent ...'` and
--    return 999 (unlimited) from `get_saved_search_limit`, bypassing the
--    1-saved-search free-tier cap. We re-derive from the canonical
--    profiles.role via `authoritative_role()` (migration 20260623130000).
--
-- B) Enforce monthly usage caps server-side for valuations / reports /
--    priority ads. The usage_* tables today accept any INSERT — the
--    edge functions are *supposed* to gate, but if any caller (today or
--    a future one) inserts directly, monthly quotas are not enforced.
--    BEFORE INSERT triggers close that gap.
--
-- Limits below mirror src/hooks/usePlanLimits.ts. Keep the two in sync.
-- =============================================================================

-- ── A. Re-derive get_*_limit() helpers from authoritative_role() ─────────────

-- Saved searches: buyer 1 free / 999 pro; other roles unlimited.
CREATE OR REPLACE FUNCTION public.get_saved_search_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role         public.user_role;
  v_product_id   TEXT;
  v_is_pro       BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 1 END;
  END IF;
  -- All other roles (incl. NULL = unconfigured): no cap.
  RETURN 999;
END;
$$;

-- Search alerts (saved_searches with email_alerts=true): buyer 1 / 5 pro.
CREATE OR REPLACE FUNCTION public.get_search_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

-- Auction alerts: buyer 1 / 5 pro.
CREATE OR REPLACE FUNCTION public.get_auction_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

-- Viewings: buyer (requester) 1 / 10 pro; agent (owner) 3 / 10 pro.
CREATE OR REPLACE FUNCTION public.get_viewing_limit(
  p_user_id UUID,
  p_is_requester BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF p_is_requester AND v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 10 ELSE 1 END;
  END IF;

  IF NOT p_is_requester AND v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 10 ELSE 3 END;
  END IF;

  RETURN 999;
END;
$$;


-- ── B. Monthly usage caps + BEFORE INSERT triggers ───────────────────────────
-- One generic helper, three thin triggers. The helper takes a participant
-- bracket so we don't repeat the role lookup in three near-identical fns.

-- valuations/month: buyer 0 free / 5 pro; seller 0/5; agent unlimited; pro pros unlimited.
CREATE OR REPLACE FUNCTION public.get_valuation_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN v_is_pro THEN 5 ELSE 0 END;
  END IF;
  IF v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;
  IF v_role = 'professional'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;
  IF v_role IN (
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role,
    'admin'::public.user_role
  ) THEN
    RETURN 999;
  END IF;
  RETURN 0;
END;
$$;

-- reports/month: buyer 0/3; seller 0/3; agent unlimited.
CREATE OR REPLACE FUNCTION public.get_report_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN v_is_pro THEN 3 ELSE 0 END;
  END IF;
  IF v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;
  IF v_role IN (
    'developer'::public.user_role,
    'professional'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role,
    'admin'::public.user_role
  ) THEN
    RETURN 999;
  END IF;
  RETURN 0;
END;
$$;

-- priority ads/month: seller 0/1; agent 0/10.
CREATE OR REPLACE FUNCTION public.get_priority_ad_monthly_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role        public.user_role;
  v_product_id  TEXT;
  v_is_pro      BOOLEAN;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  SELECT subscription_product_id INTO v_product_id
    FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
  v_is_pro := (v_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.pro_product_ids WHERE product_id = v_product_id
  ));

  IF v_role = 'seller'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 1 ELSE 0 END;
  END IF;
  IF v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN v_is_pro THEN 10 ELSE 0 END;
  END IF;
  IF v_role IN (
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role,
    'admin'::public.user_role
  ) THEN
    RETURN 999;
  END IF;
  RETURN 0;
END;
$$;


-- BEFORE INSERT triggers on usage tables. Each rejects when this calendar
-- month's count for the user is already at or above the cap.

CREATE OR REPLACE FUNCTION public.check_valuation_monthly_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  v_limit := public.get_valuation_monthly_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'valuation_not_allowed' USING HINT = 'Your plan does not include AI valuations';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.usage_ai_valuations
    WHERE user_id = NEW.user_id
      AND date_trunc('month', created_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'valuation_monthly_limit_reached'
      USING HINT = 'Upgrade to Pro for more valuations';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_valuation_monthly_limit ON public.usage_ai_valuations;
CREATE TRIGGER trg_check_valuation_monthly_limit
  BEFORE INSERT ON public.usage_ai_valuations
  FOR EACH ROW EXECUTE FUNCTION public.check_valuation_monthly_limit();


CREATE OR REPLACE FUNCTION public.check_report_monthly_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  v_limit := public.get_report_monthly_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'report_not_allowed' USING HINT = 'Your plan does not include property reports';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.usage_property_reports
    WHERE user_id = NEW.user_id
      AND date_trunc('month', created_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'report_monthly_limit_reached'
      USING HINT = 'Upgrade to Pro for more reports';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_report_monthly_limit ON public.usage_property_reports;
CREATE TRIGGER trg_check_report_monthly_limit
  BEFORE INSERT ON public.usage_property_reports
  FOR EACH ROW EXECUTE FUNCTION public.check_report_monthly_limit();


CREATE OR REPLACE FUNCTION public.check_priority_ad_monthly_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_limit INT;
  v_count INT;
BEGIN
  v_limit := public.get_priority_ad_monthly_limit(NEW.user_id);
  IF v_limit >= 999 THEN RETURN NEW; END IF;
  IF v_limit = 0 THEN
    RAISE EXCEPTION 'priority_ad_not_allowed' USING HINT = 'Your plan does not include priority ads';
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.usage_priority_ads
    WHERE user_id = NEW.user_id
      AND date_trunc('month', created_at AT TIME ZONE 'UTC')
        = date_trunc('month', now() AT TIME ZONE 'UTC');

  IF v_count >= v_limit THEN
    RAISE EXCEPTION 'priority_ad_monthly_limit_reached'
      USING HINT = 'Upgrade to Pro for more priority ads';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_priority_ad_monthly_limit ON public.usage_priority_ads;
CREATE TRIGGER trg_check_priority_ad_monthly_limit
  BEFORE INSERT ON public.usage_priority_ads
  FOR EACH ROW EXECUTE FUNCTION public.check_priority_ad_monthly_limit();


-- Grants — the helpers are SECURITY DEFINER, but EXECUTE still needs to
-- be granted to client roles for them to be callable from the app.
GRANT EXECUTE ON FUNCTION public.get_saved_search_limit(UUID)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_search_alert_limit(UUID)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auction_alert_limit(UUID)       TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_viewing_limit(UUID, BOOLEAN)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_valuation_monthly_limit(UUID)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_report_monthly_limit(UUID)      TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(UUID) TO authenticated, service_role;
