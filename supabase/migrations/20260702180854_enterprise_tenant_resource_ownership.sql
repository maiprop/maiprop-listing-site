-- Enterprise tenant ownership for first-class product resources.
--
-- This is intentionally additive:
--   - existing personal/user-owned rows keep working with organization_id = NULL
--   - active public catalogue reads stay public
--   - enterprise tenants can own listings/projects without trusting user_metadata
--   - org permissions are still derived only from organization_memberships

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS organization_id uuid;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS organization_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'listings_organization_id_fkey'
      AND conrelid = 'public.listings'::regclass
  ) THEN
    ALTER TABLE public.listings
      ADD CONSTRAINT listings_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'projects_organization_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.listings
  DROP CONSTRAINT IF EXISTS listings_tenant_rows_keep_user_owner;
ALTER TABLE public.listings
  ADD CONSTRAINT listings_tenant_rows_keep_user_owner
  CHECK (organization_id IS NULL OR owner_id IS NOT NULL) NOT VALID;
ALTER TABLE public.listings
  VALIDATE CONSTRAINT listings_tenant_rows_keep_user_owner;

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS projects_tenant_rows_keep_user_owner;
ALTER TABLE public.projects
  ADD CONSTRAINT projects_tenant_rows_keep_user_owner
  CHECK (organization_id IS NULL OR owner_id IS NOT NULL) NOT VALID;
ALTER TABLE public.projects
  VALIDATE CONSTRAINT projects_tenant_rows_keep_user_owner;

CREATE INDEX IF NOT EXISTS idx_listings_organization_id
  ON public.listings (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_organization_id
  ON public.projects (organization_id)
  WHERE organization_id IS NOT NULL;

COMMENT ON COLUMN public.listings.organization_id IS
  'Optional enterprise tenant owner for listings. NULL preserves existing personal listings; tenant access is authorized from organization_memberships.';
COMMENT ON COLUMN public.projects.organization_id IS
  'Optional enterprise tenant owner for projects/new-build inventory. NULL preserves existing developer-owned projects; tenant access is authorized from organization_memberships.';

CREATE OR REPLACE FUNCTION private.has_org_permission(
  p_org_id uuid,
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH active_membership AS (
    SELECT memberships.role
    FROM public.organization_memberships memberships
    WHERE memberships.organization_id = p_org_id
      AND memberships.user_id = p_user_id
      AND memberships.status = 'active'
    LIMIT 1
  )
  SELECT COALESCE(
    CASE
      WHEN p_org_id IS NULL OR p_permission IS NULL OR p_user_id IS NULL THEN false
      WHEN private.has_platform_admin(p_user_id) THEN true
      WHEN p_permission = ANY(ARRAY['organization:view', 'membership:view']) THEN
        EXISTS (SELECT 1 FROM active_membership)
      WHEN p_permission = ANY(ARRAY['listing:view', 'project:view']) THEN
        EXISTS (SELECT 1 FROM active_membership)
      WHEN p_permission = 'organization:update' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'billing_admin', 'security_admin'])
        )
      WHEN p_permission = 'membership:manage' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin'])
        )
      WHEN p_permission = 'membership:manage_owner' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = 'owner'
        )
      WHEN p_permission = 'domain:manage' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      WHEN p_permission = 'sso:manage' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      WHEN p_permission = ANY(ARRAY['listing:manage', 'project:manage']) THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'member'])
        )
      WHEN p_permission = ANY(ARRAY['procurement:view', 'procurement:manage']) THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'billing_admin', 'security_admin'])
        )
      WHEN p_permission = 'audit:read' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      WHEN p_permission = 'audit:append' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'security_admin'])
        )
      ELSE false
    END,
    false
  )
$$;

