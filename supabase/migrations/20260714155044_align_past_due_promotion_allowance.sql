-- Existing paid-period allocations remain active during payment recovery, but
-- a past-due subscription cannot advertise or activate a fresh monthly credit.

CREATE OR REPLACE FUNCTION private.get_listing_promotion_plan_allowance(
  p_user_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_role public.user_role;
  v_has_paid_plan boolean := false;
BEGIN
  IF p_promotion_type NOT IN ('spotlight', 'priority') THEN
    RETURN 0;
  END IF;

  IF private.authoritative_role(p_user_id) = 'admin'::public.user_role THEN
    RETURN 999;
  END IF;

  v_role := private.authoritative_role(p_user_id);

  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions AS subscription
    JOIN public.profiles AS profile
      ON profile.user_id = subscription.user_id
    WHERE subscription.user_id = p_user_id
      AND subscription.status = 'active'
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND subscription.current_period_end IS NOT NULL
      AND subscription.current_period_end > now()
      AND subscription.audience = public.profile_pricing_audience(
        profile.role,
        profile.participant_type::text
      )
      AND (
        (v_role::text = 'seller' AND subscription.plan_key = 'pro')
        OR (
          v_role::text = 'agent'
          AND subscription.plan_key = 'agent_basic'
        )
        OR (
          v_role::text = 'developer'
          AND subscription.plan_key = 'developer_pro'
        )
      )
      AND profile.subscription_product_id IS NOT NULL
      AND subscription.stripe_product_id = profile.subscription_product_id
  ) INTO v_has_paid_plan;

  IF NOT v_has_paid_plan THEN
    RETURN 0;
  END IF;

  IF p_promotion_type = 'spotlight' THEN
    RETURN CASE v_role::text
      WHEN 'seller' THEN 1
      WHEN 'developer' THEN 1
      ELSE 0
    END;
  END IF;

  RETURN CASE v_role::text
    WHEN 'agent' THEN 10
    WHEN 'developer' THEN 1
    ELSE 0
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text)
  TO service_role;
