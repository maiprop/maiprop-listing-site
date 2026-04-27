-- ============================================================
-- 20260629000000_rls_null_guards_all_admin_policies.sql
-- A3: Add (SELECT auth.uid()) IS NOT NULL guards to all
-- UPDATE/DELETE policies that call has_platform_admin() or
-- has_role() — prevents unnecessary function evaluation for
-- anon requests and provides defense-in-depth against recursion.
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. articles — admin-only UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "articles_delete" ON public.articles;
CREATE POLICY "articles_delete" ON public.articles FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role((SELECT auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "articles_update" ON public.articles;
CREATE POLICY "articles_update" ON public.articles FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role((SELECT auth.uid()), 'admin'::app_role)
  );

-- ─────────────────────────────────────────────────────────────
-- 2. firesale_requests — owner OR admin UPDATE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "firesale_requests_update" ON public.firesale_requests;
CREATE POLICY "firesale_requests_update" ON public.firesale_requests FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR (
      (SELECT auth.uid()) IS NOT NULL
      AND has_platform_admin((SELECT auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 3. investor_subscriptions — admin-only UPDATE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "investor_subscriptions_update" ON public.investor_subscriptions;
CREATE POLICY "investor_subscriptions_update" ON public.investor_subscriptions FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_platform_admin((SELECT auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- 4. invitation_requests — admin-only UPDATE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "invitation_requests_update" ON public.invitation_requests;
CREATE POLICY "invitation_requests_update" ON public.invitation_requests FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_platform_admin((SELECT auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- 5. leads — admin UPDATE with WITH CHECK
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can update leads" ON public.leads;
CREATE POLICY "Admins can update leads" ON public.leads FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- ─────────────────────────────────────────────────────────────
-- 6. marketing_leads — admin UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete leads" ON public.marketing_leads;
CREATE POLICY "Admins can delete leads" ON public.marketing_leads FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins can update leads" ON public.marketing_leads;
CREATE POLICY "Admins can update leads" ON public.marketing_leads FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- ─────────────────────────────────────────────────────────────
-- 7. pricing_configs — admin UPDATE/DELETE with WITH CHECK
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "pricing_configs_delete" ON public.pricing_configs;
CREATE POLICY "pricing_configs_delete" ON public.pricing_configs FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "pricing_configs_update" ON public.pricing_configs;
CREATE POLICY "pricing_configs_update" ON public.pricing_configs FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND has_platform_admin((SELECT auth.uid()))
  );

-- ─────────────────────────────────────────────────────────────
-- 8. properties — admin UPDATE/DELETE with WITH CHECK
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Admins can delete properties" ON public.properties;
CREATE POLICY "Admins can delete properties" ON public.properties FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "Admins can update properties" ON public.properties;
CREATE POLICY "Admins can update properties" ON public.properties FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role(auth.uid(), 'admin'::app_role)
  );

-- ─────────────────────────────────────────────────────────────
-- 9. user_roles — admin UPDATE/DELETE
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "user_roles_delete" ON public.user_roles;
CREATE POLICY "user_roles_delete" ON public.user_roles FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role((SELECT auth.uid()), 'admin'::app_role)
  );

DROP POLICY IF EXISTS "user_roles_update" ON public.user_roles;
CREATE POLICY "user_roles_update" ON public.user_roles FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) IS NOT NULL
    AND has_role((SELECT auth.uid()), 'admin'::app_role)
  );
