
-- Drop old FK that points to auth.users
ALTER TABLE public.professionals DROP CONSTRAINT IF EXISTS professionals_user_id_fkey;

-- Ensure profiles.user_id has unique constraint (needed for FK and PostgREST join)
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_user_id_key;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_user_id_key UNIQUE (user_id);

-- Add new FK from professionals.user_id -> profiles.user_id
ALTER TABLE public.professionals
  ADD CONSTRAINT professionals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;
