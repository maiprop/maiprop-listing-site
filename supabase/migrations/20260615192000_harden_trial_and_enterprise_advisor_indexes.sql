-- Clear advisor drift from the Pro trial and enterprise tenant foundations.
-- These indexes support foreign-key joins/deletes; the policy rewrite keeps the
-- same owner-only trial visibility while avoiding repeated auth.uid() initplans.

BEGIN;

DROP POLICY IF EXISTS "subscription_trial_claims_select_own"
  ON public.subscription_trial_claims;
CREATE POLICY "subscription_trial_claims_select_own"
  ON public.subscription_trial_claims
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by
  ON public.organizations (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_memberships_invited_by
  ON public.organization_memberships (invited_by)
  WHERE invited_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_domains_created_by
  ON public.organization_domains (created_by)
  WHERE created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_sso_providers_domain_id
  ON public.organization_sso_providers (domain_id)
  WHERE domain_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organization_sso_providers_configured_by
  ON public.organization_sso_providers (configured_by)
  WHERE configured_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_procurement_evidence_owner_user_id
  ON public.procurement_evidence (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

COMMIT;
