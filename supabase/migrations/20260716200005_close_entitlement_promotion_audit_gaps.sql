-- Promotion credits come only from an active paid subscription, an add-on, or
-- an administrator grant. Trial, past-due and profile override access remains
-- useful for product evaluation but cannot mint paid advertising inventory.

CREATE OR REPLACE FUNCTION private.has_active_listing_promotion_plan(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.billing_subscriptions AS subscription
    JOIN public.profiles AS profile
      ON profile.user_id = subscription.user_id
    WHERE subscription.user_id = p_user_id
      AND subscription.status = 'active'
      AND subscription.runtime_mode = public.current_billing_runtime_mode()
      AND (
        subscription.current_period_end IS NULL
        OR subscription.current_period_end > statement_timestamp()
      )
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
      AND (
        profile.subscription_product_id IS NULL
        OR subscription.stripe_product_id = profile.subscription_product_id
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

CREATE OR REPLACE FUNCTION public.get_priority_ad_monthly_limit(p_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.get_listing_promotion_plan_allowance(p_user_id, 'priority');
$$;

REVOKE ALL ON FUNCTION public.get_priority_ad_monthly_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(uuid)
  TO service_role;

-- Canonical AI quota reservation is handled by ai_usage_limits and the AI
-- functions. Retire all legacy usage-table trigger caps and their stale role
-- inference helpers.
DROP TRIGGER IF EXISTS trg_check_valuation_monthly_limit
  ON public.usage_ai_valuations;
DROP TRIGGER IF EXISTS trg_check_report_monthly_limit
  ON public.usage_property_reports;
DROP TRIGGER IF EXISTS trg_check_priority_ad_monthly_limit
  ON public.usage_priority_ads;

DROP FUNCTION IF EXISTS public.check_valuation_monthly_limit();
DROP FUNCTION IF EXISTS public.check_report_monthly_limit();
DROP FUNCTION IF EXISTS public.check_priority_ad_monthly_limit();

REVOKE ALL ON FUNCTION public.get_valuation_monthly_limit(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_report_monthly_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_valuation_monthly_limit(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_report_monthly_limit(uuid)
  TO service_role;

-- Financial promotion evidence survives both listing and account deletion.
ALTER TABLE public.listing_promotion_allocations
  ADD COLUMN IF NOT EXISTS owner_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.listing_promotion_allocations AS allocation
SET owner_snapshot = jsonb_build_object(
  'user_id', profile.user_id,
  'role', profile.role,
  'participant_type', profile.participant_type,
  'captured_at', statement_timestamp()
)
FROM public.profiles AS profile
WHERE profile.user_id = allocation.owner_id
  AND allocation.owner_snapshot = '{}'::jsonb;

ALTER TABLE public.listing_promotion_allocations
  DROP CONSTRAINT IF EXISTS listing_promotion_allocations_owner_id_fkey;
ALTER TABLE public.listing_promotion_allocations
  ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public.listing_promotion_allocations
  ADD CONSTRAINT listing_promotion_allocations_owner_id_fkey
  FOREIGN KEY (owner_id)
  REFERENCES public.profiles(user_id)
  ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION private.preserve_deleted_promotion_owner_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.listing_promotion_allocations AS allocation
  SET
    owner_snapshot = jsonb_build_object(
      'user_id', OLD.user_id,
      'role', OLD.role,
      'participant_type', OLD.participant_type,
      'deleted_at', statement_timestamp()
    ),
    owner_id = NULL,
    updated_at = statement_timestamp()
  WHERE allocation.owner_id = OLD.user_id;

  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION private.preserve_deleted_promotion_owner_audit()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_00_preserve_deleted_promotion_owner_audit
  ON public.profiles;
CREATE TRIGGER trg_00_preserve_deleted_promotion_owner_audit
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.preserve_deleted_promotion_owner_audit();

COMMENT ON COLUMN public.listing_promotion_allocations.owner_snapshot IS
  'Immutable owner identity evidence retained if the source account is deleted.';
