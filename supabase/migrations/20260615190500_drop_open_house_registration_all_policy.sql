-- Drop the stale requester FOR ALL registration policy that can survive older
-- hardening paths and overlap with the action-specific open-house policies.
-- This current-dated follow-up cleans already-applied staging/production chains;
-- the later consolidation migration also drops the same policy for fresh replays.

BEGIN;

DROP POLICY IF EXISTS "OH regs: requester read/insert/update own"
  ON public.open_house_registrations;
DROP POLICY IF EXISTS "OH regs: owner read/update all for their listing"
  ON public.open_house_registrations;
DROP POLICY IF EXISTS "OH regs: owner update (approval, attendance)"
  ON public.open_house_registrations;
DROP POLICY IF EXISTS "oh_regs_requester"
  ON public.open_house_registrations;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'open_house_registrations'
      AND policyname IN (
        'OH regs: requester read/insert/update own',
        'OH regs: owner read/update all for their listing',
        'OH regs: owner update (approval, attendance)',
        'oh_regs_requester'
      )
  ) THEN
    RAISE EXCEPTION 'stale open_house_registrations permissive policy still exists';
  END IF;
END $$;

COMMIT;
