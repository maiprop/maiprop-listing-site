
-- Add followup tracking to leads
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS followup_step integer NOT NULL DEFAULT 0;
