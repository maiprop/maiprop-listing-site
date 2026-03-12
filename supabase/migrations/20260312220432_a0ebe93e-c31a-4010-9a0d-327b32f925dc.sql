-- Drop the restrictive INSERT policy that blocks edge function sync log writes
DROP POLICY IF EXISTS "Service role can insert sync logs" ON public.sync_log;

-- Allow any source to insert sync logs (service role bypasses RLS anyway, this covers anon edge fn calls)
CREATE POLICY "Allow sync log inserts"
  ON public.sync_log
  FOR INSERT
  WITH CHECK (true);