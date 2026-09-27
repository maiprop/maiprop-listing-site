-- Task7b: selected forward capability bundle. No scheduler or activation.
-- Deliberately leaves shared check_listing_limit and old overloads untouched.
BEGIN;

DO $preflight$ BEGIN
  IF to_regclass('public.storage_cleanup_invocations') IS NOT NULL THEN
    IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.storage_cleanup_invocations'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[{"name":"id","type":"uuid","default":"gen_random_uuid()","not_null":true},{"name":"request_id","type":"bigint","default":null,"not_null":true},{"name":"status","type":"text","default":"''pending''::text","not_null":true},{"name":"response_status","type":"integer","default":null,"not_null":false},{"name":"error_message","type":"text","default":null,"not_null":false},{"name":"requested_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"completed_at","type":"timestamp with time zone","default":null,"not_null":false},{"name":"updated_at","type":"timestamp with time zone","default":"now()","not_null":true}]'::jsonb THEN RAISE EXCEPTION 'storage_capability_column_conflict: storage_cleanup_invocations'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_invocations'::regclass AND conname='storage_cleanup_invocations_pkey' AND convalidated AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_invocations_pkey'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_invocations'::regclass AND conname='storage_cleanup_invocations_request_id_key' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (request_id)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_invocations_request_id_key'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_invocations'::regclass AND conname='storage_cleanup_invocations_status_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''pending''::text, ''succeeded''::text, ''failed''::text])))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_invocations_status_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_storage_cleanup_invocations_pending') AND indrelid='public.storage_cleanup_invocations'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE INDEX idx_storage_cleanup_invocations_pending ON public.storage_cleanup_invocations USING btree (requested_at, request_id) WHERE (status = ''pending''::text)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: idx_storage_cleanup_invocations_pending'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_invocations_pkey') AND indrelid='public.storage_cleanup_invocations'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_invocations_pkey ON public.storage_cleanup_invocations USING btree (id)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_invocations_pkey'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_invocations_request_id_key') AND indrelid='public.storage_cleanup_invocations'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_invocations_request_id_key ON public.storage_cleanup_invocations USING btree (request_id)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_invocations_request_id_key'; END IF;
  END IF;
END $preflight$;
DO $preflight$ BEGIN
  IF to_regclass('public.storage_cleanup_jobs') IS NOT NULL THEN
    IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.storage_cleanup_jobs'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[{"name":"id","type":"uuid","default":"gen_random_uuid()","not_null":true},{"name":"bucket","type":"text","default":null,"not_null":true},{"name":"object_path","type":"text","default":null,"not_null":true},{"name":"object_url","type":"text","default":null,"not_null":true},{"name":"owner_id","type":"uuid","default":null,"not_null":true},{"name":"project_id","type":"uuid","default":null,"not_null":true},{"name":"reason","type":"text","default":null,"not_null":true},{"name":"status","type":"text","default":"''pending''::text","not_null":true},{"name":"attempts","type":"integer","default":"0","not_null":true},{"name":"next_attempt_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"last_error","type":"text","default":null,"not_null":false},{"name":"created_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"updated_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"completed_at","type":"timestamp with time zone","default":null,"not_null":false},{"name":"lease_token","type":"uuid","default":null,"not_null":false},{"name":"lease_expires_at","type":"timestamp with time zone","default":null,"not_null":false}]'::jsonb THEN RAISE EXCEPTION 'storage_capability_column_conflict: storage_cleanup_jobs'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_attempts_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((attempts >= 0))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_attempts_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_bucket_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((bucket = ANY (ARRAY[''listing-images''::text, ''project-media''::text])))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_bucket_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_bucket_object_path_key' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (bucket, object_path)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_bucket_object_path_key'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_path_scope_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK (private.storage_cleanup_path_is_valid(owner_id, project_id, bucket, object_path))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_path_scope_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_pkey' AND convalidated AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_pkey'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_status_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''pending''::text, ''held''::text, ''processing''::text, ''completed''::text, ''dead''::text])))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_status_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_url_identity_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK (("right"(object_url, length((((''/storage/v1/object/public/''::text || bucket) || ''/''::text) || object_path))) = (((''/storage/v1/object/public/''::text || bucket) || ''/''::text) || object_path)))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_url_identity_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_storage_cleanup_jobs_claim') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE INDEX idx_storage_cleanup_jobs_claim ON public.storage_cleanup_jobs USING btree (next_attempt_at, created_at, id) WHERE (status = ''pending''::text)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: idx_storage_cleanup_jobs_claim'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_storage_cleanup_jobs_processing_lease') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE INDEX idx_storage_cleanup_jobs_processing_lease ON public.storage_cleanup_jobs USING btree (lease_expires_at, updated_at, id) WHERE (status = ''processing''::text)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: idx_storage_cleanup_jobs_processing_lease'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_jobs_bucket_object_path_key') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_jobs_bucket_object_path_key ON public.storage_cleanup_jobs USING btree (bucket, object_path)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_jobs_bucket_object_path_key'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_jobs_pkey') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_jobs_pkey ON public.storage_cleanup_jobs USING btree (id)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_jobs_pkey'; END IF;
  END IF;
