-- Coordinate new-building uploads and compensating cleanup through one
-- durable exact-object lifecycle. An object is registered before upload,
-- committed in the same transaction as the project/listing rows, or becomes
-- eligible for delayed cleanup. Lease tokens prevent stale workers from
-- finalizing a reclaimed job.

ALTER TABLE public.storage_cleanup_jobs
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

ALTER TABLE public.storage_cleanup_jobs
  DROP CONSTRAINT IF EXISTS storage_cleanup_jobs_path_scope_check;
ALTER TABLE public.storage_cleanup_jobs
  ADD CONSTRAINT storage_cleanup_jobs_path_scope_check CHECK (
    object_path LIKE owner_id::text || '/' || project_id::text || '/create/%'
    AND length(object_path) > length(owner_id::text || '/' || project_id::text || '/create/')
    AND position('/' IN substring(
      object_path
      FROM length(owner_id::text || '/' || project_id::text || '/create/') + 1
    )) = 0
    AND object_path NOT LIKE '%..%'
    AND object_path NOT LIKE E'%\\%'
  );

ALTER TABLE public.storage_cleanup_jobs
  DROP CONSTRAINT IF EXISTS storage_cleanup_jobs_url_identity_check;
ALTER TABLE public.storage_cleanup_jobs
  ADD CONSTRAINT storage_cleanup_jobs_url_identity_check CHECK (
    right(
      object_url,
      length('/storage/v1/object/public/' || bucket || '/' || object_path)
    ) = '/storage/v1/object/public/' || bucket || '/' || object_path
  );

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_jobs_processing_lease
  ON public.storage_cleanup_jobs (lease_expires_at, updated_at, id)
  WHERE status = 'processing';

CREATE OR REPLACE FUNCTION private.storage_cleanup_path_is_valid(
  p_owner_id uuid,
  p_project_id uuid,
  p_bucket text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT
    p_owner_id IS NOT NULL
    AND p_project_id IS NOT NULL
    AND p_bucket IN ('listing-images', 'project-media')
    AND p_object_path LIKE
      p_owner_id::text || '/' || p_project_id::text || '/create/%'
    AND length(p_object_path) >
      length(p_owner_id::text || '/' || p_project_id::text || '/create/')
    AND position('/' IN substring(
      p_object_path
      FROM length(p_owner_id::text || '/' || p_project_id::text || '/create/') + 1
    )) = 0
    AND p_object_path NOT LIKE '%..%'
    AND p_object_path NOT LIKE E'%\\%';
$$;

REVOKE ALL ON FUNCTION private.storage_cleanup_path_is_valid(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.storage_cleanup_path_is_valid(
  uuid, uuid, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.register_new_building_storage_upload(
  p_project_id uuid,
  p_bucket text,
  p_object_path text,
  p_object_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_job public.storage_cleanup_jobs%ROWTYPE;
  v_marker text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '28000';
  END IF;

  IF NOT private.storage_cleanup_path_is_valid(
    v_actor,
    p_project_id,
    p_bucket,
    p_object_path
  ) THEN
    RAISE EXCEPTION 'storage_upload_path_invalid' USING ERRCODE = '22023';
  END IF;

  v_marker := '/storage/v1/object/public/' || p_bucket || '/' || p_object_path;
  IF p_object_url IS NULL
     OR right(p_object_url, length(v_marker)) IS DISTINCT FROM v_marker THEN
    RAISE EXCEPTION 'storage_upload_url_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'storage-upload:' || p_bucket || ':' || p_object_path,
      0
    )
  );

  SELECT job.*
  INTO v_job
  FROM public.storage_cleanup_jobs AS job
  WHERE job.bucket = p_bucket
    AND job.object_path = p_object_path
  FOR UPDATE;

  IF FOUND AND v_job.status = 'processing' THEN
    RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
  END IF;

  INSERT INTO public.storage_cleanup_jobs (
    bucket,
    object_path,
    object_url,
    owner_id,
    project_id,
    reason,
    status,
    attempts,
    next_attempt_at,
    last_error,
    completed_at,
    lease_token,
    lease_expires_at,
    updated_at
  )
  VALUES (
    p_bucket,
    p_object_path,
    p_object_url,
    v_actor,
    p_project_id,
    'new_build_upload',
    'pending',
    0,
    now() + interval '24 hours',
    NULL,
    NULL,
    NULL,
    NULL,
    now()
  )
  ON CONFLICT (bucket, object_path)
  DO UPDATE SET
    object_url = EXCLUDED.object_url,
    owner_id = EXCLUDED.owner_id,
    project_id = EXCLUDED.project_id,
    reason = EXCLUDED.reason,
    status = 'pending',
    attempts = 0,
    next_attempt_at = now() + interval '24 hours',
    last_error = NULL,
    completed_at = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = now()
  RETURNING id INTO v_job.id;

  RETURN v_job.id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_new_building_storage_upload(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_new_building_storage_upload(
  uuid, text, text, text
) TO authenticated;

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
      AND COALESCE(
        job.lease_expires_at,
        job.updated_at + interval '15 minutes'
      ) <= now()
    )
    ORDER BY job.next_attempt_at ASC, job.created_at ASC, job.id ASC
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 25), 1), 100)
  )
  UPDATE public.storage_cleanup_jobs AS job
  SET status = 'processing',
      attempts = job.attempts + 1,
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  FROM candidates
  WHERE job.id = candidates.id
  RETURNING job.*;
