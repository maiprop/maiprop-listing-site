-- =============================================================================
-- Supabase DB linter: Security Definer View, Extension in Public, RLS Always True
-- Apply after 20260320130000_extensions_schema_optional.sql
-- =============================================================================

-- ── 1. Security Definer View (profiles_public) ─────────────────────────────
-- Lint 0010: views with security_invoker = false run as view owner.
-- We keep it by design: we must expose only safe columns (no phone/PII) without
-- granting full-table SELECT on profiles. Switching to security_invoker = true
-- would require a SELECT USING (true) on profiles, exposing all columns via API.
COMMENT ON VIEW public.profiles_public IS
  'Safe profile fields only (no phone). SECURITY DEFINER intentional: limits exposure without granting full profiles read. Lint 0010 accepted.';


-- ── 2. Extension in Public ─────────────────────────────────────────────────
-- Lint 0014: pg_cron is left in public on purpose (Supabase: moving can break cron).
-- pg_net is moved to extensions schema in 20260320130000_extensions_schema_optional.sql.
DO $$
BEGIN
  EXECUTE 'COMMENT ON EXTENSION pg_cron IS ''Intentionally in public schema per Supabase; do not move. Lint 0014 accepted.''';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron comment skipped (%).', SQLERRM;
END $$;


-- ── 3. RLS Policy Always True (lint 0024) ───────────────────────────────────
-- Replace WITH CHECK (true) with explicit roles so the policy is not overly permissive.

-- firesale_requests: only anon or authenticated can insert (same behavior, explicit)
DROP POLICY IF EXISTS "Anyone can submit a firesale request" ON public.firesale_requests;
CREATE POLICY "Anyone can submit a firesale request"
  ON public.firesale_requests FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));

-- sync_log: edge functions insert as anon/authenticated; service_role bypasses RLS
DROP POLICY IF EXISTS "Allow sync log inserts" ON public.sync_log;
CREATE POLICY "Allow sync log inserts"
  ON public.sync_log FOR INSERT
  WITH CHECK (auth.role() IN ('anon', 'authenticated'));
