-- Persist exact-object Storage cleanup retries outside the database creation
-- transaction. Storage cannot participate in PostgreSQL transactions, so
-- failed compensating deletes must be durable and retried through the Storage
-- API rather than through direct SQL against storage.objects.

CREATE TABLE IF NOT EXISTS public.storage_cleanup_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket text NOT NULL CHECK (bucket IN ('listing-images', 'project-media')),
  object_path text NOT NULL,
  object_url text NOT NULL,
  owner_id uuid NOT NULL,
  project_id uuid NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'dead')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (bucket, object_path)
);

ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.storage_cleanup_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_cleanup_jobs TO service_role;

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_jobs_claim
  ON public.storage_cleanup_jobs (next_attempt_at, created_at, id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.claim_storage_cleanup_jobs(
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.storage_cleanup_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT job.id
    FROM public.storage_cleanup_jobs AS job
    WHERE (
      job.status = 'pending'
      AND job.next_attempt_at <= now()
    ) OR (
      job.status = 'processing'
      AND job.updated_at <= now() - interval '15 minutes'
    )
    ORDER BY job.next_attempt_at ASC, job.created_at ASC, job.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  )
  UPDATE public.storage_cleanup_jobs AS job
  SET status = 'processing',
      attempts = job.attempts + 1,
      updated_at = now()
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_storage_cleanup_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_cleanup_jobs(integer)
  TO service_role;

COMMENT ON TABLE public.storage_cleanup_jobs IS
  'Service-only compensating cleanup outbox for exact Supabase Storage objects.';

CREATE OR REPLACE FUNCTION public.is_storage_object_committed(
  p_object_url text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.project_media AS media
      WHERE media.url = p_object_url
    )
    OR EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.cover_image_url = p_object_url
    )
    OR EXISTS (
      SELECT 1
      FROM public.listing_images AS image
      WHERE image.url = p_object_url
    );
$$;

REVOKE ALL ON FUNCTION public.is_storage_object_committed(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_storage_object_committed(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.invoke_storage_cleanup_cron()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cron_secret text := NULL;
  v_supabase_url text := NULL;
BEGIN
  BEGIN
    SELECT decrypted_secret
    INTO v_cron_secret
    FROM vault.decrypted_secrets
    WHERE name = 'CRON_SECRET'
    LIMIT 1;
  EXCEPTION
    WHEN invalid_schema_name OR undefined_table THEN
      RAISE NOTICE 'Vault is unavailable while invoking Storage cleanup.';
  END;

  v_cron_secret := COALESCE(
    NULLIF(v_cron_secret, ''),
    NULLIF(current_setting('app.settings.cron_secret', true), '')
  );
  IF v_cron_secret IS NULL THEN
    RAISE WARNING 'CRON_SECRET is missing; skipping Storage cleanup invocation.';
    RETURN;
  END IF;

  v_supabase_url := NULLIF(current_setting('app.settings.supabase_url', true), '');
  IF v_supabase_url IS NULL THEN
    BEGIN
      SELECT decrypted_secret
      INTO v_supabase_url
      FROM vault.decrypted_secrets
      WHERE name IN ('SUPABASE_URL', 'supabase_url')
      LIMIT 1;
    EXCEPTION
      WHEN invalid_schema_name OR undefined_table THEN
        RAISE NOTICE 'Vault is unavailable while resolving the Supabase URL.';
    END;
  END IF;
  IF v_supabase_url IS NULL THEN
    RAISE WARNING 'Supabase URL is missing; skipping Storage cleanup invocation.';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := rtrim(v_supabase_url, '/') || '/functions/v1/process-storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_storage_cleanup_cron()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.invoke_storage_cleanup_cron()
  TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cron'
  ) THEN
    RAISE NOTICE 'cron schema is unavailable; Storage cleanup schedule was not installed.';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'process-storage-cleanup'
  ) THEN
    PERFORM cron.unschedule('process-storage-cleanup');
  END IF;

  PERFORM cron.schedule(
    'process-storage-cleanup',
    '*/15 * * * *',
    'SELECT public.invoke_storage_cleanup_cron();'
  );
END;
$$;
