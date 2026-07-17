BEGIN;

-- This catalog entry was never backed by a fulfillment path. Keeping it
-- purchasable would accept payment without granting a usable entitlement.
UPDATE public.pricing_configs
SET
  is_active = false,
  metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'retired_reason', 'no_fulfillment_contract',
    'retired_at', '2026-07-17'
  ),
  updated_at = statement_timestamp()
WHERE key = 'extra_priority_ad'
  AND (
    is_active = true
    OR metadata->>'retired_reason' IS DISTINCT FROM 'no_fulfillment_contract'
  );

-- Promotion allowances are paid inventory. Require the active subscription to
-- match the active pricing product for the caller's current audience and role.
CREATE OR REPLACE FUNCTION private.has_active_listing_promotion_plan(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions AS subscription
    JOIN public.profiles AS profile
      ON profile.user_id = subscription.user_id
    JOIN public.pricing_configs AS pricing
      ON pricing.is_active = true
     AND pricing.key = subscription.plan_key
     AND pricing.audience = public.profile_pricing_audience(
       profile.role,
       profile.participant_type::text
     )
     AND pricing.module IN (
       'user_subscription',
       'agent_subscription',
       'developer_subscription'
     )
     AND pricing.metadata->>'stripe_product_id' = subscription.stripe_product_id
    WHERE subscription.user_id = p_user_id
      AND subscription.status = 'active'
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND subscription.livemode = (public.current_billing_runtime_mode() = 'live')
      AND subscription.current_period_end IS NOT NULL
      AND subscription.current_period_end > statement_timestamp()
      AND subscription.audience = public.profile_pricing_audience(
        profile.role,
        profile.participant_type::text
      )
      AND (
        (private.authoritative_role(p_user_id)::text = 'seller'
          AND subscription.plan_key = 'pro')
        OR (private.authoritative_role(p_user_id)::text = 'agent'
          AND subscription.plan_key = 'agent_basic')
        OR (private.authoritative_role(p_user_id)::text = 'developer'
          AND subscription.plan_key = 'developer_pro')
      )
  );
$$;

REVOKE ALL ON FUNCTION private.has_active_listing_promotion_plan(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_active_listing_promotion_plan(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION private.get_listing_promotion_plan_allowance(
  p_user_id uuid,
  p_promotion_type text
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, private
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF p_promotion_type NOT IN ('spotlight', 'priority') THEN
    RETURN 0;
  END IF;

  v_role := private.authoritative_role(p_user_id);
  IF v_role = 'admin'::public.user_role THEN
    RETURN 999;
  END IF;

  IF NOT private.has_active_listing_promotion_plan(p_user_id) THEN
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

COMMENT ON FUNCTION private.has_active_listing_promotion_plan(uuid) IS
  'True only for an active, unexpired, runtime-scoped paid plan backed by the active pricing product for the current role.';
COMMENT ON FUNCTION private.get_listing_promotion_plan_allowance(uuid, text) IS
  'Monthly paid promotion allowance: seller 1 Spotlight, agent 10 Priority, developer 1 Spotlight plus 1 Priority.';

COMMIT;
