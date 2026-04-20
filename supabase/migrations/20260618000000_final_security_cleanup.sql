-- =============================================================================
-- Final security cleanup (runs after 20260617000000_fix_schema_gaps.sql)
--
-- 1. pricing_configs: revert to admin-only write access.
--    20260615 re-added 'agent' write access alongside admin, but only the
--    platform admin should be able to manage pricing configs in production.
--
-- 2. marketing_leads: add admin SELECT policy (was only on the old leads table
--    before the rename; the rename preserves policies but let's be explicit).
-- =============================================================================


-- ── 1. pricing_configs: admin-only write ─────────────────────────────────────

-- Drop every variant ever created for this table's write policies
DROP POLICY IF EXISTS "admin_or_agent_insert_pricing_configs"   ON public.pricing_configs;
DROP POLICY IF EXISTS "admin_or_agent_update_pricing_configs"   ON public.pricing_configs;
DROP POLICY IF EXISTS "admin_or_agent_delete_pricing_configs"   ON public.pricing_configs;
DROP POLICY IF EXISTS "Platform admin can insert pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Platform admin can update pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "Platform admin can delete pricing_configs" ON public.pricing_configs;
DROP POLICY IF EXISTS "pricing_configs_insert"                  ON public.pricing_configs;
DROP POLICY IF EXISTS "pricing_configs_update"                  ON public.pricing_configs;
DROP POLICY IF EXISTS "pricing_configs_delete"                  ON public.pricing_configs;

CREATE POLICY "pricing_configs_insert"
  ON public.pricing_configs FOR INSERT
  WITH CHECK (public.has_platform_admin((select auth.uid())));

CREATE POLICY "pricing_configs_update"
  ON public.pricing_configs FOR UPDATE
  USING  (public.has_platform_admin((select auth.uid())))
  WITH CHECK (public.has_platform_admin((select auth.uid())));

CREATE POLICY "pricing_configs_delete"
  ON public.pricing_configs FOR DELETE
  USING  (public.has_platform_admin((select auth.uid())));


-- ── 2. marketing_leads: ensure admin can SELECT ───────────────────────────────
-- The table was renamed from leads → marketing_leads; policies moved with it.
-- Add an explicit admin SELECT if not already present.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'marketing_leads'
      AND policyname = 'marketing_leads_admin_select'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "marketing_leads_admin_select"
        ON public.marketing_leads FOR SELECT
        USING (
          EXISTS (
            SELECT 1 FROM public.profiles
            WHERE user_id = (select auth.uid())
              AND role = 'admin'::public.user_role
          )
        )
    $p$;
  END IF;
END;
$$;
