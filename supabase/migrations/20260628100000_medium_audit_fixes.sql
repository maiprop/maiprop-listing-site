-- =============================================================================
-- 20260628100000_medium_audit_fixes.sql
-- Medium-priority audit findings remediation
-- =============================================================================

-- M2: firesale_interest INSERT must require active investor subscription ------
-- Previously any authenticated user could insert rows (auth.uid() = investor_id).
-- Now requires an active investor_subscriptions row.

DROP POLICY IF EXISTS "Investors manage own firesale interest" ON public.firesale_interest;

-- SELECT + UPDATE + DELETE: investors see and manage their own rows.
CREATE POLICY "Investors read own firesale interest"
  ON public.firesale_interest FOR SELECT
  USING (auth.uid() = investor_id);

CREATE POLICY "Investors update own firesale interest"
  ON public.firesale_interest FOR UPDATE
  USING (auth.uid() = investor_id)
  WITH CHECK (auth.uid() = investor_id);

CREATE POLICY "Investors delete own firesale interest"
  ON public.firesale_interest FOR DELETE
  USING (auth.uid() = investor_id);

-- INSERT: must own the row AND have an active investor subscription.
CREATE POLICY "Investors with active subscription insert firesale interest"
  ON public.firesale_interest FOR INSERT
  WITH CHECK (
    auth.uid() = investor_id
    AND EXISTS (
      SELECT 1 FROM public.investor_subscriptions
      WHERE user_id = (SELECT auth.uid())
        AND status IN ('active', 'trial')
    )
  );


-- M3: Lock down old usage tables — remove client-side INSERT policies --------
-- These tables were superseded by usage_ai_calls (SECURITY DEFINER only).
-- Clients should not be able to insert/delete usage rows directly.

DROP POLICY IF EXISTS "Users insert own valuation usage" ON public.usage_ai_valuations;
DROP POLICY IF EXISTS "Users insert own report usage" ON public.usage_property_reports;
DROP POLICY IF EXISTS "Users insert own priority ad usage" ON public.usage_priority_ads;

-- SELECT policies remain so the UI can display historical usage.
-- INSERT/UPDATE/DELETE are now blocked for authenticated (RLS deny-by-default).
-- Service role and SECURITY DEFINER functions can still write.
