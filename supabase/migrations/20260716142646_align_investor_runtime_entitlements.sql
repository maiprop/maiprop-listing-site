-- Keep managed investor entitlements consistent across browser RLS, service
-- charging, and Edge Function subscription resolution. Test and live rows must
-- never satisfy each other's access checks.

CREATE OR REPLACE FUNCTION private.has_investor_subscription_for_user(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
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
  )
$$;

REVOKE ALL ON FUNCTION private.has_investor_subscription_for_user(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_investor_subscription_for_user(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription(
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND p_user_id = (SELECT auth.uid())
    AND private.has_investor_subscription_for_user(p_user_id),
    FALSE
  )
$$;

CREATE OR REPLACE FUNCTION public.has_current_investor_subscription()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, private
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

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, private
AS $$
  SELECT
    public.has_platform_admin(p_user_id)
    OR COALESCE(
      (
        SELECT profile.force_pro_access
        FROM public.profiles AS profile
        WHERE profile.user_id = p_user_id
        LIMIT 1
      ),
      FALSE
    )
    OR public.has_audience_scoped_pro_entitlement(p_user_id)
    OR private.has_investor_subscription_for_user(p_user_id)
$$;

REVOKE ALL ON FUNCTION public.is_pro(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid)
  TO service_role;

DROP POLICY IF EXISTS firesale_feed_select
  ON public.firesale_requests_investor_feed;
CREATE POLICY firesale_feed_select
  ON public.firesale_requests_investor_feed
  FOR SELECT
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.user_id = (SELECT auth.uid())
          AND public.profile_pricing_audience(
            profile.role,
            profile.participant_type::text
          ) IN ('investor', 'institutional')
      )
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

COMMENT ON FUNCTION private.has_investor_subscription_for_user(uuid) IS
  'Service-role-only managed investor entitlement check scoped to the active billing runtime and authoritative pricing audience.';
COMMENT ON FUNCTION public.has_current_investor_subscription(uuid) IS
  'Caller-scoped managed investor entitlement check. Test and live subscriptions never cross runtimes.';
COMMENT ON FUNCTION public.is_pro(uuid) IS
  'Canonical service-side Pro check using audience-scoped billing or runtime-scoped managed investor entitlements.';

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'private.has_investor_subscription_for_user(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not execute arbitrary investor entitlement checks';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.is_pro(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated must not execute arbitrary Pro checks';
  END IF;
END;
$$;
