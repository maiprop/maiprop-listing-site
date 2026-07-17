-- Browser RLS policies must use the caller-safe private predicate. The public
-- helper accepts an arbitrary user id and intentionally remains service-only.

ALTER POLICY addon_purchases_select
  ON public.addon_purchases
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

ALTER POLICY billing_customers_select_own
  ON public.billing_customers
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

ALTER POLICY billing_subscriptions_select_own
  ON public.billing_subscriptions
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

ALTER POLICY firesale_interest_insert
  ON public.firesale_interest
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      investor_id = (SELECT auth.uid())
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

ALTER POLICY firesale_requests_select
  ON public.firesale_requests
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
    OR (
      published_to_investors = TRUE
      AND public.has_current_investor_subscription((SELECT auth.uid()))
    )
  );

ALTER POLICY listing_promotion_allocations_select_own
  ON public.listing_promotion_allocations
  USING (
    owner_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

ALTER POLICY privacy_audit_log_select_admin
  ON public.privacy_audit_log
  USING (private.has_platform_admin((SELECT auth.uid())));

ALTER POLICY privacy_export_requests_select_own_or_admin
  ON public.privacy_export_requests
  USING (
    user_id = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

ALTER POLICY privacy_export_requests_update_admin
  ON public.privacy_export_requests
  USING (private.has_platform_admin((SELECT auth.uid())))
  WITH CHECK (private.has_platform_admin((SELECT auth.uid())));

-- Historical migrations created additional browser policies after the original
-- hard-coded inventory was assembled. Repair every surviving policy expression
-- without changing the policy command, roles, or permissive/restrictive mode.
DO $policy_repair$
DECLARE
  v_policy record;
  v_qual text;
  v_with_check text;
  v_alter_policy text;
BEGIN
  FOR v_policy IN
    SELECT
      namespace.nspname AS schema_name,
      relation.relname AS table_name,
      policy.polname AS policy_name,
      pg_get_expr(policy.polqual, policy.polrelid) AS qual,
      pg_get_expr(policy.polwithcheck, policy.polrelid) AS with_check
    FROM pg_policy AS policy
    JOIN pg_class AS relation
      ON relation.oid = policy.polrelid
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE strpos(
      COALESCE(pg_get_expr(policy.polqual, policy.polrelid), ''),
      'has_platform_admin('
    ) > 0
      OR strpos(
        COALESCE(pg_get_expr(policy.polwithcheck, policy.polrelid), ''),
        'has_platform_admin('
      ) > 0
  LOOP
    v_qual := v_policy.qual;
    v_with_check := v_policy.with_check;

    IF v_qual IS NOT NULL THEN
      v_qual := replace(
        v_qual,
        'private.has_platform_admin(',
        '__MAIPROP_PRIVATE_ADMIN__('
      );
      v_qual := replace(
        v_qual,
        'public.has_platform_admin(',
        '__MAIPROP_PRIVATE_ADMIN__('
      );
      v_qual := replace(
        v_qual,
        'has_platform_admin(',
        '__MAIPROP_PRIVATE_ADMIN__('
      );
      v_qual := replace(
        v_qual,
        '__MAIPROP_PRIVATE_ADMIN__(',
        'private.has_platform_admin('
      );
    END IF;

    IF v_with_check IS NOT NULL THEN
      v_with_check := replace(
        v_with_check,
        'private.has_platform_admin(',
        '__MAIPROP_PRIVATE_ADMIN__('
      );
      v_with_check := replace(
        v_with_check,
        'public.has_platform_admin(',
        '__MAIPROP_PRIVATE_ADMIN__('
      );
      v_with_check := replace(
        v_with_check,
        'has_platform_admin(',
        '__MAIPROP_PRIVATE_ADMIN__('
      );
      v_with_check := replace(
        v_with_check,
        '__MAIPROP_PRIVATE_ADMIN__(',
        'private.has_platform_admin('
      );
    END IF;

    v_alter_policy := format(
      'ALTER POLICY %I ON %I.%I',
      v_policy.policy_name,
      v_policy.schema_name,
      v_policy.table_name
    );

    IF v_qual IS NOT NULL THEN
      v_alter_policy := v_alter_policy || format(' USING (%s)', v_qual);
    END IF;

    IF v_with_check IS NOT NULL THEN
      v_alter_policy := v_alter_policy
        || format(' WITH CHECK (%s)', v_with_check);
    END IF;

    EXECUTE v_alter_policy;
  END LOOP;
END;
$policy_repair$;

DO $$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.has_platform_admin(uuid)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION
      'public.has_platform_admin(uuid) must remain service-only';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE (
      strpos(COALESCE(qual, ''), 'has_platform_admin(') > 0
      AND strpos(COALESCE(qual, ''), 'private.has_platform_admin(') = 0
    ) OR (
      strpos(COALESCE(with_check, ''), 'has_platform_admin(') > 0
      AND strpos(COALESCE(with_check, ''), 'private.has_platform_admin(') = 0
    )
  ) THEN
    RAISE EXCEPTION
      'an RLS policy still calls the service-only public admin predicate';
  END IF;
END;
$$;
