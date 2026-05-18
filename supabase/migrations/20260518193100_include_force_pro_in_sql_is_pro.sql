-- Keep SQL entitlement checks aligned with AuthContext/useSubscription:
-- admin-managed force_pro_access grants Pro behavior across quota helpers.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS force_pro_access BOOLEAN DEFAULT false;

DO $$
DECLARE
  v_has_audience_helper boolean :=
    to_regprocedure('public.has_audience_scoped_pro_entitlement(uuid)') IS NOT NULL;
BEGIN
  IF to_regprocedure('public.has_platform_admin(uuid)') IS NULL
    OR to_regclass('public.investor_subscriptions') IS NULL THEN
    RETURN;
  END IF;

  IF v_has_audience_helper THEN
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $fn$
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
      $fn$;
    $sql$;
  ELSE
    EXECUTE $sql$
      CREATE OR REPLACE FUNCTION public.is_pro(p_user_id uuid)
      RETURNS boolean
      LANGUAGE sql
      SECURITY DEFINER
      STABLE
      SET search_path = public
      AS $fn$
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
          OR EXISTS (
            SELECT 1
            FROM public.investor_subscriptions s
            WHERE s.user_id = p_user_id
              AND s.status IN ('active', 'trial')
          )
      $fn$;
    $sql$;
  END IF;

  REVOKE ALL ON FUNCTION public.is_pro(uuid) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.is_pro(uuid) TO service_role;

  COMMENT ON FUNCTION public.is_pro(uuid) IS
    'True for platform admins, admin-managed Pro overrides, audience-scoped active Pro products when available, or active investor subscriptions.';
END;
$$;
