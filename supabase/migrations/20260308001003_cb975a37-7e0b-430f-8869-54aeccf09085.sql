
-- Drop the FK constraint so professionals can have seed user_ids that don't exist in profiles
ALTER TABLE public.professionals DROP CONSTRAINT IF EXISTS professionals_user_id_fkey;
