# Procurement Evidence Matrix

Enterprise procurement should have a source-controlled map from buyer questions to evidence. The `procurement_evidence` table tracks organization-specific status, owner, review date, expiration, and evidence URL.

| Evidence | Status | Source of truth |
|---|---|---|
| Security questionnaire | In progress | `procurement_evidence.evidence_type = 'security_questionnaire'` |
| Data Processing Agreement | Needed | Legal artifact, linked from `procurement_evidence` when approved |
| Subprocessor list | Available | `src/locales/en.json` privacy processor list and legal page review |
| Privacy policy | Available | `src/pages/PrivacyPolicy.tsx` and localized privacy content |
| Terms of service | Available | `src/pages/TermsOfService.tsx` and localized terms content |
| Architecture overview | Available | `docs/adr/0001-initial-architecture.md` and ECAS audit artifacts |
| RLS test report | Available | `e2e/rls-security.spec.ts`, Supabase policies, and CI security gate |
| Tenant resource ownership | Available | `listings.organization_id`, `projects.organization_id`, and `20260702180854_enterprise_tenant_resource_ownership.sql` |
| Backup restore drill | App-schema replay and hosted-layer synthetic proof available; managed whole-project restore pending | `docs/compliance/dora/RESTORE_DRILL_LOG.md`, `docs/operations/restore-drill-evidence.md`, `scripts/check-dr-readiness.mjs`, and the restricted v2 evidence packet |
| Incident response | Available | `SECURITY.md`, `docs/DR_RUNBOOK.md`, and `docs/incidents/` templates |
| SAML/SSO configuration | Staging provider metadata registered; enablement blocked by current Supabase plan | `docs/governance/ENTERPRISE_TENANCY_AND_SSO.md` and Supabase staging provider evidence |
| Vendor risk | In progress | SBOM, license check, dependency audit, Cloudflare/Supabase/Sentry processor evidence |
| SOC 2 / ISO evidence is external and not claimed by this repository | Not available | Future certification or vendor attestation package |

## Operating Rules

- Do not attach secrets, SAML private keys, API keys, or certificates to procurement records.
- Link evidence by URL or storage path only after the destination has the same or stricter tenant access control.
- Keep status values aligned with `procurement_evidence.status`: `needed`, `in_progress`, `approved`, `not_applicable`, or `expired`.
- Review approved evidence at least every 90 days, and immediately after material architecture, processor, hosting, auth, or data-retention changes.

## Procurement Minimum

Before marking an enterprise organization procurement-ready, the organization should have approved records for:

- Security questionnaire
- Data Processing Agreement
- Subprocessor list
- Backup restore drill
- RLS test report
- SAML/SSO configuration, if the customer requires SSO
- Vendor risk
