
-- Add display_name to professionals so we don't need the profiles join
ALTER TABLE public.professionals ADD COLUMN IF NOT EXISTS display_name TEXT;
