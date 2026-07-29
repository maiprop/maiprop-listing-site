-- Restore one tenant-aware authorization contract after later owner-only
-- policy consolidations. Personal resources remain owner-scoped; organization
-- resources derive access only from active organization memberships.

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

REVOKE ALL ON FUNCTION private.can_manage_project(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.can_manage_project(uuid, uuid)
  TO service_role;

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

REVOKE ALL ON FUNCTION public.get_project_management_context_for_service(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_project_management_context_for_service(uuid, uuid)
  TO service_role;

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

REVOKE ALL ON FUNCTION public.delete_project_for_service(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_project_for_service(uuid, uuid)
  TO service_role;

-- Browser actors, including platform administrators, cannot reassign tenant
-- ownership through raw row updates. Trusted service operations run without an
-- auth.uid() and use dedicated, audited boundaries.
CREATE OR REPLACE FUNCTION private.guard_tenant_resource_owner_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := (SELECT auth.uid());
BEGIN
  IF v_actor IS NULL THEN
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

DROP POLICY IF EXISTS "projects_public_select" ON public.projects;
DROP POLICY IF EXISTS "projects_select" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_insert" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_update" ON public.projects;
DROP POLICY IF EXISTS "projects_owner_delete" ON public.projects;

CREATE POLICY "projects_public_select"
  ON public.projects
  FOR SELECT
  TO anon
  USING (status = 'active'::text AND archived_at IS NULL);

CREATE POLICY "projects_select"
  ON public.projects
  FOR SELECT
  TO authenticated
  USING (
    (status = 'active'::text AND archived_at IS NULL)
    OR owner_id = (SELECT auth.uid())
    OR (
      organization_id IS NOT NULL
      AND private.has_org_permission(
        organization_id,
        'project:view',
        (SELECT auth.uid())
      )
    )
    OR private.has_platform_admin((SELECT auth.uid()))
  );

CREATE POLICY "projects_owner_insert"
  ON public.projects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    AND (
      organization_id IS NULL
      OR private.has_org_permission(
        organization_id,
        'project:manage',
        (SELECT auth.uid())
      )
      OR private.has_platform_admin((SELECT auth.uid()))
    )
  );

CREATE POLICY "projects_owner_update"
  ON public.projects
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    AND (
      (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
      OR (
        organization_id IS NOT NULL
        AND private.has_org_permission(
          organization_id,
          'project:manage',
          (SELECT auth.uid())
        )
      )
      OR private.has_platform_admin((SELECT auth.uid()))
    )
  )
  WITH CHECK (
    (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    AND (
      (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
      OR (
        organization_id IS NOT NULL
        AND private.has_org_permission(
          organization_id,
          'project:manage',
          (SELECT auth.uid())
        )
      )
      OR private.has_platform_admin((SELECT auth.uid()))
    )
  );

CREATE POLICY "projects_owner_delete"
  ON public.projects
  FOR DELETE
  TO authenticated
  USING (
    (SELECT private.has_developer_listing_access((SELECT auth.uid())))
    AND (
      (organization_id IS NULL AND owner_id = (SELECT auth.uid()))
      OR (
        organization_id IS NOT NULL
        AND private.has_org_permission(
          organization_id,
          'project:manage',
          (SELECT auth.uid())
        )
      )
      OR private.has_platform_admin((SELECT auth.uid()))
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
      FROM public.projects AS project
      WHERE project.id = project_units.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
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
      FROM public.projects AS project
      WHERE project.id = project_units.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_units.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
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
      FROM public.projects AS project
      WHERE project.id = project_units.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
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
      FROM public.projects AS project
      WHERE project.id = project_media.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
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
      FROM public.projects AS project
      WHERE project.id = project_media.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_media.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
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
      FROM public.projects AS project
      WHERE project.id = project_media.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS "project_leads_owner_or_admin_select" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_insert" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_update" ON public.project_leads;
DROP POLICY IF EXISTS "project_leads_owner_delete" ON public.project_leads;

CREATE POLICY "project_leads_owner_or_admin_select"
  ON public.project_leads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_leads.project_id
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "project_leads_owner_insert"
  ON public.project_leads
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_leads.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "project_leads_owner_update"
  ON public.project_leads
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_leads.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_leads.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

CREATE POLICY "project_leads_owner_delete"
  ON public.project_leads
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_leads.project_id
        AND (SELECT private.has_developer_listing_access((SELECT auth.uid())))
        AND (
          (project.organization_id IS NULL AND project.owner_id = (SELECT auth.uid()))
          OR (
            project.organization_id IS NOT NULL
            AND private.has_org_permission(
              project.organization_id,
              'project:manage',
              (SELECT auth.uid())
            )
          )
          OR private.has_platform_admin((SELECT auth.uid()))
        )
    )
  );

COMMENT ON FUNCTION private.can_manage_project(uuid, uuid) IS
  'Canonical personal-or-organization project management authorization. Organization access comes only from active memberships.';
COMMENT ON FUNCTION public.get_project_management_context_for_service(uuid, uuid) IS
  'Service-role-only project authorization context for the project-management Edge Function.';
COMMENT ON FUNCTION public.delete_project_for_service(uuid, uuid) IS
  'Service-role-only atomic project deletion. Refuses cross-tenant linked listings before detaching valid inventory.';
