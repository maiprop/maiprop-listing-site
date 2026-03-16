-- Security audit: restrict sync_log INSERT to service role only
-- Edge functions (receive-from-os, etc.) use service role and bypass RLS
-- Dropping this policy prevents anon/authenticated clients from polluting the audit log

DROP POLICY IF EXISTS "Allow sync log inserts" ON public.sync_log;

-- No new INSERT policy: only service_role (which bypasses RLS) can insert.
-- Frontend and anon clients can no longer write to sync_log.