END;
$$;

DROP FUNCTION IF EXISTS public.is_storage_object_committed(text);

CREATE OR REPLACE FUNCTION public.is_storage_object_committed(
  p_bucket text,
  p_object_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE p_bucket
    WHEN 'project-media' THEN EXISTS (
      SELECT 1
      FROM public.project_media AS media
      WHERE right(
        media.url,
        length('/storage/v1/object/public/project-media/' || p_object_path)
      ) = '/storage/v1/object/public/project-media/' || p_object_path
    )
    WHEN 'listing-images' THEN (
      EXISTS (
        SELECT 1
        FROM public.listings AS listing
        WHERE right(
          listing.cover_image_url,
          length('/storage/v1/object/public/listing-images/' || p_object_path)
        ) = '/storage/v1/object/public/listing-images/' || p_object_path
      )
      OR EXISTS (
        SELECT 1
        FROM public.listing_images AS image
        WHERE right(
          image.url,
          length('/storage/v1/object/public/listing-images/' || p_object_path)
        ) = '/storage/v1/object/public/listing-images/' || p_object_path
      )
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.is_storage_object_committed(text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_storage_object_committed(text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.prepare_storage_cleanup_delete(
  p_job_id uuid,
  p_lease_token uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  job public.storage_cleanup_jobs%ROWTYPE;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  SELECT candidate.*
  INTO job
  FROM public.storage_cleanup_jobs AS candidate
  WHERE candidate.id = p_job_id
    AND candidate.status = 'processing'
    AND candidate.lease_token = p_lease_token
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'lost';
  END IF;

  IF public.is_storage_object_committed(job.bucket, job.object_path) THEN
    UPDATE public.storage_cleanup_jobs AS candidate
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        last_error = NULL,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE candidate.id = job.id
      AND candidate.status = 'processing'
      AND candidate.lease_token = p_lease_token;
    RETURN 'preserve';
  END IF;

  UPDATE public.storage_cleanup_jobs AS candidate
  SET lease_expires_at = now() + interval '5 minutes',
      updated_at = now()
  WHERE candidate.id = job.id
    AND candidate.status = 'processing'
    AND candidate.lease_token = p_lease_token;
  RETURN 'delete';
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_storage_cleanup_delete(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_storage_cleanup_delete(uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.create_new_building_listing_with_storage_for_service(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_project_kind text,
  p_project jsonb,
  p_units jsonb,
  p_project_media jsonb,
  p_listing jsonb,
  p_additional_image_urls jsonb,
  p_storage_objects jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid := NULLIF(p_project->>'id', '')::uuid;
  v_existing boolean;
  v_object jsonb;
  v_job public.storage_cleanup_jobs%ROWTYPE;
  v_result jsonb;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF v_project_id IS NULL
     OR p_storage_objects IS NULL
     OR jsonb_typeof(p_storage_objects) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_storage_objects) = 0 THEN
    RAISE EXCEPTION 'storage_upload_not_registered' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'create-new-building:' || v_project_id::text,
      0
    )
  );
  SELECT EXISTS (
    SELECT 1 FROM public.projects AS project WHERE project.id = v_project_id
  ) INTO v_existing;

  FOR v_object IN SELECT value FROM jsonb_array_elements(p_storage_objects)
  LOOP
    IF NOT private.storage_cleanup_path_is_valid(
      p_actor_user_id,
      v_project_id,
      v_object->>'bucket',
      v_object->>'object_path'
    ) THEN
      RAISE EXCEPTION 'storage_upload_path_invalid' USING ERRCODE = '22023';
    END IF;

    SELECT job.*
    INTO v_job
    FROM public.storage_cleanup_jobs AS job
    WHERE job.bucket = v_object->>'bucket'
      AND job.object_path = v_object->>'object_path'
      AND job.owner_id = p_actor_user_id
      AND job.project_id = v_project_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'storage_upload_not_registered' USING ERRCODE = '55000';
    END IF;
    IF v_job.status = 'processing' THEN
      RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
    END IF;
    IF NOT v_existing AND v_job.status <> 'pending' THEN
      RAISE EXCEPTION 'storage_upload_not_registered' USING ERRCODE = '55000';
    END IF;
  END LOOP;

  v_result := public.create_new_building_listing_for_service(
    p_actor_user_id,
    p_organization_id,
    p_project_kind,
    p_project,
    p_units,
    p_project_media,
    p_listing,
    p_additional_image_urls
  );

  FOR v_object IN SELECT value FROM jsonb_array_elements(p_storage_objects)
  LOOP
    UPDATE public.storage_cleanup_jobs AS job
    SET status = 'completed',
        completed_at = now(),
        updated_at = now(),
        last_error = NULL,
        lease_token = NULL,
        lease_expires_at = NULL
    WHERE job.bucket = v_object->>'bucket'
      AND job.object_path = v_object->>'object_path'
      AND job.owner_id = p_actor_user_id
      AND job.project_id = v_project_id;
  END LOOP;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_new_building_listing_with_storage_for_service(
  uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_new_building_listing_with_storage_for_service(
  uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.requeue_storage_cleanup_job(
  p_job_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.storage_cleanup_jobs AS job
  SET status = 'pending',
      attempts = 0,
      next_attempt_at = now(),
      last_error = NULL,
      completed_at = NULL,
      lease_token = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE job.id = p_job_id
    AND job.status = 'dead';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.requeue_storage_cleanup_job(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_storage_cleanup_job(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION private.notify_storage_cleanup_dead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status = 'dead' AND OLD.status IS DISTINCT FROM 'dead' THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    SELECT
      profile.user_id,
      'Storage cleanup requires attention',
      'Storage cleanup job exhausted retries: ' || NEW.id::text,
      'storage_cleanup_dead',
      '/admin'
    FROM public.profiles AS profile
    WHERE profile.is_platform_admin = true
       OR profile.role = 'admin'::public.user_role;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.notify_storage_cleanup_dead()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_notify_storage_cleanup_dead
  ON public.storage_cleanup_jobs;
CREATE TRIGGER trg_notify_storage_cleanup_dead
AFTER UPDATE OF status ON public.storage_cleanup_jobs
FOR EACH ROW
EXECUTE FUNCTION private.notify_storage_cleanup_dead();

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
      NULL;
  END;

  v_cron_secret := COALESCE(
    NULLIF(v_cron_secret, ''),
    NULLIF(current_setting('app.settings.cron_secret', true), '')
  );
  IF v_cron_secret IS NULL THEN
    RAISE EXCEPTION 'CRON_SECRET is missing for Storage cleanup';
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
        NULL;
    END;
  END IF;
  IF v_supabase_url IS NULL THEN
    RAISE EXCEPTION 'SUPABASE_URL is missing for Storage cleanup';
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
