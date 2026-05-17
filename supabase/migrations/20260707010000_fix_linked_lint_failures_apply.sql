-- Fix linked Supabase lint failures found during deployment-readiness audit.
--
-- 1. listing_status has no "deleted" enum value. Listings are physically
--    deleted in the app, so quota checks should count existing rows.
-- 2. submit_agent_data_input had drifted to the newer dashboard-facing names
--    while the deployed table/Edge Function schema still uses closing_date,
--    city, postal_code, sale_price, and rental.

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
    (
      p.subscription_product_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.pro_product_ids pp
        WHERE pp.product_id = p.subscription_product_id
      )
    )
    OR COALESCE(p.force_pro_access, FALSE)
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
CREATE OR REPLACE FUNCTION private.check_listing_quota()
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
    (
      p.subscription_product_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.pro_product_ids pp
        WHERE pp.product_id = p.subscription_product_id
      )
    )
    OR COALESCE(p.force_pro_access, FALSE)
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
REVOKE ALL ON FUNCTION public.check_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_listing_quota() TO authenticated;
REVOKE ALL ON FUNCTION private.check_listing_quota() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated;
CREATE OR REPLACE FUNCTION public.submit_agent_data_input(
  p_closed_at DATE,
  p_property_address TEXT,
  p_property_city TEXT,
  p_transaction_type TEXT,
  p_closing_price NUMERIC,
  p_property_postal_code TEXT DEFAULT NULL,
  p_property_type TEXT DEFAULT NULL,
  p_kaek TEXT DEFAULT NULL,
  p_buyer_name TEXT DEFAULT NULL,
  p_seller_name TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_role TEXT;
  v_used INTEGER;
  v_id UUID;
  v_transaction_type TEXT;
  v_month_start TIMESTAMPTZ;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT role::TEXT INTO v_role
  FROM public.profiles
  WHERE user_id = v_user
  LIMIT 1;

  IF v_role IS DISTINCT FROM 'agent' AND NOT public.has_platform_admin(v_user) THEN
    RAISE EXCEPTION 'Only agents can submit data inputs' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agent_data_input_bans WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Data input submissions are permanently disabled for this account'
      USING ERRCODE = '42501';
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_user::TEXT || ':' || ((v_month_start AT TIME ZONE 'UTC')::DATE)::TEXT, 0)
  );

  SELECT COUNT(*)
  INTO v_used
  FROM public.agent_data_inputs
  WHERE user_id = v_user
    AND created_at >= v_month_start;

  IF v_used >= 20 THEN
    RAISE EXCEPTION 'Monthly data input limit (20) reached'
      USING ERRCODE = '23514';
  END IF;

  IF p_transaction_type NOT IN ('sale', 'rent', 'rental') THEN
    RAISE EXCEPTION 'transaction_type must be sale or rent' USING ERRCODE = '22023';
  END IF;
  IF p_closing_price IS NULL OR p_closing_price < 0 THEN
    RAISE EXCEPTION 'closing_price must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_closed_at IS NULL OR p_closed_at > CURRENT_DATE THEN
    RAISE EXCEPTION 'closed_at must be a past or present date' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_property_address, '')) = 0 THEN
    RAISE EXCEPTION 'property_address is required' USING ERRCODE = '22023';
  END IF;
  IF length(coalesce(p_property_city, '')) = 0 THEN
    RAISE EXCEPTION 'property_city is required' USING ERRCODE = '22023';
  END IF;

  v_transaction_type := CASE
    WHEN p_transaction_type = 'rent' THEN 'rental'
    ELSE p_transaction_type
  END;

  INSERT INTO public.agent_data_inputs (
    user_id,
    property_address,
    city,
    postal_code,
    kaek,
    property_type,
    transaction_type,
    agent_side,
    sale_price,
    closing_date,
    buyer_name,
    seller_name,
    notes
  ) VALUES (
    v_user,
    p_property_address,
    p_property_city,
    p_property_postal_code,
    p_kaek,
    COALESCE(p_property_type, 'other'),
    v_transaction_type,
    'seller',
    p_closing_price,
    p_closed_at,
    p_buyer_name,
    p_seller_name,
    p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;
