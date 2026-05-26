-- =============================================================================
-- 20260703130000_closing_date_check_to_trigger.sql
-- =============================================================================
-- Replace the closing_date table-level CHECK constraint with an INSERT-only
-- trigger so admin UPDATE (review) doesn't fail when the date has drifted past
-- the boundary since submission.
--
-- The original CHECK (closing_date <= CURRENT_DATE ...) is re-evaluated on
-- every UPDATE. Admin review flips status/rejection_reason but doesn't touch
-- closing_date — yet the CHECK still fires, blocking reviews of entries whose
-- closing_date has since aged past the 5-year window.
-- =============================================================================

-- Drop the existing CHECK constraint.
ALTER TABLE public.agent_data_inputs
  DROP CONSTRAINT IF EXISTS agent_data_inputs_closing_date_check;

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

REVOKE ALL ON FUNCTION public.agent_data_inputs_validate_closing_date() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.agent_data_inputs_validate_closing_date() TO service_role;
