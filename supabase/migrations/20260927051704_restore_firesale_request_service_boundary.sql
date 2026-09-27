-- The later explicit Data API grant migration inferred INSERT from a historical
-- RLS policy. Request creation/rollback instead belongs to submit-firesale-request.
-- Keep the policy and every non-write privilege unchanged. One DO statement
-- makes preflight, ACL edits and effective-privilege checks atomic.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'firesale_requests'
      AND c.relkind = 'r' AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'expected RLS-enabled ordinary public.firesale_requests table';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.firesale_requests', 'SELECT') THEN
    RAISE EXCEPTION 'expected existing service_role SELECT for INSERT RETURNING';
  END IF;

  EXECUTE 'REVOKE INSERT, DELETE ON TABLE public.firesale_requests FROM PUBLIC, anon, authenticated';
  EXECUTE 'GRANT INSERT, DELETE ON TABLE public.firesale_requests TO service_role';

  IF has_table_privilege('anon', 'public.firesale_requests', 'INSERT')
     OR has_any_column_privilege('anon', 'public.firesale_requests', 'INSERT')
     OR has_table_privilege('anon', 'public.firesale_requests', 'DELETE')
     OR has_table_privilege('authenticated', 'public.firesale_requests', 'INSERT')
     OR has_any_column_privilege('authenticated', 'public.firesale_requests', 'INSERT')
     OR has_table_privilege('authenticated', 'public.firesale_requests', 'DELETE') THEN
    RAISE EXCEPTION 'browser firesale write privilege remains after ACL correction';
  END IF;

  IF NOT has_table_privilege('service_role', 'public.firesale_requests', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.firesale_requests', 'INSERT')
     OR NOT has_table_privilege('service_role', 'public.firesale_requests', 'DELETE') THEN
    RAISE EXCEPTION 'service firesale create/rollback privilege is incomplete';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.firesale_requests', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.firesale_requests', 'UPDATE') THEN
    RAISE EXCEPTION 'expected owner/admin read and update privileges';
  END IF;
END $$;
