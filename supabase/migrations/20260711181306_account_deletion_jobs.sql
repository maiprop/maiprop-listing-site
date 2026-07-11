-- Minimal durable ledger for synchronous GDPR account deletion attempts.
-- user_id intentionally has no FK: the final job must survive auth.users deletion.

CREATE TABLE IF NOT EXISTS public.account_deletion_jobs (
  user_id uuid PRIMARY KEY,
  attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  leased_until timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
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

ALTER TABLE public.account_deletion_jobs
  ADD COLUMN IF NOT EXISTS attempt_id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS leased_until timestamptz NOT NULL DEFAULT (now() + interval '15 minutes');

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

-- Increment attempts atomically and lease the active attempt so concurrent
-- destructive requests cannot race each other.
-- SECURITY INVOKER keeps writes owned by the service-role caller.
DROP FUNCTION IF EXISTS public.begin_account_deletion_job(uuid);
CREATE OR REPLACE FUNCTION public.begin_account_deletion_job(p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_attempt_id uuid := gen_random_uuid();
  v_started_attempt_id uuid;
BEGIN
  INSERT INTO public.account_deletion_jobs (
    user_id,
    attempt_id,
    stage,
    status,
    attempts,
    last_error,
    requested_at,
    leased_until,
    completed_at
  )
  VALUES (
    p_user_id,
    v_attempt_id,
    'requested',
    'in_progress',
    1,
    NULL,
    now(),
    now() + interval '15 minutes',
    NULL
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    attempt_id = v_attempt_id,
    stage = 'requested',
    status = 'in_progress',
    attempts = public.account_deletion_jobs.attempts + 1,
    last_error = NULL,
    requested_at = now(),
    leased_until = now() + interval '15 minutes',
    completed_at = NULL
  WHERE public.account_deletion_jobs.status <> 'in_progress'
     OR public.account_deletion_jobs.leased_until < now()
  RETURNING public.account_deletion_jobs.attempt_id INTO v_started_attempt_id;

  IF v_started_attempt_id IS NULL THEN
    RAISE EXCEPTION 'account_deletion_already_in_progress'
      USING ERRCODE = '55P03';
  END IF;

  RETURN v_started_attempt_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.begin_account_deletion_job(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_account_deletion_job(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.set_account_deletion_job_stage(
  p_user_id uuid,
  p_attempt_id uuid,
  p_stage text,
  p_status text,
  p_last_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.account_deletion_jobs
  SET
    stage = p_stage,
    status = p_status,
    last_error = p_last_error,
    leased_until = CASE
      WHEN p_status = 'in_progress' THEN now() + interval '15 minutes'
      ELSE leased_until
    END,
    completed_at = CASE
      WHEN p_status = 'completed' THEN now()
      ELSE NULL
    END
  WHERE user_id = p_user_id
    AND attempt_id = p_attempt_id
    AND status = 'in_progress';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'account_deletion_attempt_not_active'
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_account_deletion_job_stage(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_deletion_job_stage(uuid, uuid, text, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.complete_account_deletion_from_auth_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  UPDATE public.account_deletion_jobs
  SET
    stage = 'completed',
    status = 'completed',
    last_error = NULL,
    leased_until = now(),
    completed_at = now()
  WHERE user_id = OLD.id
    AND stage = 'auth'
    AND status = 'in_progress';

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_account_deletion_from_auth_delete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_account_deletion_from_auth_delete()
  TO service_role;

DROP TRIGGER IF EXISTS trg_complete_account_deletion_from_auth_delete ON auth.users;
CREATE TRIGGER trg_complete_account_deletion_from_auth_delete
  AFTER DELETE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_account_deletion_from_auth_delete();

CREATE OR REPLACE FUNCTION public.is_account_deletion_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.account_deletion_jobs job
    WHERE job.user_id = p_user_id
      AND job.status IN ('in_progress', 'completed')
  );
$function$;

REVOKE ALL ON FUNCTION public.is_account_deletion_active(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_deletion_active(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION private.guard_deleted_account_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := NEW.owner_id;
  IF v_user_id IS NOT NULL AND public.is_account_deletion_active(v_user_id) THEN
    RAISE EXCEPTION 'account_deletion_in_progress'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_deleted_account_write()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_deleted_account_write()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_deleted_account_listing_write ON public.listings;
CREATE TRIGGER trg_guard_deleted_account_listing_write
  BEFORE INSERT OR UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_deleted_account_write();

CREATE OR REPLACE FUNCTION private.guard_deleted_account_storage_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_prefix text := split_part(NEW.name, '/', 1);
  v_user_id uuid;
BEGIN
  BEGIN
    v_user_id := v_prefix::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NEW;
  END;

  IF public.is_account_deletion_active(v_user_id) THEN
    RAISE EXCEPTION 'account_deletion_in_progress'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.guard_deleted_account_storage_write()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_deleted_account_storage_write()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_deleted_account_storage_write ON storage.objects;
CREATE TRIGGER trg_guard_deleted_account_storage_write
  BEFORE INSERT OR UPDATE ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_deleted_account_storage_write();

CREATE OR REPLACE FUNCTION public.get_account_deletion_storage_objects(p_user_id uuid)
RETURNS TABLE (
  bucket_id text,
  name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT object.bucket_id, object.name
  FROM storage.objects AS object
  WHERE object.name LIKE p_user_id::text || '/%';
$function$;

REVOKE ALL ON FUNCTION public.get_account_deletion_storage_objects(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_account_deletion_storage_objects(uuid)
  TO service_role;

COMMENT ON TABLE public.account_deletion_jobs IS
  'Minimal-PII durable status for synchronous account deletion attempts; service role writes only.';
