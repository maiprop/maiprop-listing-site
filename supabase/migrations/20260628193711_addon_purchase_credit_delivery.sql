-- Deliver paid AI/report add-ons as durable, consumable credits.
--
-- Stripe remains the payment source of truth. The webhook writes
-- addon_purchases; these helpers turn the paid ledger into operational
-- capacity for AI buckets and property-report generation.

CREATE TABLE IF NOT EXISTS public.addon_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  addon_key text NOT NULL,
  module text NOT NULL,
  audience text NOT NULL,
  unit text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  checkout_mode text NOT NULL CHECK (checkout_mode IN ('payment', 'subscription')),
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'active', 'cancelled', 'refunded')),
  stripe_session_id text NOT NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stripe_session_id)
);

ALTER TABLE public.addon_purchases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.addon_purchases FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.addon_purchases FROM authenticated;
GRANT SELECT ON public.addon_purchases TO authenticated;

DROP POLICY IF EXISTS "addon_purchases_select" ON public.addon_purchases;
CREATE POLICY "addon_purchases_select"
  ON public.addon_purchases
  FOR SELECT
  TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR public.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "addon_purchases_no_browser_insert" ON public.addon_purchases;
CREATE POLICY "addon_purchases_no_browser_insert"
  ON public.addon_purchases
  FOR INSERT
  TO authenticated
  WITH CHECK (false);

