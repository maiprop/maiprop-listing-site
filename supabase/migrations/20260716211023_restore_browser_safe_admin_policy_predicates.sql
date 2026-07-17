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
