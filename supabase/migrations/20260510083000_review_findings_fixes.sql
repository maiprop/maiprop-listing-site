-- =============================================================================
-- 20260510083000_review_findings_fixes.sql
-- =============================================================================
-- Fresh-build policy dedup: drop policies that earlier migrations create so
-- the later CREATE POLICY in 20260518 / 20260604 succeeds without
-- "policy already exists" errors.
--
-- Moved here from edits to applied-production migrations 20260518 and 20260604
-- to avoid hash-mismatch on `supabase db push`.
-- =============================================================================

DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals"
  ON public.firesale_requests;

DROP POLICY IF EXISTS "sync_log_insert"
  ON public.sync_log;