END $preflight$;
CREATE TABLE IF NOT EXISTS private.storage_cleanup_rollout_control (singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton), cleanup_enabled boolean NOT NULL DEFAULT false);
DO $gate_layout$ BEGIN
  IF (SELECT count(*) FROM pg_attribute WHERE attrelid='private.storage_cleanup_rollout_control'::regclass AND attnum>0 AND NOT attisdropped)<>2
    OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='private.storage_cleanup_rollout_control'::regclass AND attname='singleton' AND atttypid='boolean'::regtype AND attnotnull)
    OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='private.storage_cleanup_rollout_control'::regclass AND attname='cleanup_enabled' AND atttypid='boolean'::regtype AND attnotnull)
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.storage_cleanup_rollout_control'::regclass AND contype='p' AND pg_get_constraintdef(oid)='PRIMARY KEY (singleton)')
    OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.storage_cleanup_rollout_control'::regclass AND contype='c' AND convalidated AND pg_get_constraintdef(oid)='CHECK (singleton)')
  THEN RAISE EXCEPTION 'storage_capability_rollout_control_conflict'; END IF;
END $gate_layout$;
ALTER TABLE private.storage_cleanup_rollout_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.storage_cleanup_rollout_control FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO private.storage_cleanup_rollout_control(singleton,cleanup_enabled) VALUES(true,false) ON CONFLICT (singleton) DO NOTHING;
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
REVOKE ALL ON FUNCTION private.storage_cleanup_path_is_valid(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.storage_cleanup_path_is_valid(uuid, uuid, text, text) TO service_role;
CREATE TABLE IF NOT EXISTS public.storage_cleanup_invocations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  request_id bigint NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  response_status integer,
  error_message text,
  requested_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT storage_cleanup_invocations_pkey PRIMARY KEY (id),
  CONSTRAINT storage_cleanup_invocations_request_id_key UNIQUE (request_id),
  CONSTRAINT storage_cleanup_invocations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'succeeded'::text, 'failed'::text])))
);
ALTER TABLE public.storage_cleanup_invocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storage_cleanup_invocations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_cleanup_invocations TO service_role;
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_invocations_pending ON public.storage_cleanup_invocations USING btree (requested_at, request_id) WHERE (status = 'pending'::text);
CREATE TABLE IF NOT EXISTS public.storage_cleanup_jobs (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  bucket text NOT NULL,
  object_path text NOT NULL,
  object_url text NOT NULL,
  owner_id uuid NOT NULL,
  project_id uuid NOT NULL,
  reason text NOT NULL,
  status text DEFAULT 'pending'::text NOT NULL,
  attempts integer DEFAULT 0 NOT NULL,
  next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
  last_error text,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  completed_at timestamp with time zone,
  lease_token uuid,
  lease_expires_at timestamp with time zone,
  CONSTRAINT storage_cleanup_jobs_attempts_check CHECK ((attempts >= 0)),
  CONSTRAINT storage_cleanup_jobs_bucket_check CHECK ((bucket = ANY (ARRAY['listing-images'::text, 'project-media'::text]))),
  CONSTRAINT storage_cleanup_jobs_bucket_object_path_key UNIQUE (bucket, object_path),
  CONSTRAINT storage_cleanup_jobs_path_scope_check CHECK (private.storage_cleanup_path_is_valid(owner_id, project_id, bucket, object_path)),
  CONSTRAINT storage_cleanup_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT storage_cleanup_jobs_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'held'::text, 'processing'::text, 'completed'::text, 'dead'::text]))),
  CONSTRAINT storage_cleanup_jobs_url_identity_check CHECK (("right"(object_url, length(((('/storage/v1/object/public/'::text || bucket) || '/'::text) || object_path))) = ((('/storage/v1/object/public/'::text || bucket) || '/'::text) || object_path)))
);
ALTER TABLE public.storage_cleanup_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storage_cleanup_jobs FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.storage_cleanup_jobs TO service_role;
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_jobs_claim ON public.storage_cleanup_jobs USING btree (next_attempt_at, created_at, id) WHERE (status = 'pending'::text);
CREATE INDEX IF NOT EXISTS idx_storage_cleanup_jobs_processing_lease ON public.storage_cleanup_jobs USING btree (lease_expires_at, updated_at, id) WHERE (status = 'processing'::text);

-- Selected definition: 20260726181627; explicit ACLs (no history inheritance).
CREATE OR REPLACE FUNCTION private.can_manage_project(
  p_project_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = p_project_id
        AND (
          (
            project.organization_id IS NULL
            AND project.owner_id = p_user_id
          )
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              p_user_id
            )
          )
          OR private.has_platform_admin(p_user_id)
        )
    ),
    false
  )
