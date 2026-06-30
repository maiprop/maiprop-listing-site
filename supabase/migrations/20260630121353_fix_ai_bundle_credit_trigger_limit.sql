-- Match the usage_ai_calls trigger to the credit-aware reservation/status
-- limit calculation so bundled add-on credits can be fully consumed.

CREATE OR REPLACE FUNCTION public.check_ai_call_monthly_limit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base_limit integer;
  v_available_credits integer;
  v_effective_limit integer;
  v_count integer;
  v_month_start timestamptz;
  v_consumed_credit boolean := false;
BEGIN
  v_base_limit := public.get_ai_call_monthly_base_limit(NEW.user_id, NEW.bucket);
  IF v_base_limit >= 999999 THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':' || NEW.bucket || ':' || v_month_start::date::text, 0)
  );

  v_available_credits := public.get_available_addon_credits(NEW.user_id, NEW.bucket);

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = NEW.user_id
    AND bucket = NEW.bucket
    AND created_at >= v_month_start;

  v_effective_limit := v_base_limit + v_available_credits + GREATEST(v_count - v_base_limit, 0);

  IF v_count >= v_effective_limit THEN
    RAISE EXCEPTION 'ai_call_monthly_limit_reached'
      USING HINT = 'Bucket=' || NEW.bucket || ' user=' || NEW.user_id;
  END IF;

  IF v_count >= v_base_limit THEN
    v_consumed_credit := public.consume_addon_credit_for_user(NEW.user_id, NEW.bucket);
    IF NOT v_consumed_credit THEN
      RAISE EXCEPTION 'ai_call_monthly_limit_reached'
        USING HINT = 'Bucket=' || NEW.bucket || ' user=' || NEW.user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.check_ai_call_monthly_limit_trigger()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_call_monthly_limit_trigger()
  TO service_role;

COMMENT ON FUNCTION public.check_ai_call_monthly_limit_trigger() IS
  'Enforces AI monthly usage using base quota, remaining add-on credits, and already-consumed overage so bundles can be fully consumed.';
