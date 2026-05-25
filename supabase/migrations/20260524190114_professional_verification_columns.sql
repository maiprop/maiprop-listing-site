-- Align the professionals schema with the admin verification workflow.
-- The UI already records rejection notes and displays verification dates; make
-- those columns explicit in migration history and generated types.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

UPDATE public.professionals
SET verified_at = COALESCE(verified_at, updated_at, now())
WHERE verified IS TRUE
  AND verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_professionals_verification_status
  ON public.professionals(verified, verified_at)
  WHERE archived_at IS NULL;
