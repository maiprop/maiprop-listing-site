-- PostgREST now exposes request claims through request.jwt.claims/auth.jwt().
-- Keep the legacy per-claim GUC only as a compatibility fallback.
CREATE OR REPLACE FUNCTION private.is_service_role_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT COALESCE(
    auth.jwt() ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), '')
  ) = 'service_role';
$$;

REVOKE ALL ON FUNCTION private.is_service_role_request()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_storage_cleanup_jobs(
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.storage_cleanup_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_service_role_request() THEN
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

REVOKE ALL ON FUNCTION public.claim_storage_cleanup_jobs(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_storage_cleanup_jobs(integer)
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
  IF NOT private.is_service_role_request() THEN
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
  IF NOT private.is_service_role_request() THEN
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
  IF NOT private.is_service_role_request() THEN
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
