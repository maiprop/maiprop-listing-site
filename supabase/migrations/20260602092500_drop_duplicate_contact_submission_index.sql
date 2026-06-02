-- Remove the older duplicate contact-submissions index after the canonical
-- contact inbox migrations created the same (status, created_at desc) index
-- under two names.

DROP INDEX IF EXISTS public.idx_contact_submissions_status_created;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'contact_submissions'
      AND indexname = 'idx_contact_submissions_status_created_at'
      AND indexdef ILIKE '%(status, created_at DESC)%'
  ) THEN
    RAISE EXCEPTION 'canonical contact_submissions status index missing';
  END IF;
END $$;
