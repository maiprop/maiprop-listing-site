-- =============================================================================
-- 20260510083000_review_findings_fixes.sql
-- =============================================================================
-- Fresh-build policy dedup: drop policies that earlier migrations create so
-- the later CREATE POLICY in 20260518 / 20260604 succeeds without
-- "policy already exists" errors.
--
-- Moved here from edits to applied-production migrations 20260518 and 20260604
-- to avoid hash-mismatch on `supabase db push`.
--
-- The drops are conditional: they only execute when the later migration that
-- re-creates the policy has NOT yet been applied. This prevents dropping live
-- policies on an existing production database where the later migrations
-- already ran.
-- =============================================================================

DO $$
BEGIN
  -- Only drop if 20260518000000 hasn't run yet (i.e. fresh-DB build).
  -- On production this migration is already applied, so the DROP is skipped
  -- and the live policy remains intact.
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260518000000'
  ) THEN
    DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals"
      ON public.firesale_requests;
  END IF;

  -- Same guard for the sync_log policy created by 20260604120000.
  IF NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations
    WHERE version = '20260604120000'
  ) THEN
    DROP POLICY IF EXISTS "sync_log_insert"
      ON public.sync_log;
  END IF;
END $$;
