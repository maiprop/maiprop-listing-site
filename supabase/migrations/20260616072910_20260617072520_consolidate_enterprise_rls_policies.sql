-- Split broad enterprise FOR ALL management policies into command-specific
-- write policies. This removes Supabase advisor overlap with SELECT policies
-- without expanding the authenticated role's effective table privileges.

DROP POLICY IF EXISTS organization_memberships_manage
  ON public.organization_memberships;
DROP POLICY IF EXISTS organization_memberships_manage_insert
  ON public.organization_memberships;
CREATE POLICY organization_memberships_manage_insert
  ON public.organization_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_memberships_manage_update
  ON public.organization_memberships;
CREATE POLICY organization_memberships_manage_update
  ON public.organization_memberships
  FOR UPDATE
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_domains_manage
  ON public.organization_domains;
DROP POLICY IF EXISTS organization_domains_manage_insert
  ON public.organization_domains;
CREATE POLICY organization_domains_manage_insert
  ON public.organization_domains
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_domains_manage_update
  ON public.organization_domains;
CREATE POLICY organization_domains_manage_update
  ON public.organization_domains
  FOR UPDATE
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_sso_providers_manage
  ON public.organization_sso_providers;
DROP POLICY IF EXISTS organization_sso_providers_manage_insert
  ON public.organization_sso_providers;
CREATE POLICY organization_sso_providers_manage_insert
  ON public.organization_sso_providers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS organization_sso_providers_manage_update
  ON public.organization_sso_providers;
CREATE POLICY organization_sso_providers_manage_update
  ON public.organization_sso_providers
  FOR UPDATE
  TO authenticated
  USING (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  )
  WITH CHECK (
    private.has_org_role(organization_id, ARRAY['owner', 'admin', 'security_admin'], (SELECT auth.uid()))
    OR private.has_platform_admin((SELECT auth.uid()))
  );

DROP POLICY IF EXISTS procurement_evidence_manage
  ON public.procurement_evidence;
DROP POLICY IF EXISTS procurement_evidence_manage_insert
  ON public.procurement_evidence;
CREATE POLICY procurement_evidence_manage_insert
  ON public.procurement_evidence
  FOR INSERT
  TO authenticated
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin', 'billing_admin', 'security_admin'],
        (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS procurement_evidence_manage_update
  ON public.procurement_evidence;
CREATE POLICY procurement_evidence_manage_update
  ON public.procurement_evidence
  FOR UPDATE
  TO authenticated
  USING (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin', 'billing_admin', 'security_admin'],
        (SELECT auth.uid())
      )
    )
  )
  WITH CHECK (
    private.has_platform_admin((SELECT auth.uid()))
    OR (
      organization_id IS NOT NULL
      AND private.has_org_role(
        organization_id,
        ARRAY['owner', 'admin', 'billing_admin', 'security_admin'],
        (SELECT auth.uid())
      )
    )
  );

DO $$
DECLARE
  expected_policy_count integer;
BEGIN
  SELECT count(*)
  INTO expected_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN (
      'organization_memberships',
      'organization_domains',
      'organization_sso_providers',
      'procurement_evidence'
    )
    AND policyname IN (
      'organization_memberships_manage_insert',
      'organization_memberships_manage_update',
      'organization_domains_manage_insert',
      'organization_domains_manage_update',
      'organization_sso_providers_manage_insert',
      'organization_sso_providers_manage_update',
      'procurement_evidence_manage_insert',
      'procurement_evidence_manage_update'
    )
    AND cmd IN ('INSERT', 'UPDATE')
    AND 'authenticated' = ANY(roles);

  IF expected_policy_count <> 8 THEN
    RAISE EXCEPTION 'enterprise write policy consolidation incomplete';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'organization_memberships',
        'organization_domains',
        'organization_sso_providers',
        'procurement_evidence'
      )
      AND policyname IN (
        'organization_memberships_manage',
        'organization_domains_manage',
        'organization_sso_providers_manage',
        'procurement_evidence_manage'
      )
      AND cmd = 'ALL'
  ) THEN
    RAISE EXCEPTION 'enterprise management FOR ALL policies remain';
  END IF;
END $$;
