-- Additive organization permission helpers and append-only audit ledger
-- foundation. This migration does not change existing personal flows or
-- business-handler behavior; future policies should keep explicit
-- `organization_id IS NULL` branches for personal records.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.organization_audit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  actor_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  action text NOT NULL CHECK (
    action ~ '^[a-z][a-z0-9_.:-]{2,119}$'
  ),
  subject_table text CHECK (
    subject_table IS NULL
    OR subject_table ~ '^[a-z][a-z0-9_]{0,62}$'
  ),
  subject_id uuid,
  permission text CHECK (
    permission IS NULL
    OR permission ~ '^[a-z][a-z0-9_.:-]{2,119}$'
  ),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  request_id text CHECK (request_id IS NULL OR char_length(request_id) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_audit_ledger_org_created_at
  ON public.organization_audit_ledger (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organization_audit_ledger_actor_created_at
  ON public.organization_audit_ledger (actor_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organization_audit_ledger_action_created_at
  ON public.organization_audit_ledger (action, created_at DESC);

ALTER TABLE public.organization_audit_ledger ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organization_audit_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.organization_audit_ledger TO authenticated;
GRANT SELECT, INSERT ON TABLE public.organization_audit_ledger TO service_role;

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
      WHEN p_permission = 'organization:view' THEN
        EXISTS (SELECT 1 FROM active_membership)
      WHEN p_permission = 'organization:update' THEN
        EXISTS (
          SELECT 1
          FROM active_membership
          WHERE role = ANY(ARRAY['owner', 'admin', 'billing_admin', 'security_admin'])
        )
      WHEN p_permission = 'membership:view' THEN
        EXISTS (SELECT 1 FROM active_membership)
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

CREATE OR REPLACE FUNCTION private.assert_org_permission(
  p_org_id uuid,
  p_permission text,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT private.has_org_permission(p_org_id, p_permission, p_user_id) THEN
    RAISE EXCEPTION 'permission_denied: organization permission % required', p_permission
      USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.append_org_audit_event(
  p_org_id uuid,
  p_action text,
  p_subject_table text DEFAULT NULL,
  p_subject_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id uuid DEFAULT auth.uid(),
  p_required_permission text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
BEGIN
  IF p_action IS NULL OR btrim(p_action) !~ '^[a-z][a-z0-9_.:-]{2,119}$' THEN
    RAISE EXCEPTION 'invalid_audit_action'
      USING ERRCODE = '22023';
  END IF;

  IF p_subject_table IS NOT NULL AND btrim(p_subject_table) !~ '^[a-z][a-z0-9_]{0,62}$' THEN
    RAISE EXCEPTION 'invalid_audit_subject_table'
      USING ERRCODE = '22023';
  END IF;

  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'invalid_audit_metadata'
      USING ERRCODE = '22023';
  END IF;

  IF p_required_permission IS NOT NULL THEN
    PERFORM private.assert_org_permission(p_org_id, p_required_permission, p_actor_user_id);
  END IF;

  INSERT INTO public.organization_audit_ledger (
    organization_id,
    actor_user_id,
    action,
    subject_table,
    subject_id,
    permission,
    metadata
  )
  VALUES (
    p_org_id,
    p_actor_user_id,
    btrim(p_action),
    NULLIF(btrim(p_subject_table), ''),
    p_subject_id,
    p_required_permission,
    p_metadata
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

CREATE OR REPLACE FUNCTION private.prevent_organization_audit_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'permission_denied: organization audit ledger is append-only'
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_organization_audit_ledger_mutation
  ON public.organization_audit_ledger;
CREATE TRIGGER trg_prevent_organization_audit_ledger_mutation
  BEFORE UPDATE OR DELETE ON public.organization_audit_ledger
  FOR EACH ROW
  EXECUTE FUNCTION private.prevent_organization_audit_ledger_mutation();

DROP POLICY IF EXISTS organization_audit_ledger_select
  ON public.organization_audit_ledger;
CREATE POLICY organization_audit_ledger_select
  ON public.organization_audit_ledger
  FOR SELECT
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_permission(organization_id, 'audit:read', (SELECT auth.uid()))
    )
    OR (
      organization_id IS NULL
      AND actor_user_id = (SELECT auth.uid())
    )
  );

REVOKE ALL ON FUNCTION private.has_org_permission(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.assert_org_permission(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.append_org_audit_event(uuid, text, text, uuid, jsonb, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.prevent_organization_audit_ledger_mutation() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.has_org_permission(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.assert_org_permission(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.append_org_audit_event(uuid, text, text, uuid, jsonb, uuid, text) TO service_role;

COMMENT ON TABLE public.organization_audit_ledger IS
  'Append-only organization audit ledger. Browser roles can read only authorized tenant rows or their own non-tenant rows; writes go through private helpers.';
COMMENT ON FUNCTION private.has_org_permission(uuid, text, uuid) IS
  'Checks tenant permissions from active organization_memberships only; user-controlled metadata is not an authorization source.';
COMMENT ON FUNCTION private.assert_org_permission(uuid, text, uuid) IS
  'Raises 42501 unless the user has the requested tenant permission.';
COMMENT ON FUNCTION private.append_org_audit_event(uuid, text, text, uuid, jsonb, uuid, text) IS
  'Appends a validated audit event, optionally asserting an organization permission before insert.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'organization_audit_ledger'
  ) THEN
    RAISE EXCEPTION 'organization audit ledger missing';
  END IF;

  IF has_table_privilege('authenticated', 'public.organization_audit_ledger', 'INSERT')
     OR has_table_privilege('authenticated', 'public.organization_audit_ledger', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.organization_audit_ledger', 'DELETE') THEN
    RAISE EXCEPTION 'organization audit ledger write privileges leaked to authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_audit_ledger'
      AND policyname = 'organization_audit_ledger_select'
      AND qual ~* 'has_org_permission'
  ) THEN
    RAISE EXCEPTION 'organization audit ledger select policy missing permission helper';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_prevent_organization_audit_ledger_mutation'
      AND tgrelid = 'public.organization_audit_ledger'::regclass
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'organization audit ledger append-only trigger missing';
  END IF;
END $$;
