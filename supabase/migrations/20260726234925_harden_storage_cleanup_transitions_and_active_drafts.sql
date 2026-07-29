-- Close the remaining Storage cleanup race, support project editor media,
-- reconcile pg_net outcomes, and align listing creation with active-only
-- quotas. All mutable cleanup transitions are serialized in PostgreSQL so an
-- Edge Function cannot overwrite an active worker lease.

ALTER TABLE public.storage_cleanup_jobs
  DROP CONSTRAINT IF EXISTS storage_cleanup_jobs_status_check;
ALTER TABLE public.storage_cleanup_jobs
  ADD CONSTRAINT storage_cleanup_jobs_status_check CHECK (
    status IN ('pending', 'held', 'processing', 'completed', 'dead')
  );

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
  WITH normalized AS (
    SELECT
      p_owner_id::text || '/' || p_project_id::text || '/' AS base_path,
      substring(
        p_object_path
        FROM length(p_owner_id::text || '/' || p_project_id::text || '/') + 1
      ) AS relative_path
  )
  SELECT
    p_owner_id IS NOT NULL
    AND p_project_id IS NOT NULL
    AND p_bucket IN ('listing-images', 'project-media')
    AND p_object_path LIKE normalized.base_path || '%'
    AND p_object_path NOT LIKE '%..%'
    AND p_object_path NOT LIKE E'%\\%'
    AND (
      (
        normalized.relative_path LIKE 'create/%'
        AND length(normalized.relative_path) > length('create/')
        AND position('/' IN substring(
          normalized.relative_path FROM length('create/') + 1
        )) = 0
      )
      OR (
        p_bucket = 'project-media'
        AND normalized.relative_path LIKE 'media/%'
        AND length(normalized.relative_path) > length('media/')
        AND position('/' IN substring(
          normalized.relative_path FROM length('media/') + 1
        )) = 0
      )
      OR (
        -- Existing editor uploads used owner/project/file. Keep those exact
        -- objects deletable while new uploads move to owner/project/media/file.
        p_bucket = 'project-media'
        AND normalized.relative_path <> ''
        AND position('/' IN normalized.relative_path) = 0
      )
    )
  FROM normalized;
$$;

