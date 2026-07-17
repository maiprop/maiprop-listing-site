-- Browser callers only need a caller-scoped investor check. Arbitrary-user
-- entitlement evaluation remains service-role-only, including Priority limits.

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND p_user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.investor_subscriptions AS subscription
      JOIN public.profiles AS profile
        ON profile.user_id = subscription.user_id
      WHERE subscription.user_id = p_user_id
        AND public.profile_pricing_audience(
          profile.role,
          profile.participant_type::text
        ) IN ('investor', 'institutional')
        AND subscription.runtime_mode = public.current_billing_runtime_mode()
        AND subscription.livemode = (
          public.current_billing_runtime_mode() = 'live'
        )
        AND subscription.status IN ('active', 'trial')
        AND (
          subscription.expires_at IS NULL
          OR subscription.expires_at > now()
        )
    ),
    FALSE
  )
$$;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription()
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT public.has_current_investor_subscription((SELECT auth.uid()))
$$;

REVOKE ALL ON FUNCTION public.has_current_investor_subscription(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription(uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_current_investor_subscription()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_current_investor_subscription()
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_priority_ad_monthly_limit(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_priority_ad_monthly_limit(uuid) TO service_role;

COMMENT ON FUNCTION public.has_current_investor_subscription(uuid) IS
  'Caller-scoped managed investor entitlement check. Runtime and pricing audience are enforced without elevated browser privileges.';
COMMENT ON FUNCTION public.get_priority_ad_monthly_limit(uuid) IS
  'Service-side Priority allowance evaluator. Browser display limits are derived from the shared role-plan contract.';

DO $$
DECLARE
  investor_with_id regprocedure :=
    'public.has_current_investor_subscription(uuid)'::regprocedure;
  investor_self regprocedure :=
    'public.has_current_investor_subscription()'::regprocedure;
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.get_priority_ad_monthly_limit(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'priority limit helper must not be browser executable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = investor_with_id AND prosecdef
  ) OR EXISTS (
    SELECT 1 FROM pg_proc WHERE oid = investor_self AND prosecdef
  ) THEN
    RAISE EXCEPTION 'investor subscription wrapper must not be security definer';
  END IF;
END;
$$;
