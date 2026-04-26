-- Add dedicated POF verification status column to open_house_registrations
-- Replaces the hack of storing status in the free-text `note` field with prefix "pof_verified"/"pof_rejected"

ALTER TABLE public.open_house_registrations
  ADD COLUMN IF NOT EXISTS pof_verified_status TEXT
    CHECK (pof_verified_status IN ('unreviewed', 'verified', 'rejected'))
    DEFAULT 'unreviewed';

COMMENT ON COLUMN public.open_house_registrations.pof_verified_status IS
  'POF document review status: unreviewed | verified | rejected. Replaces note-field hack.';

-- Backfill existing rows from note field
UPDATE public.open_house_registrations
  SET pof_verified_status = 'verified'
  WHERE proof_of_funds_url IS NOT NULL
    AND note LIKE 'pof_verified%'
    AND pof_verified_status = 'unreviewed';

UPDATE public.open_house_registrations
  SET pof_verified_status = 'rejected'
  WHERE proof_of_funds_url IS NOT NULL
    AND note LIKE 'pof_rejected%'
    AND pof_verified_status = 'unreviewed';