REVOKE ALL ON FUNCTION private.has_org_permission(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_org_permission(uuid, text, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION private.has_org_permission(uuid, text, uuid) IS
  'Checks tenant permissions from active organization_memberships only; user-controlled metadata and SSO claims are not authorization sources.';

CREATE OR REPLACE FUNCTION private.has_developer_listing_access(_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    public.authoritative_role(_user_id) = 'developer'::public.user_role
    OR private.has_platform_admin(_user_id),
    false
  )
$$;

REVOKE ALL ON FUNCTION private.has_developer_listing_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.has_developer_listing_access(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION private.has_developer_listing_access(uuid) IS
  'RLS helper for developer-only new-build listings, projects, and project inventory.';

CREATE OR REPLACE FUNCTION private.guard_tenant_resource_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL OR private.has_platform_admin(v_actor) THEN
    RETURN NEW;
  END IF;

  IF NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
    RAISE EXCEPTION 'permission_denied: tenant resource ownership cannot be reassigned'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.guard_tenant_resource_owner_update()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.guard_tenant_resource_owner_update()
  TO service_role;

DROP TRIGGER IF EXISTS trg_guard_listings_tenant_resource_owner_update
  ON public.listings;
CREATE TRIGGER trg_guard_listings_tenant_resource_owner_update
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_tenant_resource_owner_update();

DROP TRIGGER IF EXISTS trg_guard_projects_tenant_resource_owner_update
  ON public.projects;
CREATE TRIGGER trg_guard_projects_tenant_resource_owner_update
  BEFORE UPDATE ON public.projects
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_tenant_resource_owner_update();

DROP POLICY IF EXISTS listings_select ON public.listings;
DROP POLICY IF EXISTS listings_select_authenticated ON public.listings;
DROP POLICY IF EXISTS listing_insert_quota ON public.listings;
DROP POLICY IF EXISTS listings_update ON public.listings;
DROP POLICY IF EXISTS listings_delete ON public.listings;

CREATE POLICY listings_select
ON public.listings
FOR SELECT
TO anon
USING (
  status = 'active'::public.listing_status
  AND COALESCE(is_off_market, false) = false
);

CREATE POLICY listings_select_authenticated
ON public.listings
FOR SELECT
TO authenticated
USING (
  (
    status = 'active'::public.listing_status
    AND COALESCE(is_off_market, false) = false
  )
  OR owner_id = (SELECT auth.uid())
  OR (
    organization_id IS NOT NULL
    AND private.has_org_permission(organization_id, 'listing:view', (SELECT auth.uid()))
  )
);

CREATE POLICY listing_insert_quota
ON public.listings
FOR INSERT
TO authenticated
WITH CHECK (
  (
    (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_permission(organization_id, 'listing:manage', (SELECT auth.uid()))
    )
  )
  AND (SELECT private.check_listing_quota())
  AND (
    COALESCE(listing_type::text, 'sale') <> 'new_build'
    OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  )
  AND (
    project_id IS NULL
    OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  )
);

CREATE POLICY listings_update
ON public.listings
FOR UPDATE
TO authenticated
USING (
  (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
  OR (
    organization_id IS NOT NULL
    AND private.has_org_permission(organization_id, 'listing:manage', (SELECT auth.uid()))
  )
)
WITH CHECK (
  (
    (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND owner_id = (SELECT auth.uid())
      AND private.has_org_permission(organization_id, 'listing:manage', (SELECT auth.uid()))
    )
  )
  AND (
    COALESCE(listing_type::text, 'sale') <> 'new_build'
    OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  )
  AND (
    project_id IS NULL
    OR (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  )
);

CREATE POLICY listings_delete
ON public.listings
FOR DELETE
TO authenticated
USING (
  (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
  OR (
    organization_id IS NOT NULL
    AND private.has_org_permission(organization_id, 'listing:manage', (SELECT auth.uid()))
  )
);

DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_public_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_admin_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_update" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_delete" ON public.projects;

CREATE POLICY "projects_public_select"
ON public.projects
FOR SELECT
TO anon
USING (
  status = 'active'::text
  AND archived_at IS NULL
);

CREATE POLICY "projects_select"
ON public.projects
FOR SELECT
TO authenticated
USING (
  (
    status = 'active'::text
    AND archived_at IS NULL
  )
  OR owner_id = (SELECT auth.uid())
  OR (
    organization_id IS NOT NULL
    AND private.has_org_permission(organization_id, 'project:view', (SELECT auth.uid()))
  )
  OR private.has_platform_admin((SELECT auth.uid()))
);

CREATE POLICY "projects_owner_insert"
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  AND (
    (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_permission(organization_id, 'project:manage', (SELECT auth.uid()))
    )
  )
);

CREATE POLICY "projects_owner_update"
ON public.projects
FOR UPDATE
TO authenticated
USING (
  (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  AND (
    owner_id = (SELECT auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.has_org_permission(organization_id, 'project:manage', (SELECT auth.uid()))
    )
  )
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  AND (
    organization_id IS NULL
    OR private.has_org_permission(organization_id, 'project:manage', (SELECT auth.uid()))
  )
);

CREATE POLICY "projects_owner_delete"
ON public.projects
FOR DELETE
TO authenticated
USING (
  (SELECT private.has_developer_listing_access((SELECT auth.uid())))
  AND (
    owner_id = (SELECT auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.has_org_permission(organization_id, 'project:manage', (SELECT auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "project_media_owner_insert" ON public.project_media;
DROP POLICY IF EXISTS "project_media_owner_update" ON public.project_media;
DROP POLICY IF EXISTS "project_media_owner_delete" ON public.project_media;

CREATE POLICY "project_media_owner_insert"
ON public.project_media
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_media.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
);

CREATE POLICY "project_media_owner_update"
ON public.project_media
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_media.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_media.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
);

CREATE POLICY "project_media_owner_delete"
ON public.project_media
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_media.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
);

DROP POLICY IF EXISTS "project_units_owner_insert" ON public.project_units;
DROP POLICY IF EXISTS "project_units_owner_update" ON public.project_units;
DROP POLICY IF EXISTS "project_units_owner_delete" ON public.project_units;

CREATE POLICY "project_units_owner_insert"
ON public.project_units
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_units.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
);

CREATE POLICY "project_units_owner_update"
ON public.project_units
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_units.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_units.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
);

CREATE POLICY "project_units_owner_delete"
ON public.project_units
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.projects
    WHERE projects.id = project_units.project_id
      AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
      AND (
        projects.owner_id = (SELECT auth.uid())
        OR (
          projects.organization_id IS NOT NULL
          AND private.has_org_permission(projects.organization_id, 'project:manage', (SELECT auth.uid()))
        )
      )
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'listings'
      AND column_name = 'organization_id'
  ) OR NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'organization_id'
  ) THEN
    RAISE EXCEPTION 'enterprise tenant resource ownership contract missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'listings'
      AND policyname = 'listings_update'
      AND cmd = 'UPDATE'
      AND with_check ~* 'organization_id'
      AND with_check ~* 'listing:manage'
  ) THEN
    RAISE EXCEPTION 'tenant-aware listing update policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'projects_owner_update'
      AND cmd = 'UPDATE'
      AND with_check ~* 'organization_id'
      AND with_check ~* 'project:manage'
  ) THEN
    RAISE EXCEPTION 'tenant-aware project update policy missing';
  END IF;
END $$;
