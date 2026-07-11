-- Minimal durable ledger for synchronous GDPR account deletion attempts.
-- user_id intentionally has no FK: the final job must survive auth.users deletion.

CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  user_id uuid PRIMARY KEY,
  stage text NOT NULL DEFAULT 'requested'
    CHECK (stage IN (
      'requested',
      'listings',
      'subscriptions',
      'storage',
      'firesale_photos',
      'auth',
      'completed'
    )),
  status text NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'failed', 'completed')),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts > 0),
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 128),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT account_deletion_jobs_completion_state_check CHECK (
    (status = 'completed' AND stage = 'completed' AND completed_at IS NOT NULL)
    OR
    (status <> 'completed' AND stage <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT account_deletion_jobs_failure_state_check CHECK (
    (status = 'failed' AND last_error IS NOT NULL)
    OR
    (status <> 'failed' AND last_error IS NULL)
  )
);

ALTER TABLE public.account_deletion_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.account_deletion_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_deletion_jobs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_deletion_jobs TO service_role;

DROP POLICY IF EXISTS account_deletion_jobs_select_own
  ON public.account_deletion_jobs;
CREATE POLICY account_deletion_jobs_select_own
  ON public.account_deletion_jobs
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- Increment attempts atomically so concurrent retries cannot lose a count.
-- SECURITY INVOKER keeps writes owned by the service-role caller.
CREATE OR REPLACE FUNCTION public.begin_account_deletion_job(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $function$
  INSERT INTO public.account_deletion_jobs (
    user_id,
    stage,
    status,
    attempts,
    last_error,
    requested_at,
    completed_at
  )
  VALUES (
    p_user_id,
    'requested',
    'in_progress',
    1,
    NULL,
    now(),
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    stage = 'requested',
    status = 'in_progress',
    attempts = public.account_deletion_jobs.attempts + 1,
    last_error = NULL,
    completed_at = NULL;
$function$;

REVOKE ALL ON FUNCTION public.begin_account_deletion_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion_job(uuid) TO service_role;

COMMENT ON TABLE public.account_deletion_jobs IS
  'Minimal-PII durable status for synchronous account deletion attempts; service role writes only.';
