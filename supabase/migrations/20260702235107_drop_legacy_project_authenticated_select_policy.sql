-- Remove a legacy authenticated project SELECT policy that overlapped with the
-- tenant-aware projects_select policy introduced by enterprise resource ownership.
-- Keeping both policies makes live security posture fail because authenticated
-- project reads have two active SELECT paths.

DROP POLICY IF EXISTS "Projects are visible to authenticated users" ON public.projects;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'Projects are visible to authenticated users'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'legacy authenticated project select policy still present';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'projects_select'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'tenant-aware project select policy missing';
  END IF;
END $$;
