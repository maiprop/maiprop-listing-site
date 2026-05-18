-- Keep SQL entitlement checks aligned with AuthContext/useSubscription:
-- admin-managed force_pro_access grants Pro behavior across quota helpers.

CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    public.has_platform_admin(p_user_id)
    OR COALESCE(
      (
        SELECT p.force_pro_access
        FROM public.profiles p
        WHERE p.user_id = p_user_id
        LIMIT 1
      ),
      FALSE
    )
    OR public.has_audience_scoped_pro_entitlement(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.investor_subscriptions s
      WHERE s.user_id = p_user_id
        AND s.status IN ('active', 'trial')
    )
$$;

REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;

COMMENT ON FUNCTION public.is_pro(uuid) IS
  'True for platform admins, admin-managed Pro overrides, audience-scoped active Pro products, or active investor subscriptions.';
