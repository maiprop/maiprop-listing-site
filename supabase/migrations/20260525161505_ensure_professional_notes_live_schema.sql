-- Ensure already-running Supabase projects have the professional verification
-- notes column that fresh migration replay now creates before dependent triggers.
ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS notes TEXT;
