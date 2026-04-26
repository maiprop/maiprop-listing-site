-- Require explicit role selection during onboarding.
-- New signups should not be silently assigned a default role before choosing account type.

ALTER TABLE public.profiles
  ALTER COLUMN role DROP DEFAULT,
  ALTER COLUMN role DROP NOT NULL;
