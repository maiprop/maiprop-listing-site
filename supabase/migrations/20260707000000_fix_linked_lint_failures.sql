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
  EXECUTE
    'SELECT
       COALESCE(p.role, ''buyer''),
       (
         p.subscription_product_id IS NOT NULL
         AND EXISTS (
           SELECT 1
           FROM public.pro_product_ids pp
           WHERE pp.product_id = p.subscription_product_id
         )
       )
       OR COALESCE(p.force_pro_access, FALSE)
     FROM public.profiles p
     WHERE p.user_id = $1'
  INTO v_role, v_is_pro
  USING (SELECT auth.uid());

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  v_limit := public.get_listing_limit(v_role, v_is_pro);

  IF v_limit IS NULL THEN
    RETURN TRUE;
  END IF;

  EXECUTE
    'SELECT COUNT(*)
     FROM public.listings
     WHERE owner_id = $1'
  INTO v_count
  USING (SELECT auth.uid());

  RETURN v_count < v_limit;
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

  EXECUTE
    'SELECT role::TEXT
     FROM public.profiles
     WHERE user_id = $1
     LIMIT 1'
  INTO v_role
  USING v_user;

  IF v_role IS DISTINCT FROM 'agent' AND NOT public.has_platform_admin(v_user) THEN
    RAISE EXCEPTION 'Only agents can submit data inputs' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.agent_data_input_bans WHERE user_id = v_user) THEN
    RAISE EXCEPTION 'Data input submissions are permanently disabled for this account'
      USING ERRCODE = '42501';
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user::TEXT || ':' || v_month_start::DATE::TEXT, 0));

  EXECUTE
    'SELECT COUNT(*)
     FROM public.agent_data_inputs
     WHERE user_id = $1
       AND created_at >= $2'
  INTO v_used
  USING v_user, v_month_start;

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

  EXECUTE
    'INSERT INTO public.agent_data_inputs (
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
       $1, $2, $3, $4, $5, COALESCE($6, ''other''), $7, ''seller'', $8, $9, $10, $11, $12
     )
     RETURNING id'
  INTO v_id
  USING
    v_user,
    p_property_address,
    p_property_city,
    p_property_postal_code,
    p_kaek,
    p_property_type,
    v_transaction_type,
    p_closing_price,
    p_closed_at,
    p_buyer_name,
    p_seller_name,
    p_notes;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_agent_data_input(
  DATE, TEXT, TEXT, TEXT, NUMERIC, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bulk_update_project_unit_prices(
  p_project_id UUID,
  p_percentage NUMERIC
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_updated INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF p_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id is required' USING ERRCODE = '22023';
  END IF;

  IF p_percentage IS NULL OR p_percentage::TEXT = 'NaN' OR p_percentage = 0 THEN
    RAISE EXCEPTION 'percentage must be a finite non-zero value' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.owner_id = v_user
  ) THEN
    RAISE EXCEPTION 'Project not found' USING ERRCODE = '42501';
  END IF;

  UPDATE public.project_units pu
  SET
    price = ROUND(pu.price * (1 + p_percentage / 100)),
    price_per_sqm = CASE
      WHEN pu.internal_sqm IS NULL OR pu.internal_sqm = 0 THEN NULL
      ELSE ROUND(pu.price * (1 + p_percentage / 100)) / pu.internal_sqm
    END,
    updated_at = now()
  WHERE pu.project_id = p_project_id
    AND pu.availability_status = 'available'
    AND pu.price IS NOT NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_project_unit_prices(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_update_project_unit_prices(UUID, NUMERIC) TO authenticated;
