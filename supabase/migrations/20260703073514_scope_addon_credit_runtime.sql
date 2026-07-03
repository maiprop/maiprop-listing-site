-- Scope database-side add-on credit accounting to the active Stripe runtime.
-- Production defaults to live so old test-mode checkout fixtures cannot be
-- consumed by live users. Sandbox projects can override with:
--   ALTER DATABASE postgres SET app.billing_runtime_mode = 'test';

CREATE OR REPLACE FUNCTION public.current_billing_runtime_mode()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE lower(NULLIF(current_setting('app.billing_runtime_mode', true), ''))
    WHEN 'test' THEN 'test'
    WHEN 'live' THEN 'live'
    ELSE 'live'
  END
$$;

CREATE OR REPLACE FUNCTION public.get_addon_credit_balance(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(credits_granted - credits_consumed - credits_refunded), 0)::integer
  FROM public.addon_purchases
  WHERE user_id = p_user_id
    AND status IN ('paid', 'active', 'refunded')
    AND runtime_mode = public.current_billing_runtime_mode()
    AND public.addon_credit_bucket(addon_key) = p_bucket
$$;

CREATE OR REPLACE FUNCTION public.get_available_addon_credits(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(public.get_addon_credit_balance(p_user_id, p_bucket), 0)
$$;

CREATE OR REPLACE FUNCTION public.consume_addon_credit_for_user(
  p_user_id uuid,
  p_bucket text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_purchase_id uuid;
  v_balance integer;
BEGIN
  v_balance := public.get_addon_credit_balance(p_user_id, p_bucket);
  IF v_balance <= 0 THEN
    RETURN false;
  END IF;

  SELECT id
  INTO v_purchase_id
  FROM public.addon_purchases
  WHERE user_id = p_user_id
    AND status IN ('paid', 'active')
    AND runtime_mode = public.current_billing_runtime_mode()
    AND credits_granted - credits_consumed - credits_refunded > 0
    AND public.addon_credit_bucket(addon_key) = p_bucket
  ORDER BY created_at ASC, id ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_purchase_id IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.addon_purchases
  SET credits_consumed = credits_consumed + 1
  WHERE id = v_purchase_id
    AND credits_granted - credits_consumed - credits_refunded > 0;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.current_billing_runtime_mode() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_addon_credit_balance(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_available_addon_credits(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_addon_credit_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_billing_runtime_mode() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_addon_credit_balance(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_addon_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_addon_credit_for_user(uuid, text) TO service_role;

COMMENT ON FUNCTION public.current_billing_runtime_mode() IS
  'Returns the active Stripe billing runtime for database-side credit accounting. Production defaults to live; sandbox projects should set app.billing_runtime_mode=test.';
COMMENT ON FUNCTION public.get_addon_credit_balance(uuid, text) IS
  'Returns signed add-on balance for the active billing runtime after consumption and refunds; negative values represent refunded consumed credits owed by the user.';
