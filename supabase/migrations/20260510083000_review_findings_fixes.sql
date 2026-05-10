-- =============================================================================
-- 20260706000000_review_findings_fixes.sql
-- =============================================================================
-- Addresses unresolved PR review findings across PRs #86, #87, #108:
--
--   1. Drop policies that the 20260507xxx migrations create at an earlier
--      timestamp, preventing duplicate-policy errors on fresh DB builds.
--      (Moved here from edits to applied-production migrations 20260518
--       and 20260604 to avoid hash-mismatch on `supabase db push`.)
--
--   2. Replace the closing_date table-level CHECK constraint with an
--      INSERT-only trigger so admin UPDATE (review) doesn't fail when
--      the date has drifted past the boundary since submission.
-- =============================================================================


-- 1. Fresh-build policy dedup ------------------------------------------------
-- On a fresh DB, migration 20260507152253 creates these policies before
-- 20260518 / 20260604 run. Drop them so the later CREATE POLICY succeeds.

DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals"
  ON public.firesale_requests;

DROP POLICY IF EXISTS "sync_log_insert"
  ON public.sync_log;


-- 2. Replace closing_date CHECK with INSERT-only trigger ---------------------
-- The original CHECK (closing_date <= CURRENT_DATE ...) is re-evaluated on
-- every UPDATE. Admin review flips status/rejection_reason but doesn't touch
-- closing_date — yet the CHECK still fires, blocking reviews of entries whose
-- closing_date has since aged past the 5-year window.

-- Drop the existing CHECK constraint. The constraint name is auto-generated
-- by Postgres as "<table>_closing_date_check"; use a DO block so this is
-- idempotent if the constraint was already dropped or never existed.
DO $$
BEGIN
  ALTER TABLE public.agent_data_inputs
    DROP CONSTRAINT IF EXISTS agent_data_inputs_closing_date_check;
EXCEPTION WHEN undefined_object THEN
  -- Constraint does not exist — nothing to do.
  NULL;
END $$;

-- Enforce the date bounds on INSERT only via a BEFORE INSERT trigger.
CREATE OR REPLACE FUNCTION public.agent_data_inputs_validate_closing_date()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.closing_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'closing_date cannot be in the future'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.closing_date < CURRENT_DATE - INTERVAL '5 years' THEN
    RAISE EXCEPTION 'closing_date cannot be more than 5 years in the past'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_data_inputs_closing_date
  ON public.agent_data_inputs;
CREATE TRIGGER trg_agent_data_inputs_closing_date
  BEFORE INSERT ON public.agent_data_inputs
  FOR EACH ROW EXECUTE FUNCTION public.agent_data_inputs_validate_closing_date();