$$;
REVOKE ALL ON FUNCTION private.can_manage_project(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_project(uuid, uuid) TO service_role;

-- Selected definition: 20260726181627; explicit ACLs (no history inheritance).
CREATE OR REPLACE FUNCTION public.get_project_management_context_for_service(
  p_project_id uuid,
  p_actor_user_id uuid
)
RETURNS TABLE (
  id uuid,
  owner_id uuid,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT project.id, project.owner_id, project.organization_id
  FROM public.projects AS project
  WHERE project.id = p_project_id
    AND private.can_manage_project(project.id, p_actor_user_id)
$$;
REVOKE ALL ON FUNCTION public.get_project_management_context_for_service(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_management_context_for_service(uuid, uuid) TO service_role;

-- Selected definition: 20260726181627; explicit ACLs (no history inheritance).
CREATE OR REPLACE FUNCTION public.delete_project_for_service(
  p_project_id uuid,
  p_actor_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project public.projects%ROWTYPE;
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  SELECT project.*
  INTO v_project
  FROM public.projects AS project
  WHERE project.id = p_project_id
  FOR UPDATE;

  IF NOT FOUND
     OR NOT private.can_manage_project(p_project_id, p_actor_user_id) THEN
    RAISE EXCEPTION 'project_not_managed' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.listings AS listing
    WHERE listing.project_id = p_project_id
      AND (
        (
          v_project.organization_id IS NULL
          AND (
            listing.organization_id IS NOT NULL
            OR listing.owner_id IS DISTINCT FROM v_project.owner_id
          )
        )
        OR (
          v_project.organization_id IS NOT NULL
          AND listing.organization_id IS DISTINCT FROM v_project.organization_id
        )
      )
  ) THEN
    RAISE EXCEPTION 'project_listing_tenant_mismatch'
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.listings
  SET
    project_id = NULL,
    listing_type = 'sale'::public.listing_type,
    is_pre_sale = false
  WHERE project_id = p_project_id;

  DELETE FROM public.projects
  WHERE id = p_project_id;

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_project_for_service(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_project_for_service(uuid, uuid) TO service_role;

-- Selected definition: 20260726211816; explicit ACLs (no history inheritance).
CREATE OR REPLACE FUNCTION private.can_manage_listing(
  p_listing_id uuid,
  p_actor_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    p_actor_user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.id = p_listing_id
        AND (
          (
            listing.organization_id IS NULL
            AND listing.owner_id = p_actor_user_id
          )
          OR (
            listing.organization_id IS NOT NULL
            AND private.has_org_permission(
              listing.organization_id,
              'listing:manage',
              p_actor_user_id
            )
          )
        )
    ),
    false
  )
$$;
REVOKE ALL ON FUNCTION private.can_manage_listing(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_listing(uuid, uuid) TO service_role;

-- Selected definition: 20260726182846; explicit ACLs (no history inheritance).
CREATE OR REPLACE FUNCTION public.create_new_building_listing_for_service(
  p_actor_user_id uuid,
  p_organization_id uuid,
  p_project_kind text,
  p_project jsonb,
  p_units jsonb,
  p_project_media jsonb,
  p_listing jsonb,
  p_additional_image_urls jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_project_id uuid;
  v_listing_id uuid;
  v_existing_project public.projects%ROWTYPE;
  v_unit jsonb;
  v_media jsonb;
  v_image jsonb;
  v_representative jsonb;
  v_image_index integer := 0;
  v_permit_approval_date date;
  v_construction_start_date date;
  v_structural_completion_date date;
  v_delivery_date date;
  v_construction_year integer;
  v_renovation_year integer;
  v_construction_status text;
  v_year_built integer;
  v_tags text[];
BEGIN
  IF p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '42501';
  END IF;

  IF p_project_kind NOT IN ('new_build', 'renovation') THEN
    RAISE EXCEPTION 'project_kind_invalid' USING ERRCODE = '22023';
  END IF;

  IF NOT private.has_developer_listing_access(p_actor_user_id) THEN
    RAISE EXCEPTION 'developer_pro_required' USING ERRCODE = '42501';
  END IF;

  IF p_organization_id IS NOT NULL
     AND NOT private.has_org_permission(
       p_organization_id,
       'project:manage',
       p_actor_user_id
     ) THEN
    RAISE EXCEPTION 'organization_project_manage_required'
      USING ERRCODE = '42501';
  END IF;

  v_project_id := NULLIF(p_project->>'id', '')::uuid;
  IF v_project_id IS NULL THEN
    RAISE EXCEPTION 'project_id_required' USING ERRCODE = '22023';
  END IF;

  -- Serialize retries for the client-generated project id. A successful retry
  -- returns the original catalogue listing instead of creating duplicates.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('create-new-building:' || v_project_id::text, 0)
  );

  SELECT project.*
  INTO v_existing_project
  FROM public.projects AS project
  WHERE project.id = v_project_id;

  IF FOUND THEN
    IF v_existing_project.owner_id IS DISTINCT FROM p_actor_user_id
       OR v_existing_project.organization_id IS DISTINCT FROM p_organization_id
       OR NOT private.can_manage_project(v_project_id, p_actor_user_id) THEN
      RAISE EXCEPTION 'project_id_conflict' USING ERRCODE = '23505';
    END IF;

    SELECT listing.id
    INTO v_listing_id
    FROM public.listings AS listing
    WHERE listing.project_id = v_project_id
      AND listing.owner_id = p_actor_user_id
      AND listing.organization_id IS NOT DISTINCT FROM p_organization_id
      AND listing.listing_type = 'new_build'::public.listing_type
    ORDER BY listing.created_at ASC, listing.id ASC
    LIMIT 1;

    IF v_listing_id IS NULL THEN
      RAISE EXCEPTION 'project_creation_incomplete' USING ERRCODE = '55000';
    END IF;

    RETURN jsonb_build_object(
      'listingId', v_listing_id,
      'projectId', v_project_id,
      'idempotent', true
    );
  END IF;

  IF NULLIF(BTRIM(p_project->>'name'), '') IS NULL
     OR NULLIF(BTRIM(p_project->>'city'), '') IS NULL THEN
    RAISE EXCEPTION 'project_name_and_city_required' USING ERRCODE = '22023';
  END IF;

  IF p_project_kind = 'new_build'
     AND NULLIF(BTRIM(p_project->>'building_permit_number'), '') IS NULL THEN
    RAISE EXCEPTION 'building_permit_required' USING ERRCODE = '22023';
  END IF;

  IF (NULLIF(p_project->>'latitude', '') IS NULL)
     <> (NULLIF(p_project->>'longitude', '') IS NULL) THEN
    RAISE EXCEPTION 'project_coordinates_incomplete' USING ERRCODE = '22023';
  END IF;

  v_permit_approval_date :=
    NULLIF(p_project->>'permit_approval_date', '')::date;
  v_construction_start_date :=
    NULLIF(p_project->>'construction_start_date', '')::date;
  v_structural_completion_date :=
    NULLIF(p_project->>'structural_completion_date', '')::date;
  v_delivery_date := NULLIF(p_project->>'delivery_date', '')::date;

  IF (
    v_permit_approval_date IS NOT NULL
    AND COALESCE(
      v_construction_start_date,
      v_structural_completion_date,
      v_delivery_date
    ) IS NOT NULL
    AND v_permit_approval_date > COALESCE(
      v_construction_start_date,
      v_structural_completion_date,
      v_delivery_date
    )
  ) OR (
    v_construction_start_date IS NOT NULL
    AND COALESCE(v_structural_completion_date, v_delivery_date) IS NOT NULL
    AND v_construction_start_date >
      COALESCE(v_structural_completion_date, v_delivery_date)
  ) OR (
    v_structural_completion_date IS NOT NULL
    AND v_delivery_date IS NOT NULL
    AND v_structural_completion_date > v_delivery_date
  ) THEN
    RAISE EXCEPTION 'project_dates_out_of_order' USING ERRCODE = '22023';
  END IF;

  v_construction_year := NULLIF(p_project->>'construction_year', '')::integer;
  v_renovation_year := NULLIF(p_project->>'renovation_year', '')::integer;
  IF p_project_kind = 'renovation' AND (
    v_construction_year IS NULL
    OR v_renovation_year IS NULL
    OR v_construction_year < 1800
    OR v_renovation_year < v_construction_year
    OR v_renovation_year > EXTRACT(YEAR FROM CURRENT_DATE)::integer + 5
  ) THEN
    RAISE EXCEPTION 'renovation_years_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_units) <> 'array'
     OR jsonb_array_length(p_units) < 1
     OR jsonb_array_length(p_units) > 100 THEN
    RAISE EXCEPTION 'new_build_unit_count_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_project_media) <> 'array'
     OR jsonb_array_length(p_project_media) > 20 THEN
    RAISE EXCEPTION 'project_media_count_invalid' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(p_additional_image_urls) <> 'array'
     OR jsonb_array_length(p_additional_image_urls) > 250 THEN
    RAISE EXCEPTION 'listing_image_count_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT item.value
  INTO v_representative
  FROM jsonb_array_elements(p_units) WITH ORDINALITY AS item(value, ordinality)
  ORDER BY ROUND((item.value->>'price')::numeric, 2) ASC, item.ordinality ASC
  LIMIT 1;

  IF v_representative IS NULL THEN
    RAISE EXCEPTION 'new_build_unit_count_invalid' USING ERRCODE = '22023';
  END IF;

  v_construction_status := CASE
    WHEN p_project_kind = 'renovation' THEN 'renovated'
    WHEN v_structural_completion_date IS NOT NULL THEN 'shell_complete'
    WHEN v_construction_start_date IS NOT NULL THEN 'under_construction'
    ELSE 'planning'
  END;
  v_year_built := CASE
    WHEN p_project_kind = 'renovation' THEN v_construction_year
    WHEN v_delivery_date IS NOT NULL
      THEN EXTRACT(YEAR FROM v_delivery_date)::integer
    ELSE NULL
  END;
  v_tags := CASE
    WHEN p_project_kind = 'renovation' THEN ARRAY[
      'renovation_project',
      'renovation_year:' || v_renovation_year::text
    ]
    ELSE NULL
  END;

  INSERT INTO public.projects (
    id,
    owner_id,
    organization_id,
    name,
    building_permit_number,
    developer_company,
    architect_group,
    construction_company,
    description,
    address,
    city,
    municipality,
    area_description,
    latitude,
    longitude,
    permit_approval_date,
    construction_start_date,
    structural_completion_date,
    delivery_date,
    status
  )
  VALUES (
    v_project_id,
    p_actor_user_id,
    p_organization_id,
    BTRIM(p_project->>'name'),
    NULLIF(BTRIM(p_project->>'building_permit_number'), ''),
    NULLIF(BTRIM(p_project->>'developer_company'), ''),
    NULLIF(BTRIM(p_project->>'architect_group'), ''),
    NULLIF(BTRIM(p_project->>'construction_company'), ''),
    NULLIF(BTRIM(p_project->>'description'), ''),
    NULLIF(BTRIM(p_project->>'address'), ''),
    BTRIM(p_project->>'city'),
    NULLIF(BTRIM(p_project->>'municipality'), ''),
    NULLIF(BTRIM(p_project->>'area_description'), ''),
    NULLIF(p_project->>'latitude', '')::numeric,
    NULLIF(p_project->>'longitude', '')::numeric,
    v_permit_approval_date,
    v_construction_start_date,
    v_structural_completion_date,
    v_delivery_date,
    'active'
  );

  FOR v_unit IN
    SELECT value FROM jsonb_array_elements(p_units)
  LOOP
    IF COALESCE(ROUND(NULLIF(v_unit->>'price', '')::numeric, 2), 0) <= 0
       OR COALESCE(ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2), 0) <= 0 THEN
      RAISE EXCEPTION 'new_build_unit_price_or_size_invalid'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.project_units (
      project_id,
      unit_id,
      floor,
      unit_number,
      availability_status,
      internal_sqm,
      balcony_sqm,
      storage_sqm,
      parking_sqm,
      bedrooms,
      bathrooms,
      kitchen_type,
      living_rooms,
      price,
      price_per_sqm,
      vat_included,
      parking_price,
      storage_price,
      sea_view,
      city_view,
      mountain_view,
      energy_class,
      heating_system,
      cooling_system
    )
    VALUES (
      v_project_id,
      NULLIF(BTRIM(v_unit->>'unit_id'), ''),
      NULLIF(v_unit->>'floor', '')::integer,
      NULLIF(BTRIM(v_unit->>'unit_number'), ''),
      'available',
      ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2),
      NULLIF(v_unit->>'balcony_sqm', '')::numeric,
      NULLIF(v_unit->>'storage_sqm', '')::numeric,
      NULLIF(v_unit->>'parking_sqm', '')::numeric,
      NULLIF(v_unit->>'bedrooms', '')::integer,
      NULLIF(v_unit->>'bathrooms', '')::integer,
      NULLIF(BTRIM(v_unit->>'kitchen_type'), ''),
      NULLIF(v_unit->>'living_rooms', '')::integer,
      ROUND(NULLIF(v_unit->>'price', '')::numeric, 2),
      ROUND(
        ROUND(NULLIF(v_unit->>'price', '')::numeric, 2)
        / NULLIF(ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2), 0),
        2
      ),
      COALESCE(NULLIF(v_unit->>'vat_included', '')::boolean, true),
      NULLIF(v_unit->>'parking_price', '')::numeric,
      NULLIF(v_unit->>'storage_price', '')::numeric,
      COALESCE(NULLIF(v_unit->>'sea_view', '')::boolean, false),
      COALESCE(NULLIF(v_unit->>'city_view', '')::boolean, false),
      COALESCE(NULLIF(v_unit->>'mountain_view', '')::boolean, false),
      NULLIF(BTRIM(v_unit->>'energy_class'), ''),
      NULLIF(BTRIM(v_unit->>'heating_system'), ''),
      NULLIF(BTRIM(v_unit->>'cooling_system'), '')
    );
  END LOOP;

  IF NULLIF(BTRIM(p_listing->>'title'), '') IS NULL
     OR NULLIF(BTRIM(p_listing->>'cover_image_url'), '') IS NULL THEN
    RAISE EXCEPTION 'listing_title_and_cover_required' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.listings (
    owner_id,
    organization_id,
    project_id,
    title,
    description,
    city,
    address,
    latitude,
    longitude,
    property_type,
    listing_type,
    price,
    sqm,
    price_per_sqm,
    bedrooms,
    bathrooms,
    living_rooms,
    floor,
    energy_class,
    heating_system,
    construction_status,
    year_built,
    cover_image_url,
    status,
    is_pre_sale,
    tags
  )
  VALUES (
    p_actor_user_id,
    p_organization_id,
    v_project_id,
    BTRIM(p_listing->>'title'),
    NULLIF(BTRIM(p_listing->>'description'), ''),
    BTRIM(p_project->>'city'),
    NULLIF(BTRIM(p_project->>'address'), ''),
    NULLIF(p_project->>'latitude', '')::numeric,
    NULLIF(p_project->>'longitude', '')::numeric,
    'apartment'::public.property_type,
    'new_build'::public.listing_type,
    ROUND((v_representative->>'price')::numeric, 2),
    ROUND((v_representative->>'internal_sqm')::numeric, 2),
    ROUND(
      ROUND((v_representative->>'price')::numeric, 2)
      / NULLIF(ROUND((v_representative->>'internal_sqm')::numeric, 2), 0),
      2
    ),
    NULLIF(v_representative->>'bedrooms', '')::integer,
    NULLIF(v_representative->>'bathrooms', '')::integer,
    NULLIF(v_representative->>'living_rooms', '')::integer,
    NULLIF(v_representative->>'floor', '')::integer,
    NULLIF(BTRIM(v_representative->>'energy_class'), ''),
    NULLIF(BTRIM(v_representative->>'heating_system'), ''),
    v_construction_status,
    v_year_built,
    BTRIM(p_listing->>'cover_image_url'),
    'active'::public.listing_status,
    false,
    v_tags
  )
  RETURNING id INTO v_listing_id;

  UPDATE public.project_units
  SET listing_id = v_listing_id
  WHERE project_id = v_project_id;

  FOR v_media IN
    SELECT value FROM jsonb_array_elements(p_project_media)
  LOOP
    INSERT INTO public.project_media (
      project_id,
      url,
      media_type,
      title,
      sort_order
    )
    VALUES (
      v_project_id,
      BTRIM(v_media->>'url'),
      BTRIM(v_media->>'media_type'),
      NULLIF(BTRIM(v_media->>'title'), ''),
      COALESCE(NULLIF(v_media->>'sort_order', '')::integer, 0)
    );
  END LOOP;

  FOR v_image IN
    SELECT value FROM jsonb_array_elements(p_additional_image_urls)
  LOOP
    v_image_index := v_image_index + 1;
    INSERT INTO public.listing_images (
      listing_id,
      url,
      sort_order
    )
    VALUES (
      v_listing_id,
      BTRIM(v_image #>> '{}'),
      v_image_index
    );
  END LOOP;

  RETURN jsonb_build_object(
    'listingId', v_listing_id,
    'projectId', v_project_id,
    'idempotent', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.create_new_building_listing_for_service(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_new_building_listing_for_service(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- Selected definition: 20260726233830; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.is_service_role_request() FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726233830; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.requeue_storage_cleanup_job(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.requeue_storage_cleanup_job(uuid) TO service_role;

-- Selected definition: 20260726224342; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.notify_storage_cleanup_dead() FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.storage_cleanup_expected_public_url(text, text) FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.register_new_building_storage_upload(uuid, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_new_building_storage_upload(uuid, text, text, text) TO authenticated;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.stage_storage_cleanup_jobs_for_service(uuid, uuid, text, jsonb, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.stage_storage_cleanup_jobs_for_service(uuid, uuid, text, jsonb, text, text) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.settle_storage_cleanup_jobs_for_service(uuid, uuid, jsonb, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_storage_cleanup_jobs_for_service(uuid, uuid, jsonb, text) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
CREATE OR REPLACE FUNCTION public.claim_storage_cleanup_jobs(
  p_limit integer DEFAULT 25
)
RETURNS SETOF public.storage_cleanup_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- A missing control row is disabled. Never authorize a delete while closed.
  IF NOT COALESCE((SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control WHERE singleton), false) THEN
    RETURN;
  END IF;
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
REVOKE ALL ON FUNCTION public.claim_storage_cleanup_jobs(integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_storage_cleanup_jobs(integer) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.is_storage_object_committed(text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_storage_object_committed(text, text, text) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
  -- A missing control row is disabled. Never authorize a delete while closed.
  IF NOT COALESCE((SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control WHERE singleton), false) THEN
    RETURN 'lost';
  END IF;
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
REVOKE ALL ON FUNCTION public.prepare_storage_cleanup_delete(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.prepare_storage_cleanup_delete(uuid, uuid) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.check_listing_quota_for_owner(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.check_listing_quota_for_principal(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.create_new_building_listing_with_storage_for_service(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_new_building_listing_with_storage_for_service(uuid, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.attach_project_media_for_service(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.attach_project_media_for_service(uuid, uuid, jsonb) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION public.update_listing_cover_with_storage_for_service(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_listing_cover_with_storage_for_service(uuid, uuid, uuid, text) TO service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.reconcile_storage_cleanup_invocations() FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
REVOKE ALL ON FUNCTION private.prune_storage_cleanup_history() FROM PUBLIC, anon, authenticated, service_role;

-- Selected definition: 20260726234925; explicit ACLs (no history inheritance).
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
  -- A missing control row is disabled. Never authorize a delete while closed.
  IF NOT COALESCE((SELECT cleanup_enabled FROM private.storage_cleanup_rollout_control WHERE singleton), false) THEN
    RETURN NULL;
  END IF;
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
REVOKE ALL ON FUNCTION public.invoke_storage_cleanup_cron() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.invoke_storage_cleanup_cron() TO service_role;

DROP TRIGGER IF EXISTS trg_notify_storage_cleanup_dead ON public.storage_cleanup_jobs;
CREATE TRIGGER trg_notify_storage_cleanup_dead AFTER UPDATE OF status ON public.storage_cleanup_jobs FOR EACH ROW EXECUTE FUNCTION private.notify_storage_cleanup_dead();
-- Recheck created indexes too: same names elsewhere must never be silently skipped.
DO $preflight$ BEGIN
  IF to_regclass('public.storage_cleanup_invocations') IS NOT NULL THEN
    IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.storage_cleanup_invocations'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[{"name":"id","type":"uuid","default":"gen_random_uuid()","not_null":true},{"name":"request_id","type":"bigint","default":null,"not_null":true},{"name":"status","type":"text","default":"''pending''::text","not_null":true},{"name":"response_status","type":"integer","default":null,"not_null":false},{"name":"error_message","type":"text","default":null,"not_null":false},{"name":"requested_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"completed_at","type":"timestamp with time zone","default":null,"not_null":false},{"name":"updated_at","type":"timestamp with time zone","default":"now()","not_null":true}]'::jsonb THEN RAISE EXCEPTION 'storage_capability_column_conflict: storage_cleanup_invocations'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_invocations'::regclass AND conname='storage_cleanup_invocations_pkey' AND convalidated AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_invocations_pkey'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_invocations'::regclass AND conname='storage_cleanup_invocations_request_id_key' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (request_id)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_invocations_request_id_key'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_invocations'::regclass AND conname='storage_cleanup_invocations_status_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''pending''::text, ''succeeded''::text, ''failed''::text])))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_invocations_status_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_storage_cleanup_invocations_pending') AND indrelid='public.storage_cleanup_invocations'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE INDEX idx_storage_cleanup_invocations_pending ON public.storage_cleanup_invocations USING btree (requested_at, request_id) WHERE (status = ''pending''::text)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: idx_storage_cleanup_invocations_pending'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_invocations_pkey') AND indrelid='public.storage_cleanup_invocations'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_invocations_pkey ON public.storage_cleanup_invocations USING btree (id)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_invocations_pkey'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_invocations_request_id_key') AND indrelid='public.storage_cleanup_invocations'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_invocations_request_id_key ON public.storage_cleanup_invocations USING btree (request_id)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_invocations_request_id_key'; END IF;
  END IF;
END $preflight$;
DO $preflight$ BEGIN
  IF to_regclass('public.storage_cleanup_jobs') IS NOT NULL THEN
    IF (SELECT jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attnum) FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE a.attrelid='public.storage_cleanup_jobs'::regclass AND a.attnum>0 AND NOT a.attisdropped) IS DISTINCT FROM '[{"name":"id","type":"uuid","default":"gen_random_uuid()","not_null":true},{"name":"bucket","type":"text","default":null,"not_null":true},{"name":"object_path","type":"text","default":null,"not_null":true},{"name":"object_url","type":"text","default":null,"not_null":true},{"name":"owner_id","type":"uuid","default":null,"not_null":true},{"name":"project_id","type":"uuid","default":null,"not_null":true},{"name":"reason","type":"text","default":null,"not_null":true},{"name":"status","type":"text","default":"''pending''::text","not_null":true},{"name":"attempts","type":"integer","default":"0","not_null":true},{"name":"next_attempt_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"last_error","type":"text","default":null,"not_null":false},{"name":"created_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"updated_at","type":"timestamp with time zone","default":"now()","not_null":true},{"name":"completed_at","type":"timestamp with time zone","default":null,"not_null":false},{"name":"lease_token","type":"uuid","default":null,"not_null":false},{"name":"lease_expires_at","type":"timestamp with time zone","default":null,"not_null":false}]'::jsonb THEN RAISE EXCEPTION 'storage_capability_column_conflict: storage_cleanup_jobs'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_attempts_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((attempts >= 0))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_attempts_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_bucket_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((bucket = ANY (ARRAY[''listing-images''::text, ''project-media''::text])))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_bucket_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_bucket_object_path_key' AND convalidated AND pg_get_constraintdef(oid)='UNIQUE (bucket, object_path)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_bucket_object_path_key'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_path_scope_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK (private.storage_cleanup_path_is_valid(owner_id, project_id, bucket, object_path))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_path_scope_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_pkey' AND convalidated AND pg_get_constraintdef(oid)='PRIMARY KEY (id)') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_pkey'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_status_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK ((status = ANY (ARRAY[''pending''::text, ''held''::text, ''processing''::text, ''completed''::text, ''dead''::text])))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_status_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.storage_cleanup_jobs'::regclass AND conname='storage_cleanup_jobs_url_identity_check' AND convalidated AND pg_get_constraintdef(oid)='CHECK (("right"(object_url, length((((''/storage/v1/object/public/''::text || bucket) || ''/''::text) || object_path))) = (((''/storage/v1/object/public/''::text || bucket) || ''/''::text) || object_path)))') THEN RAISE EXCEPTION 'storage_capability_constraint_conflict: storage_cleanup_jobs_url_identity_check'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_storage_cleanup_jobs_claim') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE INDEX idx_storage_cleanup_jobs_claim ON public.storage_cleanup_jobs USING btree (next_attempt_at, created_at, id) WHERE (status = ''pending''::text)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: idx_storage_cleanup_jobs_claim'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.idx_storage_cleanup_jobs_processing_lease') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE INDEX idx_storage_cleanup_jobs_processing_lease ON public.storage_cleanup_jobs USING btree (lease_expires_at, updated_at, id) WHERE (status = ''processing''::text)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: idx_storage_cleanup_jobs_processing_lease'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_jobs_bucket_object_path_key') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_jobs_bucket_object_path_key ON public.storage_cleanup_jobs USING btree (bucket, object_path)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_jobs_bucket_object_path_key'; END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.storage_cleanup_jobs_pkey') AND indrelid='public.storage_cleanup_jobs'::regclass AND indisvalid AND indisready AND indislive AND pg_get_indexdef(indexrelid)='CREATE UNIQUE INDEX storage_cleanup_jobs_pkey ON public.storage_cleanup_jobs USING btree (id)') THEN RAISE EXCEPTION 'storage_capability_index_conflict: storage_cleanup_jobs_pkey'; END IF;
  END IF;
END $preflight$;

-- Captured SELECT subqueries fail raw listings ACL evaluation even for project buckets.
-- Install only the two equivalent source definer predicates and the final SELECT shape.
-- INSERT/UPDATE/DELETE policies, table ACLs and unrelated bucket predicates stay unchanged.
DO $storage_policy$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid='storage.objects'::regclass AND polname='storage_objects_authenticated_select' AND polcmd='r' AND polpermissive AND polroles=ARRAY[(SELECT oid FROM pg_roles WHERE rolname='authenticated')] AND polwithcheck IS NULL AND pg_get_expr(polqual,polrelid) IN ('(((bucket_id = ''firesale-proof-docs''::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = ''message-attachments''::text) AND (EXISTS ( SELECT 1
   FROM conversations conversation
  WHERE (((conversation.id)::text = (storage.foldername(objects.name))[2]) AND ((conversation.participant_a = ( SELECT auth.uid() AS uid)) OR (conversation.participant_b = ( SELECT auth.uid() AS uid))))))) OR ((bucket_id = ''open-house-docs''::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR (EXISTS ( SELECT 1
   FROM (open_house_registrations registration
     JOIN listings listing ON (((listing.id = registration.listing_id) AND (listing.owner_id = ( SELECT auth.uid() AS uid)))))
  WHERE (((storage.foldername(objects.name))[1] = (registration.requester_id)::text) AND ((storage.foldername(objects.name))[2] = (registration.listing_id)::text)))) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))))','(((bucket_id = ''firesale-proof-docs''::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = ''message-attachments''::text) AND private.can_select_message_attachment((storage.foldername(name))[2])) OR ((bucket_id = ''open-house-docs''::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.can_select_open_house_document((storage.foldername(name))[1], (storage.foldername(name))[2]) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = ''listing-images''::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = ''project-media''::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)))')) THEN RAISE EXCEPTION 'storage_capability_policy_conflict: storage_objects_authenticated_select'; END IF;
END $storage_policy$;
DO $helper$ BEGIN IF to_regprocedure('private.can_select_message_attachment(text)') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('private.can_select_message_attachment(text)') AND p.prorettype='boolean'::regtype AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""'] AND p.proargnames=ARRAY['p_conversation_id'] AND p.prosrc='
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.id::TEXT = p_conversation_id
      AND (
        conversation.participant_a = (SELECT auth.uid())
        OR conversation.participant_b = (SELECT auth.uid())
      )
  );
' AND pg_get_userbyid(p.proowner)='postgres' AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='authenticated'),(SELECT oid FROM pg_roles WHERE rolname='service_role')))) THEN RAISE EXCEPTION 'storage_capability_helper_conflict: can_select_message_attachment'; END IF; END $helper$;
CREATE OR REPLACE FUNCTION private.can_select_message_attachment(
  p_conversation_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.conversations AS conversation
    WHERE conversation.id::TEXT = p_conversation_id
      AND (
        conversation.participant_a = (SELECT auth.uid())
        OR conversation.participant_b = (SELECT auth.uid())
      )
  );
$$;
REVOKE ALL ON FUNCTION private.can_select_message_attachment(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.can_select_message_attachment(text) TO authenticated,service_role;
DO $helper$ BEGIN IF to_regprocedure('private.can_select_open_house_document(text,text)') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('private.can_select_open_house_document(text,text)') AND p.prorettype='boolean'::regtype AND p.prosecdef AND p.provolatile='s' AND p.proconfig=ARRAY['search_path=""'] AND p.proargnames=ARRAY['p_requester_id','p_listing_id'] AND p.prosrc='
  SELECT EXISTS (
    SELECT 1
    FROM public.open_house_registrations AS registration
    JOIN public.listings AS listing
      ON listing.id = registration.listing_id
    WHERE registration.requester_id::TEXT = p_requester_id
      AND registration.listing_id::TEXT = p_listing_id
      AND listing.owner_id = (SELECT auth.uid())
  );
' AND pg_get_userbyid(p.proowner)='postgres' AND has_function_privilege('authenticated',p.oid,'EXECUTE') AND has_function_privilege('service_role',p.oid,'EXECUTE') AND NOT EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee NOT IN(p.proowner,(SELECT oid FROM pg_roles WHERE rolname='authenticated'),(SELECT oid FROM pg_roles WHERE rolname='service_role')))) THEN RAISE EXCEPTION 'storage_capability_helper_conflict: can_select_open_house_document'; END IF; END $helper$;
CREATE OR REPLACE FUNCTION private.can_select_open_house_document(
  p_requester_id TEXT,
  p_listing_id TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.open_house_registrations AS registration
    JOIN public.listings AS listing
      ON listing.id = registration.listing_id
    WHERE registration.requester_id::TEXT = p_requester_id
      AND registration.listing_id::TEXT = p_listing_id
      AND listing.owner_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION private.can_select_open_house_document(text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.can_select_open_house_document(text,text) TO authenticated,service_role;
ALTER POLICY storage_objects_authenticated_select ON storage.objects USING ((((bucket_id = 'firesale-proof-docs'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = 'message-attachments'::text) AND private.can_select_message_attachment((storage.foldername(name))[2])) OR ((bucket_id = 'open-house-docs'::text) AND (((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text) OR private.can_select_open_house_document((storage.foldername(name))[1], (storage.foldername(name))[2]) OR private.has_platform_admin(( SELECT auth.uid() AS uid)))) OR ((bucket_id = 'listing-images'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)) OR ((bucket_id = 'project-media'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))));
COMMIT;
