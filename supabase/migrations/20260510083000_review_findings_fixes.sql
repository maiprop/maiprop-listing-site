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
-- The drops are conditional: on production (supabase db push) they only execute
-- when the later migration hasn't been applied yet.  In CI (raw psql on a fresh
-- DB) the schema_migrations table doesn't exist, so we always drop.
-- =============================================================================

DO $$
BEGIN
  -- Detect environment: supabase db push populates schema_migrations; CI
  -- validation runs raw psql where that table does not exist.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'supabase_migrations'
      AND table_name   = 'schema_migrations'
  ) THEN
    -- CI / raw psql: always a fresh build — drop for dedup.
    DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals"
      ON public.firesale_requests;
    DROP POLICY IF EXISTS "sync_log_insert"
      ON public.sync_log;
  ELSE
    -- supabase db push: only drop if the later migration hasn't run yet.
    IF NOT EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260518000000'
    ) THEN
      DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals"
        ON public.firesale_requests;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations
      WHERE version = '20260604120000'
    ) THEN
      DROP POLICY IF EXISTS "sync_log_insert"
        ON public.sync_log;
    END IF;
  END IF;
END $$;