REVOKE ALL ON FUNCTION private.storage_cleanup_path_is_valid(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.storage_cleanup_path_is_valid(
  uuid, uuid, text, text
) TO service_role;

ALTER TABLE public.storage_cleanup_jobs
  DROP CONSTRAINT IF EXISTS storage_cleanup_jobs_path_scope_check;
ALTER TABLE public.storage_cleanup_jobs
  ADD CONSTRAINT storage_cleanup_jobs_path_scope_check CHECK (
    private.storage_cleanup_path_is_valid(
      owner_id,
      project_id,
      bucket,
      object_path
    )
  );

CREATE OR REPLACE FUNCTION private.storage_cleanup_expected_public_url(
  p_bucket text,
  p_object_path text
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_supabase_url text := NULLIF(
    current_setting('app.settings.supabase_url', true),
    ''
  );
BEGIN
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
    RAISE EXCEPTION 'storage_cleanup_origin_unavailable'
      USING ERRCODE = '55000';
  END IF;

  RETURN rtrim(v_supabase_url, '/')
    || '/storage/v1/object/public/'
    || p_bucket
    || '/'
    || p_object_path;
END;
$$;

REVOKE ALL ON FUNCTION private.storage_cleanup_expected_public_url(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

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
  v_job_found boolean;
  v_expected_url text;
  v_owner_active integer;
  v_project_active integer;
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

  v_expected_url := private.storage_cleanup_expected_public_url(
    p_bucket,
    p_object_path
  );
  IF p_object_url IS DISTINCT FROM v_expected_url THEN
    RAISE EXCEPTION 'storage_upload_url_invalid' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('storage-upload-owner:' || v_actor::text, 0)
  );
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
  v_job_found := FOUND;

  IF v_job_found AND v_job.status IN ('held', 'processing') THEN
    RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
  END IF;
  IF v_job_found AND (
    v_job.owner_id IS DISTINCT FROM v_actor
    OR v_job.project_id IS DISTINCT FROM p_project_id
  ) THEN
    RAISE EXCEPTION 'storage_upload_identity_conflict' USING ERRCODE = '42501';
  END IF;

  IF NOT v_job_found
     OR v_job.status IN ('completed', 'dead') THEN
    SELECT
      count(*) FILTER (
        WHERE status IN ('pending', 'held', 'processing')
      ),
      count(*) FILTER (
        WHERE project_id = p_project_id
          AND status IN ('pending', 'held', 'processing')
      )
    INTO v_owner_active, v_project_active
    FROM public.storage_cleanup_jobs
    WHERE owner_id = v_actor;

    IF v_owner_active >= 2000 THEN
      RAISE EXCEPTION 'storage_cleanup_owner_limit_reached'
        USING ERRCODE = '54000';
    END IF;
    IF v_project_active >= 300 THEN
      RAISE EXCEPTION 'storage_cleanup_project_limit_reached'
        USING ERRCODE = '54000';
    END IF;
  END IF;

  IF NOT v_job_found THEN
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
    RETURNING * INTO v_job;
  ELSE
    UPDATE public.storage_cleanup_jobs AS job
    SET object_url = p_object_url,
        reason = 'new_build_upload',
        status = 'pending',
        attempts = 0,
        next_attempt_at = now() + interval '24 hours',
        last_error = NULL,
        completed_at = NULL,
        lease_token = NULL,
        lease_expires_at = NULL,
        updated_at = now()
    WHERE job.id = v_job.id
    RETURNING * INTO v_job;
  END IF;

  RETURN v_job.id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_new_building_storage_upload(
  uuid, text, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_new_building_storage_upload(
  uuid, text, text, text
) TO authenticated;

CREATE OR REPLACE FUNCTION public.stage_storage_cleanup_jobs_for_service(
  p_owner_id uuid,
  p_project_id uuid,
  p_reason text,
  p_objects jsonb,
  p_mode text DEFAULT 'enqueue',
  p_last_error text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_object jsonb;
  v_existing public.storage_cleanup_jobs%ROWTYPE;
  v_target_status text;
  v_expected_url text;
  v_count integer := 0;
BEGIN
  IF NOT private.is_service_role_request() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_owner_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'storage_cleanup_identity_required' USING ERRCODE = '22023';
  END IF;
  IF p_mode NOT IN ('enqueue', 'hold') THEN
    RAISE EXCEPTION 'storage_cleanup_stage_mode_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_objects IS NULL OR jsonb_typeof(p_objects) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'storage_cleanup_objects_invalid' USING ERRCODE = '22023';
  END IF;

  v_target_status := CASE WHEN p_mode = 'hold' THEN 'held' ELSE 'pending' END;

  FOR v_object IN SELECT value FROM jsonb_array_elements(p_objects)
  LOOP
    IF NOT private.storage_cleanup_path_is_valid(
      p_owner_id,
      p_project_id,
      v_object->>'bucket',
      v_object->>'object_path'
    ) THEN
      RAISE EXCEPTION 'storage_upload_path_invalid' USING ERRCODE = '22023';
    END IF;

    v_expected_url := private.storage_cleanup_expected_public_url(
      v_object->>'bucket',
      v_object->>'object_path'
    );
    IF v_object->>'object_url' IS DISTINCT FROM v_expected_url THEN
      RAISE EXCEPTION 'storage_upload_url_invalid' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'storage-upload:'
          || (v_object->>'bucket')
          || ':'
          || (v_object->>'object_path'),
        0
      )
    );

    SELECT job.*
    INTO v_existing
    FROM public.storage_cleanup_jobs AS job
    WHERE job.bucket = v_object->>'bucket'
      AND job.object_path = v_object->>'object_path'
    FOR UPDATE;

    IF FOUND AND v_existing.status = 'processing' THEN
      RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
    END IF;
    IF FOUND
       AND v_existing.status = 'held'
       AND p_mode <> 'hold' THEN
      RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
    END IF;
    IF FOUND AND (
      v_existing.owner_id IS DISTINCT FROM p_owner_id
      OR v_existing.project_id IS DISTINCT FROM p_project_id
    ) THEN
      RAISE EXCEPTION 'storage_upload_identity_conflict' USING ERRCODE = '42501';
    END IF;

    IF FOUND THEN
      UPDATE public.storage_cleanup_jobs AS job
      SET object_url = v_expected_url,
          reason = p_reason,
          status = v_target_status,
          attempts = 0,
          next_attempt_at = now(),
          last_error = left(p_last_error, 1000),
          completed_at = NULL,
          lease_token = NULL,
          lease_expires_at = NULL,
          updated_at = now()
      WHERE job.id = v_existing.id;
    ELSE
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
        v_object->>'bucket',
        v_object->>'object_path',
        v_expected_url,
        p_owner_id,
        p_project_id,
        p_reason,
        v_target_status,
        0,
        now(),
        left(p_last_error, 1000),
        NULL,
        NULL,
        NULL,
        now()
      );
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.stage_storage_cleanup_jobs_for_service(
  uuid, uuid, text, jsonb, text, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_storage_cleanup_jobs_for_service(
  uuid, uuid, text, jsonb, text, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.settle_storage_cleanup_jobs_for_service(
  p_owner_id uuid,
  p_project_id uuid,
  p_objects jsonb,
  p_outcome text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_object jsonb;
  v_existing public.storage_cleanup_jobs%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF NOT private.is_service_role_request() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_outcome NOT IN ('release', 'complete') THEN
    RAISE EXCEPTION 'storage_cleanup_outcome_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_objects IS NULL OR jsonb_typeof(p_objects) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'storage_cleanup_objects_invalid' USING ERRCODE = '22023';
  END IF;

  FOR v_object IN SELECT value FROM jsonb_array_elements(p_objects)
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'storage-upload:'
          || (v_object->>'bucket')
          || ':'
          || (v_object->>'object_path'),
        0
      )
    );
    SELECT job.*
    INTO v_existing
    FROM public.storage_cleanup_jobs AS job
    WHERE job.bucket = v_object->>'bucket'
      AND job.object_path = v_object->>'object_path'
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'storage_cleanup_job_missing' USING ERRCODE = '55000';
    END IF;
    IF v_existing.owner_id IS DISTINCT FROM p_owner_id
       OR v_existing.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'storage_upload_identity_conflict' USING ERRCODE = '42501';
    END IF;
    IF v_existing.status = 'processing' THEN
      RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
    END IF;

    IF p_outcome = 'release' THEN
      IF v_existing.status NOT IN ('held', 'pending') THEN
        RAISE EXCEPTION 'storage_cleanup_not_held' USING ERRCODE = '55000';
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
      WHERE job.id = v_existing.id;
    ELSE
      UPDATE public.storage_cleanup_jobs AS job
      SET status = 'completed',
          completed_at = now(),
          last_error = NULL,
          lease_token = NULL,
          lease_expires_at = NULL,
          updated_at = now()
      WHERE job.id = v_existing.id;
    END IF;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_storage_cleanup_jobs_for_service(
  uuid, uuid, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_storage_cleanup_jobs_for_service(
  uuid, uuid, jsonb, text
) TO service_role;

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
    ) OR (
      -- A project deletion can commit while the Edge response is lost. Held
      -- jobs become recoverable after the request window; prepare() preserves
      -- them if the database reference still exists.
      job.status = 'held'
      AND job.updated_at <= now() - interval '15 minutes'
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
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_storage_cleanup_jobs(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.is_storage_object_committed(
  p_bucket text,
  p_object_path text,
  p_object_url text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    p_object_url = private.storage_cleanup_expected_public_url(
      p_bucket,
      p_object_path
    )
    AND CASE p_bucket
      WHEN 'project-media' THEN EXISTS (
        SELECT 1
        FROM public.project_media AS media
        WHERE media.url = p_object_url
      )
      WHEN 'listing-images' THEN (
        EXISTS (
          SELECT 1
          FROM public.listings AS listing
          WHERE listing.cover_image_url = p_object_url
        )
        OR EXISTS (
          SELECT 1
          FROM public.listing_images AS image
          WHERE image.url = p_object_url
        )
      )
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION public.is_storage_object_committed(text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_storage_object_committed(text, text, text)
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

  IF public.is_storage_object_committed(
    job.bucket,
    job.object_path,
    job.object_url
  ) THEN
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
  IF NOT FOUND THEN
    RETURN 'lost';
  END IF;
  RETURN 'delete';
END;
$$;

DROP FUNCTION IF EXISTS public.is_storage_object_committed(text, text);

CREATE OR REPLACE FUNCTION private.check_listing_quota_for_owner(
  p_owner_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit integer;
  v_count integer;
BEGIN
  IF p_owner_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('listing_quota:' || p_owner_user_id::text)
  );

  v_limit := public.get_listing_limit(p_owner_user_id);
  IF v_limit >= 999 THEN
    RETURN true;
  END IF;
  IF v_limit <= 0 THEN
    RETURN false;
  END IF;

  SELECT count(*)
  INTO v_count
  FROM public.listings AS listing
  WHERE listing.owner_id = p_owner_user_id
    AND listing.organization_id IS NULL
    AND listing.status = 'active'::public.listing_status;

  RETURN v_count < v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION private.check_listing_quota_for_principal(
  p_owner_user_id uuid,
  p_organization_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan text;
BEGIN
  IF p_organization_id IS NULL THEN
    RETURN private.check_listing_quota_for_owner(p_owner_user_id);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('organization_listing_plan:' || p_organization_id::text)
  );

  SELECT organization.plan
  INTO v_plan
  FROM public.organizations AS organization
  WHERE organization.id = p_organization_id;

  RETURN COALESCE(v_plan IN ('pro', 'enterprise', 'internal'), false);
END;
$$;

REVOKE ALL ON FUNCTION private.check_listing_quota_for_owner(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.check_listing_quota_for_principal(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION private.check_listing_quota_for_owner(uuid) IS
  'Personal plan guard. Only active listings without an organization consume the user allowance.';
COMMENT ON FUNCTION private.check_listing_quota_for_principal(uuid, uuid) IS
  'Routes personal inventory to user quota and organization inventory to a service-controlled paid tenant plan.';

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
  v_manifest_mismatch boolean;
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

  IF NOT v_existing
     AND NOT private.check_listing_quota_for_principal(
       p_actor_user_id,
       p_organization_id
     ) THEN
    IF p_organization_id IS NULL THEN
      RAISE EXCEPTION 'listing_limit_reached'
        USING HINT = 'Upgrade to Pro for more active listings';
    END IF;
    RAISE EXCEPTION 'organization_listing_plan_required'
      USING ERRCODE = '42501',
        HINT = 'Activate a paid organization plan before publishing tenant inventory';
  END IF;

  WITH registered_urls AS (
    SELECT private.storage_cleanup_expected_public_url(
      object.value->>'bucket',
      object.value->>'object_path'
    ) AS object_url
    FROM jsonb_array_elements(p_storage_objects) AS object(value)
  ),
  committed_urls AS (
    SELECT media.value->>'url' AS object_url
    FROM jsonb_array_elements(p_project_media) AS media(value)
    UNION ALL
    SELECT p_listing->>'cover_image_url'
    UNION ALL
    SELECT image.value
    FROM jsonb_array_elements_text(p_additional_image_urls) AS image(value)
  ),
  manifest_delta AS (
    (
      SELECT object_url FROM registered_urls
      EXCEPT ALL
      SELECT object_url FROM committed_urls
    )
    UNION ALL
    (
      SELECT object_url FROM committed_urls
      EXCEPT ALL
      SELECT object_url FROM registered_urls
    )
  )
  SELECT EXISTS (SELECT 1 FROM manifest_delta)
  INTO v_manifest_mismatch;

  IF v_manifest_mismatch THEN
    RAISE EXCEPTION 'storage_upload_manifest_mismatch'
      USING ERRCODE = '22023';
  END IF;

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
    IF v_job.status IN ('held', 'processing') THEN
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
    IF public.is_storage_object_committed(
      v_object->>'bucket',
      v_object->>'object_path',
      private.storage_cleanup_expected_public_url(
        v_object->>'bucket',
        v_object->>'object_path'
      )
    ) THEN
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
    ELSE
      UPDATE public.storage_cleanup_jobs AS job
      SET status = 'pending',
          next_attempt_at = now(),
          completed_at = NULL,
          updated_at = now(),
          last_error = 'storage_upload_unreferenced_after_atomic_create',
          lease_token = NULL,
          lease_expires_at = NULL
      WHERE job.bucket = v_object->>'bucket'
        AND job.object_path = v_object->>'object_path'
        AND job.owner_id = p_actor_user_id
        AND job.project_id = v_project_id;
    END IF;
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

CREATE OR REPLACE FUNCTION public.attach_project_media_for_service(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_media jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_job public.storage_cleanup_jobs%ROWTYPE;
  v_media public.project_media%ROWTYPE;
  v_url text := NULLIF(BTRIM(p_media->>'url'), '');
BEGIN
  IF NOT private.is_service_role_request() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_user_id IS NULL OR p_project_id IS NULL OR v_url IS NULL THEN
    RAISE EXCEPTION 'storage_attachment_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT project.*
  INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id;
  IF NOT FOUND OR NOT (
    (
      v_project.organization_id IS NULL
      AND v_project.owner_id = p_actor_user_id
    ) OR (
      v_project.organization_id IS NOT NULL
      AND private.has_org_permission(
        v_project.organization_id,
        'project:manage',
        p_actor_user_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'project_not_managed' USING ERRCODE = '42501';
  END IF;

  SELECT job.*
  INTO v_job
  FROM public.storage_cleanup_jobs AS job
  WHERE job.bucket = 'project-media'
    AND job.object_url = v_url
    AND job.owner_id = p_actor_user_id
    AND job.project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_upload_not_registered' USING ERRCODE = '55000';
  END IF;
  IF v_job.status <> 'pending' THEN
    RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
  END IF;
  IF v_job.object_url IS DISTINCT FROM private.storage_cleanup_expected_public_url(
    v_job.bucket,
    v_job.object_path
  ) THEN
    RAISE EXCEPTION 'storage_upload_url_invalid' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.project_media (
    project_id,
    url,
    media_type,
    title,
    sort_order
  )
  VALUES (
    p_project_id,
    v_url,
    NULLIF(BTRIM(p_media->>'media_type'), ''),
    NULLIF(BTRIM(p_media->>'title'), ''),
    COALESCE(NULLIF(p_media->>'sort_order', '')::integer, 0)
  )
  RETURNING * INTO v_media;

  UPDATE public.storage_cleanup_jobs AS job
  SET status = 'completed',
      completed_at = now(),
      updated_at = now(),
      last_error = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE job.id = v_job.id
    AND job.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
  END IF;

  RETURN to_jsonb(v_media);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_project_media_for_service(
  uuid, uuid, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_project_media_for_service(
  uuid, uuid, jsonb
) TO service_role;

CREATE OR REPLACE FUNCTION public.update_listing_cover_with_storage_for_service(
  p_actor_user_id uuid,
  p_project_id uuid,
  p_listing_id uuid,
  p_cover_image_url text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
  v_job public.storage_cleanup_jobs%ROWTYPE;
  v_listing public.listings%ROWTYPE;
BEGIN
  IF NOT private.is_service_role_request() THEN
    RAISE EXCEPTION 'service_role_required' USING ERRCODE = '42501';
  END IF;
  IF p_actor_user_id IS NULL
     OR p_project_id IS NULL
     OR p_listing_id IS NULL
     OR NULLIF(BTRIM(p_cover_image_url), '') IS NULL THEN
    RAISE EXCEPTION 'storage_attachment_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT project.*
  INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id;
  IF NOT FOUND OR NOT (
    (
      v_project.organization_id IS NULL
      AND v_project.owner_id = p_actor_user_id
    ) OR (
      v_project.organization_id IS NOT NULL
      AND private.has_org_permission(
        v_project.organization_id,
        'project:manage',
        p_actor_user_id
      )
    )
  ) THEN
    RAISE EXCEPTION 'project_not_managed' USING ERRCODE = '42501';
  END IF;

  SELECT job.*
  INTO v_job
  FROM public.storage_cleanup_jobs AS job
  WHERE job.bucket = 'listing-images'
    AND job.object_url = p_cover_image_url
    AND job.owner_id = p_actor_user_id
    AND job.project_id = p_project_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_upload_not_registered' USING ERRCODE = '55000';
  END IF;
  IF v_job.status <> 'pending' THEN
    RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
  END IF;
  IF v_job.object_url IS DISTINCT FROM private.storage_cleanup_expected_public_url(
    v_job.bucket,
    v_job.object_path
  ) THEN
    RAISE EXCEPTION 'storage_upload_url_invalid' USING ERRCODE = '22023';
  END IF;

  UPDATE public.listings AS listing
  SET cover_image_url = p_cover_image_url,
      updated_at = now()
  WHERE listing.id = p_listing_id
    AND listing.project_id = p_project_id
    AND listing.owner_id = v_project.owner_id
    AND listing.organization_id IS NOT DISTINCT FROM v_project.organization_id
  RETURNING * INTO v_listing;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing_not_in_project' USING ERRCODE = '42501';
  END IF;

  UPDATE public.storage_cleanup_jobs AS job
  SET status = 'completed',
      completed_at = now(),
      updated_at = now(),
      last_error = NULL,
      lease_token = NULL,
      lease_expires_at = NULL
  WHERE job.id = v_job.id
    AND job.status = 'pending';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'storage_cleanup_in_progress' USING ERRCODE = '55000';
  END IF;

  RETURN to_jsonb(v_listing);
END;
$$;

REVOKE ALL ON FUNCTION public.update_listing_cover_with_storage_for_service(
  uuid, uuid, uuid, text
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_listing_cover_with_storage_for_service(
  uuid, uuid, uuid, text
) TO service_role;

CREATE TABLE IF NOT EXISTS public.storage_cleanup_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id bigint UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  response_status integer,
  error_message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.storage_cleanup_invocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storage_cleanup_invocations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_cleanup_invocations
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_invocations_pending
  ON public.storage_cleanup_invocations (requested_at, request_id)
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION private.reconcile_storage_cleanup_invocations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invocation public.storage_cleanup_invocations%ROWTYPE;
  v_succeeded integer := 0;
  v_failed integer := 0;
  v_backlog boolean;
BEGIN
  FOR v_invocation IN
    WITH resolved AS (
      UPDATE public.storage_cleanup_invocations AS invocation
      SET status = CASE
            WHEN response.status_code BETWEEN 200 AND 299
              AND NOT response.timed_out
              AND response.error_msg IS NULL
            THEN 'succeeded'
            ELSE 'failed'
          END,
          response_status = response.status_code,
          error_message = CASE
            WHEN response.status_code BETWEEN 200 AND 299
              AND NOT response.timed_out
              AND response.error_msg IS NULL
            THEN NULL
            ELSE left(
              COALESCE(
                response.error_msg,
                response.content,
                'storage_cleanup_http_failed'
              ),
              1000
            )
          END,
          completed_at = now(),
          updated_at = now()
      FROM net._http_response AS response
      WHERE invocation.status = 'pending'
        AND response.id = invocation.request_id
      RETURNING invocation.*
    )
    SELECT * FROM resolved
  LOOP
    IF v_invocation.status = 'succeeded' THEN
      v_succeeded := v_succeeded + 1;
    ELSE
      v_failed := v_failed + 1;
      INSERT INTO public.notifications (user_id, title, body, type, link)
      SELECT
        profile.user_id,
        'Storage cleanup invocation failed',
        'Storage cleanup HTTP request failed: '
          || v_invocation.request_id::text,
        'storage_cleanup_http_failed',
        '/admin'
      FROM public.profiles AS profile
      WHERE profile.is_platform_admin = true
         OR profile.role = 'admin'::public.user_role;
    END IF;
  END LOOP;

  FOR v_invocation IN
    UPDATE public.storage_cleanup_invocations AS invocation
    SET status = 'failed',
        error_message = 'storage_cleanup_http_timeout',
        completed_at = now(),
        updated_at = now()
    WHERE invocation.status = 'pending'
      AND invocation.requested_at < now() - interval '10 minutes'
    RETURNING invocation.*
  LOOP
    v_failed := v_failed + 1;
    INSERT INTO public.notifications (user_id, title, body, type, link)
    SELECT
      profile.user_id,
      'Storage cleanup invocation timed out',
      'Storage cleanup HTTP request timed out: '
        || v_invocation.request_id::text,
      'storage_cleanup_http_failed',
      '/admin'
    FROM public.profiles AS profile
    WHERE profile.is_platform_admin = true
       OR profile.role = 'admin'::public.user_role;
  END LOOP;

  SELECT EXISTS (
    SELECT 1
    FROM public.storage_cleanup_jobs AS job
    WHERE (
      job.status = 'pending'
      AND job.next_attempt_at < now() - interval '15 minutes'
    ) OR (
      job.status = 'processing'
      AND COALESCE(job.lease_expires_at, job.updated_at)
        < now() - interval '15 minutes'
    ) OR (
      job.status = 'held'
      AND job.updated_at < now() - interval '15 minutes'
    )
  ) INTO v_backlog;

  IF v_backlog
     AND NOT EXISTS (
       SELECT 1
       FROM public.notifications AS notification
       WHERE notification.type = 'storage_cleanup_backlog'
         AND notification.created_at > now() - interval '1 hour'
     ) THEN
    INSERT INTO public.notifications (user_id, title, body, type, link)
    SELECT
      profile.user_id,
      'Storage cleanup backlog detected',
      'Storage cleanup contains stale pending or processing jobs.',
      'storage_cleanup_backlog',
      '/admin'
    FROM public.profiles AS profile
    WHERE profile.is_platform_admin = true
       OR profile.role = 'admin'::public.user_role;
  END IF;

  RETURN jsonb_build_object(
    'succeeded', v_succeeded,
    'failed', v_failed,
    'backlog', v_backlog
  );
END;
$$;

REVOKE ALL ON FUNCTION private.reconcile_storage_cleanup_invocations()
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.prune_storage_cleanup_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.storage_cleanup_jobs
  WHERE status = 'completed'
    AND completed_at < now() - interval '30 days';

  DELETE FROM public.storage_cleanup_invocations
  WHERE (
    status = 'succeeded'
    AND completed_at < now() - interval '30 days'
  ) OR (
    status = 'failed'
    AND completed_at < now() - interval '180 days'
  );
END;
$$;

REVOKE ALL ON FUNCTION private.prune_storage_cleanup_history()
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.invoke_storage_cleanup_cron();
CREATE OR REPLACE FUNCTION public.invoke_storage_cleanup_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cron_secret text := NULL;
  v_supabase_url text := NULL;
  v_request_id bigint;
BEGIN
  PERFORM private.reconcile_storage_cleanup_invocations();
  PERFORM private.prune_storage_cleanup_history();

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

  v_supabase_url := NULLIF(
    current_setting('app.settings.supabase_url', true),
    ''
  );
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

  v_request_id := net.http_post(
    url := rtrim(v_supabase_url, '/')
      || '/functions/v1/process-storage-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb
  );

  INSERT INTO public.storage_cleanup_invocations (request_id)
  VALUES (v_request_id);

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.invoke_storage_cleanup_cron()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoke_storage_cleanup_cron()
  TO service_role;

DO $$
DECLARE
  existing_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron is unavailable; Storage cleanup reconciliation was not scheduled';
    RETURN;
  END IF;

  FOR existing_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'storage-cleanup-health-reconcile'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'storage-cleanup-health-reconcile',
    '*/5 * * * *',
    'SELECT private.reconcile_storage_cleanup_invocations();'
  );
END;
$$;

CREATE OR REPLACE FUNCTION private.update_listing_for_actor(
  p_id uuid,
  p_updates jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_existing public.listings%ROWTYPE;
  v_updates jsonb;
  v_keys text[];
  v_assignments text;
  v_row public.listings%ROWTYPE;
  v_target_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  PERFORM private.assert_listing_payload_keys(p_updates);

  SELECT listing.*
  INTO v_existing
  FROM public.listings AS listing
  WHERE listing.id = p_id
  FOR UPDATE;

  IF NOT FOUND OR NOT private.can_manage_listing(p_id, v_actor) THEN
    RAISE EXCEPTION 'listing_not_managed' USING ERRCODE = '42501';
  END IF;

  IF p_updates ? 'listing_type'
     AND p_updates->>'listing_type' = 'new_build'
     AND v_existing.listing_type::text <> 'new_build' THEN
    RAISE EXCEPTION 'new_build_requires_project_boundary' USING ERRCODE = '42501';
  END IF;

  v_updates := p_updates - 'price_per_sqm';
  SELECT array_agg(key_name ORDER BY key_name)
  INTO v_keys
  FROM jsonb_object_keys(v_updates) AS key_name
  WHERE key_name = ANY (private.listing_client_writable_columns())
    AND key_name <> 'price_per_sqm';

  IF v_keys IS NULL OR cardinality(v_keys) = 0 THEN
    RAISE EXCEPTION 'listing_update_empty' USING ERRCODE = '22023';
  END IF;

  v_target_status := COALESCE(v_updates->>'status', v_existing.status::text);
  IF v_existing.status::text <> 'active'
     AND v_target_status = 'active'
     AND NOT private.check_listing_quota_for_principal(
       v_existing.owner_id,
       v_existing.organization_id
     ) THEN
    IF v_existing.organization_id IS NULL THEN
      RAISE EXCEPTION 'listing_limit_reached'
        USING ERRCODE = 'P0001',
          HINT = 'Upgrade to Pro for more active listings';
    END IF;
    RAISE EXCEPTION 'organization_listing_plan_required'
      USING ERRCODE = '42501',
        HINT = 'Activate a paid organization plan before publishing tenant inventory';
  END IF;

  SELECT string_agg(
    format('%1$I = (jsonb_populate_record(listing, $2)).%1$I', key_name),
    ', '
  )
  INTO v_assignments
  FROM unnest(v_keys) AS key_name;

  IF v_updates ? 'price' OR v_updates ? 'sqm' THEN
    v_assignments := v_assignments || ', price_per_sqm = CASE'
      || ' WHEN COALESCE((jsonb_populate_record(listing, $2)).price, 0) > 0'
      || ' AND COALESCE((jsonb_populate_record(listing, $2)).sqm, 0) > 0'
      || ' THEN round((jsonb_populate_record(listing, $2)).price'
      || ' / (jsonb_populate_record(listing, $2)).sqm) ELSE NULL END';
  END IF;

  EXECUTE format(
    'UPDATE public.listings AS listing SET %s '
      || 'WHERE listing.id = $1 RETURNING listing.*',
    v_assignments
  )
  USING p_id, v_updates
  INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'owner_id', v_row.owner_id,
    'organization_id', v_row.organization_id,
    'status', v_row.status,
    'listing_type', v_row.listing_type,
    'updated_at', v_row.updated_at
  );
END;
$$;

REVOKE ALL ON FUNCTION private.update_listing_for_actor(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.update_listing_for_actor(uuid, jsonb)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.check_listing_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
  v_limit integer;
BEGIN
  -- Trusted service paths own their own entitlement checks.
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'listing_owner_must_match_actor'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.organization_id IS NULL THEN
    v_limit := public.get_listing_limit(NEW.owner_id);
    IF v_limit <= 0 THEN
      RAISE EXCEPTION 'listing_not_allowed'
        USING HINT = 'Your account type cannot create listings';
    END IF;

    IF NEW.status = 'active'::public.listing_status
       AND NOT private.check_listing_quota_for_principal(
         NEW.owner_id,
         NULL
       ) THEN
      RAISE EXCEPTION 'listing_limit_reached'
        USING HINT = 'Upgrade to Pro for more active listings';
    END IF;
  ELSE
    IF NOT private.has_org_permission(
      NEW.organization_id,
      'listing:manage',
      v_actor
    ) THEN
      RAISE EXCEPTION 'organization_listing_not_managed'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'active'::public.listing_status
       AND NOT private.check_listing_quota_for_principal(
         NEW.owner_id,
         NEW.organization_id
       ) THEN
      RAISE EXCEPTION 'organization_listing_plan_required'
        USING ERRCODE = '42501',
          HINT = 'Activate a paid organization plan before publishing tenant inventory';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