ALTER TABLE public.addon_purchases
  ADD COLUMN IF NOT EXISTS credits_granted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_consumed integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'addon_purchases_credits_granted_nonnegative'
      AND conrelid = 'public.addon_purchases'::regclass
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_credits_granted_nonnegative
      CHECK (credits_granted >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'addon_purchases_credits_consumed_nonnegative'
      AND conrelid = 'public.addon_purchases'::regclass
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_credits_consumed_nonnegative
      CHECK (credits_consumed >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'addon_purchases_credits_consumed_lte_granted'
      AND conrelid = 'public.addon_purchases'::regclass
  ) THEN
    ALTER TABLE public.addon_purchases
      ADD CONSTRAINT addon_purchases_credits_consumed_lte_granted
      CHECK (credits_consumed <= credits_granted);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.addon_credit_bucket(p_addon_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_addon_key
    WHEN 'valuation_single' THEN 'property-valuation'
    WHEN 'valuation_bundle' THEN 'property-valuation'
    WHEN 'neighbourhood_report_single' THEN 'neighbourhood-report'
    WHEN 'neighbourhood_report_bundle' THEN 'neighbourhood-report'
    WHEN 'property_report_single' THEN 'property-report'
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.addon_credit_units(
  p_addon_key text,
  p_quantity integer DEFAULT 1
)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT GREATEST(COALESCE(p_quantity, 1), 1) * CASE p_addon_key
    WHEN 'valuation_single' THEN 1
    WHEN 'valuation_bundle' THEN 5
    WHEN 'neighbourhood_report_single' THEN 1
    WHEN 'neighbourhood_report_bundle' THEN 3
    WHEN 'property_report_single' THEN 1
    ELSE 0
  END
$$;

CREATE OR REPLACE FUNCTION public.set_addon_purchase_credits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT'
     OR NEW.addon_key IS DISTINCT FROM OLD.addon_key
     OR NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    NEW.credits_granted := public.addon_credit_units(NEW.addon_key, NEW.quantity);
    IF NEW.credits_consumed > NEW.credits_granted THEN
      NEW.credits_consumed := NEW.credits_granted;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_addon_purchase_credits ON public.addon_purchases;
CREATE TRIGGER trg_set_addon_purchase_credits
  BEFORE INSERT OR UPDATE OF addon_key, quantity
  ON public.addon_purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.set_addon_purchase_credits();

UPDATE public.addon_purchases
SET credits_granted = public.addon_credit_units(addon_key, quantity),
    credits_consumed = LEAST(
      credits_consumed,
      public.addon_credit_units(addon_key, quantity)
    )
WHERE credits_granted <> public.addon_credit_units(addon_key, quantity)
   OR credits_consumed > public.addon_credit_units(addon_key, quantity);

CREATE INDEX IF NOT EXISTS idx_addon_purchases_credit_lookup
  ON public.addon_purchases (user_id, status, addon_key, created_at)
  WHERE credits_granted > credits_consumed;

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
  SELECT COALESCE(SUM(credits_granted - credits_consumed), 0)::integer
  FROM public.addon_purchases
  WHERE user_id = p_user_id
    AND status IN ('paid', 'active')
    AND credits_granted > credits_consumed
    AND public.addon_credit_bucket(addon_key) = p_bucket
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
BEGIN
  SELECT id
  INTO v_purchase_id
  FROM public.addon_purchases
  WHERE user_id = p_user_id
    AND status IN ('paid', 'active')
    AND credits_granted > credits_consumed
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
    AND credits_granted > credits_consumed;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_call_monthly_base_limit(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free integer;
  v_pro integer;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999999;
  END IF;

  SELECT free_monthly, pro_monthly
  INTO v_free, v_pro
  FROM public.ai_usage_limits
  WHERE bucket = p_bucket
  LIMIT 1;

  IF v_free IS NULL THEN
    RETURN 0;
  END IF;

  RETURN CASE WHEN public.is_pro(p_user_id) THEN v_pro ELSE v_free END;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_ai_call_monthly_limit(
  p_user_id uuid,
  p_bucket text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base integer;
  v_available integer;
  v_count integer;
  v_month_start timestamptz;
BEGIN
  v_base := public.get_ai_call_monthly_base_limit(p_user_id, p_bucket);
  IF v_base >= 999999 THEN
    RETURN v_base;
  END IF;

  v_available := public.get_available_addon_credits(p_user_id, p_bucket);
  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = p_user_id
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  RETURN v_base + v_available + GREATEST(v_count - v_base, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ai_quota_for_user(
  _user_id uuid,
  p_bucket text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer;
  v_count integer;
  v_month_start timestamptz;
BEGIN
  IF _user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  v_limit := public.get_ai_call_monthly_limit(_user_id, p_bucket);
  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = _user_id
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  RETURN jsonb_build_object(
    'allowed', (v_count < v_limit),
    'reason', CASE
      WHEN v_count >= v_limit AND v_limit = 0 THEN 'plan_does_not_include_feature'
      WHEN v_count >= v_limit THEN 'monthly_limit_reached'
      ELSE NULL
    END,
    'used', v_count,
    'limit', v_limit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user(
  _user_id uuid,
  p_bucket text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := _user_id;
  v_base_limit integer;
  v_available_credits integer;
  v_effective_limit integer;
  v_count integer;
  v_month_start timestamptz;
  v_reservation_id uuid;
  v_consumed_credit boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  IF p_bucket IS NULL OR length(trim(p_bucket)) = 0 OR length(p_bucket) > 120 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'invalid_bucket',
      'used', 0,
      'limit', 0
    );
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_uid::text || ':' || p_bucket || ':' || v_month_start::date::text, 0)
  );

  v_base_limit := public.get_ai_call_monthly_base_limit(v_uid, p_bucket);
  v_available_credits := public.get_available_addon_credits(v_uid, p_bucket);
  v_effective_limit := v_base_limit + v_available_credits;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = v_uid
    AND bucket = p_bucket
    AND created_at >= v_month_start;

  IF v_effective_limit <= 0 THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'plan_does_not_include_feature',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  IF v_count >= v_effective_limit THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_limit_reached',
      'used', v_count,
      'limit', v_effective_limit
    );
  END IF;

  IF v_base_limit < 999999 AND v_count >= v_base_limit THEN
    v_consumed_credit := public.consume_addon_credit_for_user(v_uid, p_bucket);
    IF NOT v_consumed_credit THEN
      RETURN jsonb_build_object(
        'allowed', false,
        'reason', 'monthly_limit_reached',
        'used', v_count,
        'limit', v_base_limit
      );
    END IF;
  END IF;

  INSERT INTO public.usage_ai_calls (user_id, bucket)
  VALUES (v_uid, p_bucket)
  RETURNING id INTO v_reservation_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', NULL,
    'used', v_count + 1,
    'limit', v_effective_limit,
    'reservation_id', v_reservation_id,
    'addon_credit_consumed', v_consumed_credit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.check_ai_quota(p_bucket text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'not_authenticated',
      'used', 0,
      'limit', 0
    );
  END IF;

  RETURN public.check_ai_quota_for_user(v_uid, p_bucket);
END;
$$;

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(p_bucket text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  RETURN public.reserve_ai_quota_for_user(v_uid, p_bucket);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_ai_call(p_bucket text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.reserve_ai_quota(p_bucket);
  IF COALESCE((v_result->>'allowed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'ai_call_monthly_limit_reached'
      USING HINT = 'Bucket=' || COALESCE(p_bucket, '');
  END IF;

  RETURN jsonb_build_object(
    'recorded', true,
    'used', v_result->'used',
    'limit', v_result->'limit',
    'addon_credit_consumed', v_result->'addon_credit_consumed'
  );
END;
$$;

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
  v_effective_limit := v_base_limit + v_available_credits;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_ai_calls
  WHERE user_id = NEW.user_id
    AND bucket = NEW.bucket
    AND created_at >= v_month_start;

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

CREATE OR REPLACE FUNCTION public.get_report_monthly_base_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role public.user_role;
  v_is_pro boolean;
BEGIN
  IF public.has_platform_admin(p_user_id) THEN
    RETURN 999;
  END IF;

  v_role := public.authoritative_role(p_user_id);
  v_is_pro := public.is_pro(p_user_id);

  IF v_role IN ('buyer'::public.user_role, 'seller'::public.user_role) THEN
    RETURN CASE WHEN v_is_pro THEN 3 ELSE 0 END;
  END IF;

  IF v_role IN (
    'agent'::public.user_role,
    'professional'::public.user_role,
    'developer'::public.user_role,
    'investor'::public.user_role,
    'institutional'::public.user_role
  ) THEN
    RETURN CASE WHEN v_is_pro THEN 999 ELSE 0 END;
  END IF;

  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_report_monthly_limit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_base integer;
  v_available integer;
  v_count integer;
  v_month_start timestamptz;
BEGIN
  v_base := public.get_report_monthly_base_limit(p_user_id);
  IF v_base >= 999 THEN
    RETURN v_base;
  END IF;

  v_available := public.get_available_addon_credits(p_user_id, 'property-report');
  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_property_reports
  WHERE user_id = p_user_id
    AND created_at >= v_month_start;

  RETURN v_base + v_available + GREATEST(v_count - v_base, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_report_monthly_limit()
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
  v_base_limit := public.get_report_monthly_base_limit(NEW.user_id);
  IF v_base_limit >= 999 THEN
    RETURN NEW;
  END IF;

  v_month_start := date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.user_id::text || ':property-report:' || v_month_start::date::text, 0)
  );

  v_available_credits := public.get_available_addon_credits(NEW.user_id, 'property-report');
  v_effective_limit := v_base_limit + v_available_credits;

  SELECT COUNT(*)::integer
  INTO v_count
  FROM public.usage_property_reports
  WHERE user_id = NEW.user_id
    AND created_at >= v_month_start;

  IF v_effective_limit <= 0 THEN
    RAISE EXCEPTION 'report_not_allowed'
      USING HINT = 'Your plan does not include property reports';
  END IF;

  IF v_count >= v_effective_limit THEN
    RAISE EXCEPTION 'report_monthly_limit_reached'
      USING HINT = 'Upgrade to Pro or buy an extra report';
  END IF;

  IF v_count >= v_base_limit THEN
    v_consumed_credit := public.consume_addon_credit_for_user(NEW.user_id, 'property-report');
    IF NOT v_consumed_credit THEN
      RAISE EXCEPTION 'report_monthly_limit_reached'
        USING HINT = 'Upgrade to Pro or buy an extra report';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.addon_credit_bucket(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.addon_credit_units(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_addon_credits(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.consume_addon_credit_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_ai_call_monthly_base_limit(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_report_monthly_base_limit(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.addon_credit_bucket(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.addon_credit_units(text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_available_addon_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_addon_credit_for_user(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ai_call_monthly_base_limit(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_report_monthly_base_limit(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.check_ai_quota_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reserve_ai_quota_for_user(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_ai_quota_for_user(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota_for_user(uuid, text) TO service_role;

COMMENT ON COLUMN public.addon_purchases.credits_granted IS
  'Operational units granted by this paid add-on checkout session.';
COMMENT ON COLUMN public.addon_purchases.credits_consumed IS
  'Operational units already consumed by AI/report quota enforcement.';
COMMENT ON FUNCTION public.consume_addon_credit_for_user(uuid, text) IS
  'Consumes one paid add-on credit for a verified user and quota bucket. Service role only.';
