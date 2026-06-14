-- Enterprise tenant foundation, SSO/SAML metadata mapping, and procurement
-- evidence tracking. This migration is additive and does not change existing
-- consumer, listing, or project workflows.

CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 200),
  slug text NOT NULL UNIQUE CHECK (
    slug = lower(slug)
    AND slug ~ '^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$'
  ),
  plan text NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise', 'internal')),
  procurement_status text NOT NULL DEFAULT 'not_started' CHECK (
    procurement_status IN ('not_started', 'in_review', 'approved', 'blocked')
  ),
  security_review_status text NOT NULL DEFAULT 'not_started' CHECK (
    security_review_status IN ('not_started', 'in_review', 'approved', 'blocked')
  ),
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (
    role IN ('owner', 'admin', 'member', 'viewer', 'billing_admin', 'security_admin')
  ),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended')),
  invited_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.organization_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL CHECK (
    domain = lower(domain)
    AND domain ~ '^[a-z0-9][a-z0-9.-]*[a-z]$'
    AND domain LIKE '%.%'
    AND domain !~ '\.\.'
    AND domain !~ '(^|\.)(-|$)'
    AND domain !~ '-(\.|$)'
  ),
  verification_status text NOT NULL DEFAULT 'pending' CHECK (
    verification_status IN ('pending', 'verified', 'rejected')
  ),
  sso_required boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (domain)
);

