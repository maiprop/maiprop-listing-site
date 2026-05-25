-- Audience-scoped Pro entitlement checks.
--
-- Earlier hardening made checkout and Edge Function entitlement resolution
-- audience-aware, but some SQL quota paths still treated any row in
-- public.pro_product_ids as a generic Pro flag. That can over-grant paid
-- limits after a role switch or stale product assignment. This migration makes
-- SQL use the same audience/product relationship as the Edge layer:
-- profiles.role/participant_type -> pricing audience -> active Pro
-- subscription pricing_configs -> metadata.stripe_product_id.

CREATE OR REPLACE FUNCTION public.profile_pricing_audience(
  p_role public.user_role,
  p_participant_type text DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE COALESCE(NULLIF(p_participant_type, ''), p_role::text)
    WHEN 'buyer' THEN 'participant'
    WHEN 'seller' THEN 'participant'
    WHEN 'agent' THEN 'agent'
    WHEN 'developer' THEN 'developer'
    WHEN 'professional' THEN 'professional'
    WHEN 'investor' THEN 'investor'
    WHEN 'institutional' THEN 'institutional'
    WHEN 'admin' THEN 'agent'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.has_audience_scoped_pro_entitlement(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.pricing_configs pc
      ON pc.is_active = true
     AND pc.audience = public.profile_pricing_audience(p.role, p.participant_type::text)
     AND pc.key = ANY (ARRAY['pro', 'agent_basic', 'developer_pro', 'professional_basic'])
     AND pc.module = ANY (ARRAY['user_subscription', 'agent_subscription', 'developer_subscription', 'professional_subscription'])
     AND pc.metadata->>'stripe_product_id' = p.subscription_product_id
    WHERE p.user_id = p_user_id
      AND p.subscription_product_id IS NOT NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.has_platform_admin(p_user_id)
    OR COALESCE(
      (
        SELECT p.force_pro_access
        FROM public.profiles p
        WHERE p.user_id = p_user_id
        LIMIT 1
      ),
      FALSE
    )
    OR public.has_audience_scoped_pro_entitlement(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.investor_subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trial')
    )
$$;

CREATE OR REPLACE FUNCTION public.check_listing_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_is_pro BOOLEAN;
  v_limit INT;
  v_count INT;
BEGIN
  SELECT
    COALESCE(p.role, 'buyer'),
    public.has_audience_scoped_pro_entitlement(p.user_id)
      OR COALESCE(p.force_pro_access, FALSE)
      OR public.has_platform_admin(p.user_id)
  INTO v_role, v_is_pro
  FROM public.profiles p
  WHERE p.user_id = (SELECT auth.uid());

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_limit := public.get_listing_limit(v_role, v_is_pro);

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  SELECT COUNT(*)
  INTO v_count
  FROM public.listings
  WHERE owner_id = (SELECT auth.uid());

  RETURN v_count < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_listing_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_limit INTEGER;
BEGIN
  v_role := public.authoritative_role(p_user_id)::text;
  v_limit := public.get_listing_limit(v_role, public.is_pro(p_user_id));
  RETURN COALESCE(v_limit, 999);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_saved_search_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 999 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_search_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_auction_alert_limit(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 5 ELSE 1 END;
  END IF;
  RETURN 999;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_viewing_limit(
  p_user_id UUID,
  p_is_requester BOOLEAN
)
RETURNS INTEGER
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  v_role := public.authoritative_role(p_user_id);

  IF p_is_requester AND v_role = 'buyer'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 1 END;
  END IF;

  IF NOT p_is_requester AND v_role = 'agent'::public.user_role THEN
    RETURN CASE WHEN public.is_pro(p_user_id) THEN 10 ELSE 3 END;
  END IF;

  RETURN 999;
END;
$$;

CREATE OR REPLACE FUNCTION private.check_listing_quota()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.check_listing_quota();
END;
$$;

REVOKE ALL ON FUNCTION public.profile_pricing_audience(public.user_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.profile_pricing_audience(public.user_role, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.get_listing_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_listing_limit(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_saved_search_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_saved_search_limit(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_search_alert_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_search_alert_limit(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_auction_alert_limit(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_auction_alert_limit(UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_viewing_limit(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_viewing_limit(UUID, BOOLEAN) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.check_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_listing_quota() TO authenticated;
REVOKE ALL ON FUNCTION private.check_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated;

COMMENT ON FUNCTION public.profile_pricing_audience(public.user_role, text) IS
  'Normalizes profile role/participant_type to pricing_configs.audience.';
COMMENT ON FUNCTION public.has_audience_scoped_pro_entitlement(uuid) IS
  'True only when profiles.subscription_product_id matches an active Pro subscription pricing_configs product for the profile pricing audience.';
COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical Pro-status reader. Returns true for platform admins, audience-scoped Pro products, or active/trial investor subscriptions.';

DO $$
BEGIN
  IF public.profile_pricing_audience('buyer'::public.user_role, NULL) <> 'participant' THEN
    RAISE EXCEPTION 'buyer must map to participant pricing audience';
  END IF;
  IF public.profile_pricing_audience('developer'::public.user_role, NULL) <> 'developer' THEN
    RAISE EXCEPTION 'developer must map to developer pricing audience';
  END IF;
  IF has_function_privilege('authenticated', 'public.has_audience_scoped_pro_entitlement(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute has_audience_scoped_pro_entitlement directly';
  END IF;
END $$;