CREATE TABLE IF NOT EXISTS public.organization_sso_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain_id uuid REFERENCES public.organization_domains(id) ON DELETE SET NULL,
  provider_type text NOT NULL DEFAULT 'saml' CHECK (provider_type IN ('saml')),
  supabase_provider_id uuid,
  entity_id text,
  metadata_url text CHECK (metadata_url IS NULL OR metadata_url ~ '^https://'),
  attribute_mapping jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attribute_mapping) = 'object'),
  status text NOT NULL DEFAULT 'planned' CHECK (
    status IN ('planned', 'configured', 'testing', 'active', 'disabled')
  ),
  configured_by uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.procurement_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (
    evidence_type IN (
      'security_questionnaire',
      'data_processing_agreement',
      'subprocessor_list',
      'insurance',
      'penetration_test',
      'soc2_or_iso',
      'business_continuity',
      'privacy_policy',
      'terms',
      'architecture_overview',
      'rls_test_report',
      'backup_restore_drill',
      'incident_response',
      'sso_configuration',
      'vendor_risk'
    )
  ),
  status text NOT NULL DEFAULT 'needed' CHECK (
    status IN ('needed', 'in_progress', 'approved', 'not_applicable', 'expired')
  ),
  evidence_url text,
  owner_user_id uuid REFERENCES public.profiles(user_id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  expires_at timestamptz,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_memberships_user_id
  ON public.organization_memberships (user_id);
CREATE INDEX IF NOT EXISTS idx_organization_memberships_org_status_role
  ON public.organization_memberships (organization_id, status, role);
CREATE INDEX IF NOT EXISTS idx_organization_domains_org_id
  ON public.organization_domains (organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_sso_providers_org_id
  ON public.organization_sso_providers (organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_organization_sso_supabase_provider_id
  ON public.organization_sso_providers (supabase_provider_id)
  WHERE supabase_provider_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_procurement_evidence_org_status_type
  ON public.procurement_evidence (organization_id, status, evidence_type);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_sso_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.procurement_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organizations FROM anon;
REVOKE ALL ON TABLE public.organization_memberships FROM anon;
REVOKE ALL ON TABLE public.organization_domains FROM anon;
REVOKE ALL ON TABLE public.organization_sso_providers FROM anon;
REVOKE ALL ON TABLE public.procurement_evidence FROM anon;

REVOKE ALL ON TABLE public.organizations FROM authenticated;
REVOKE ALL ON TABLE public.organization_memberships FROM authenticated;
REVOKE ALL ON TABLE public.organization_domains FROM authenticated;
REVOKE ALL ON TABLE public.organization_sso_providers FROM authenticated;
REVOKE ALL ON TABLE public.procurement_evidence FROM authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_memberships TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_domains TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.organization_sso_providers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.procurement_evidence TO authenticated;

CREATE OR REPLACE FUNCTION private.is_org_member(
  p_org_id uuid,
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.organization_memberships memberships
      WHERE memberships.organization_id = p_org_id
        AND memberships.user_id = p_user_id
        AND memberships.status = 'active'
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION private.has_org_role(
  p_org_id uuid,
  p_roles text[],
  p_user_id uuid DEFAULT auth.uid()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM public.organization_memberships memberships
      WHERE memberships.organization_id = p_org_id
        AND memberships.user_id = p_user_id
        AND memberships.status = 'active'
        AND memberships.role = ANY(p_roles)
    ),
    false
  )
$$;

CREATE OR REPLACE FUNCTION private.org_id_for_sso_provider(p_provider_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT organization_id
  FROM public.organization_sso_providers
  WHERE supabase_provider_id = p_provider_id
    AND status = 'active'
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION private.create_org_owner_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
    VALUES (NEW.id, NEW.created_by, 'owner', 'active')
    ON CONFLICT (organization_id, user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.guard_org_membership_update()
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

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'permission_denied: membership identity cannot be changed';
  END IF;

  IF NEW.user_id = v_actor
     AND (NEW.role IS DISTINCT FROM OLD.role OR NEW.status IS DISTINCT FROM OLD.status) THEN
    RAISE EXCEPTION 'permission_denied: users cannot change their own organization role or status';
  END IF;

  IF (OLD.role = 'owner' OR NEW.role = 'owner')
     AND NOT private.has_org_role(OLD.organization_id, ARRAY['owner'], v_actor) THEN
    RAISE EXCEPTION 'permission_denied: only organization owners can manage owner memberships';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.is_org_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_org_role(uuid, text[], uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.org_id_for_sso_provider(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_org_owner_membership() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.guard_org_membership_update() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION private.is_org_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_org_role(uuid, text[], uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.org_id_for_sso_provider(uuid) TO service_role;

COMMENT ON TABLE public.organizations IS
  'Enterprise tenant records. Existing individual-user flows remain supported outside this model.';
COMMENT ON TABLE public.organization_sso_providers IS
  'Metadata pointer to Supabase SSO/SAML provider configuration. SAML metadata XML, certificates, and IdP secrets are not stored in application tables.';
COMMENT ON TABLE public.procurement_evidence IS
  'Per-organization enterprise procurement evidence tracker for due-diligence, security review, and renewal status.';
COMMENT ON FUNCTION private.is_org_member(uuid, uuid) IS
  'Authorizes organization access from database membership, not user-controlled metadata claims.';
COMMENT ON FUNCTION private.has_org_role(uuid, text[], uuid) IS
  'Checks active organization role membership for RLS and enterprise admin flows.';

DROP TRIGGER IF EXISTS trg_organizations_owner_membership ON public.organizations;
CREATE TRIGGER trg_organizations_owner_membership
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION private.create_org_owner_membership();

DROP TRIGGER IF EXISTS trg_guard_org_membership_update ON public.organization_memberships;
CREATE TRIGGER trg_guard_org_membership_update
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_org_membership_update();

DROP TRIGGER IF EXISTS trg_touch_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_touch_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_organization_memberships_updated_at ON public.organization_memberships;
CREATE TRIGGER trg_touch_organization_memberships_updated_at
  BEFORE UPDATE ON public.organization_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_organization_domains_updated_at ON public.organization_domains;
CREATE TRIGGER trg_touch_organization_domains_updated_at
  BEFORE UPDATE ON public.organization_domains
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_organization_sso_providers_updated_at ON public.organization_sso_providers;
CREATE TRIGGER trg_touch_organization_sso_providers_updated_at
  BEFORE UPDATE ON public.organization_sso_providers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_touch_procurement_evidence_updated_at ON public.procurement_evidence;
CREATE TRIGGER trg_touch_procurement_evidence_updated_at
  BEFORE UPDATE ON public.procurement_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP POLICY IF EXISTS organizations_select_members ON public.organizations;
CREATE POLICY organizations_select_members
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (
    private.is_org_member(id, (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organizations_insert_self ON public.organizations;
CREATE POLICY organizations_insert_self
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = (SELECT auth.uid())
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organizations_update_admins ON public.organizations;
CREATE POLICY organizations_update_admins
  ON public.organizations
  FOR UPDATE
  TO authenticated
  USING (
    private.has_org_role(id, ARRAY['owner', 'admin', 'billing_admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(id, ARRAY['owner', 'admin', 'billing_admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_memberships_select_members ON public.organization_memberships;
CREATE POLICY organization_memberships_select_members
  ON public.organization_memberships
  FOR SELECT
  TO authenticated
  USING (
    private.is_org_member(organization_id, (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_memberships_manage ON public.organization_memberships;
CREATE POLICY organization_memberships_manage
  ON public.organization_memberships
  FOR ALL
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_domains_select_members ON public.organization_domains;
CREATE POLICY organization_domains_select_members
  ON public.organization_domains
  FOR SELECT
  TO authenticated
  USING (
    private.is_org_member(organization_id, (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_domains_manage ON public.organization_domains;
CREATE POLICY organization_domains_manage
  ON public.organization_domains
  FOR ALL
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_sso_providers_select_admins ON public.organization_sso_providers;
CREATE POLICY organization_sso_providers_select_admins
  ON public.organization_sso_providers
  FOR SELECT
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_sso_providers_manage ON public.organization_sso_providers;
CREATE POLICY organization_sso_providers_manage
  ON public.organization_sso_providers
  FOR ALL
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS procurement_evidence_select_admins ON public.procurement_evidence;
CREATE POLICY procurement_evidence_select_admins
  ON public.procurement_evidence
  FOR SELECT
  TO authenticated
  USING (
    organization_id IS NULL
    OR private.has_org_role(organization_id, ARRAY['owner', 'admin', 'billing_admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS procurement_evidence_manage ON public.procurement_evidence;
CREATE POLICY procurement_evidence_manage
  ON public.procurement_evidence
  FOR ALL
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_role(organization_id, ARRAY['owner', 'admin', 'billing_admin', 'security_admin'], (SELECT auth.uid()))
    )
  )
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_role(organization_id, ARRAY['owner', 'admin', 'billing_admin', 'security_admin'], (SELECT auth.uid()))
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'organizations',
        'organization_memberships',
        'organization_domains',
        'organization_sso_providers',
        'procurement_evidence'
      )
    GROUP BY schemaname
    HAVING count(*) = 5
  ) THEN
    RAISE EXCEPTION 'enterprise tenant tables missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'organizations_select_members'
      AND qual ~* 'is_org_member'
  ) THEN
    RAISE EXCEPTION 'organization member select policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organization_sso_providers'
      AND policyname = 'organization_sso_providers_manage'
      AND with_check ~* 'has_org_role'
  ) THEN
    RAISE EXCEPTION 'organization SSO provider management policy missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'procurement_evidence'
      AND policyname = 'procurement_evidence_manage'
      AND with_check ~* 'has_org_role'
  ) THEN
    RAISE EXCEPTION 'procurement evidence management policy missing';
  END IF;
END $$;
