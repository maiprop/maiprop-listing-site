# Enterprise Tenancy and SSO

This runbook defines the source-controlled enterprise org/tenant model and the SSO/SAML handoff. It is intentionally additive: current individual-user listing, messaging, analytics, and project flows continue to work without an organization.

## Data Model

The enterprise tenant foundation is stored in:

| Table | Purpose |
|---|---|
| `organizations` | Enterprise tenant/account record, procurement status, security review status, and tenant settings. |
| `organization_memberships` | User-to-organization membership, active role, and invite/suspension status. |
| `organization_domains` | Verified corporate domains and whether SSO is required for that domain. |
| `organization_sso_providers` | Metadata pointer to the Supabase SSO/SAML provider configuration. |
| `procurement_evidence` | Per-organization due-diligence evidence status and renewal tracking. |
| `listings.organization_id` | Optional tenant owner for enterprise listings; `NULL` keeps existing personal listing flows. |
| `projects.organization_id` | Optional tenant owner for enterprise developer/new-build projects; `NULL` keeps existing developer-owned project flows. |

Authorization must use `organization_memberships`. User-controlled profile fields, `user_metadata`, request bodies, and SSO assertions are not authorization sources.

## RLS Contract

The migration enables RLS on every enterprise table and restricts browser access to authenticated users. The core helpers are:

- `private.is_org_member(org_id, user_id)` for tenant visibility.
- `private.has_org_role(org_id, roles, user_id)` for owner/admin/security/billing workflows.
- `private.has_org_permission(org_id, permission, user_id)` and `private.assert_org_permission(...)` for permission-name based policy and RPC guards.
- `organization_audit_ledger` plus `private.append_org_audit_event(...)` for append-only tenant audit events.
- Tenant-owned listings and projects are authorized through `private.has_org_permission(..., 'listing:*' | 'project:*')` while personal rows keep explicit `organization_id IS NULL AND owner_id = auth.uid()` branches. This prevents org rollout from breaking existing individual users.

Owners and admins can manage memberships. Only owners can create or modify owner memberships. Users cannot update their own organization role or status. Deletes are not granted to browser roles; suspension/status changes preserve auditability.

## Supabase SSO/SAML

Supabase SSO/SAML provider configuration is managed outside the application database with `supabase sso` and the Supabase Auth SSO provider settings. SAML metadata is not stored in application tables.

The app-side handoff uses `signInWithSSO` from `@supabase/supabase-js`, wrapped by `src/lib/enterpriseSso.ts` so domain and provider-id inputs are schema-validated before any network call.

Expected setup sequence:

1. Create or verify the `organizations` row.
2. Verify a corporate domain in `organization_domains`.
3. Configure the IdP in Supabase using `supabase sso` or the dashboard.
4. Store only the Supabase provider UUID and non-secret metadata in `organization_sso_providers`.
5. Require SSO for the domain by setting `organization_domains.sso_required = true` after a successful staging sign-in.

Supabase SSO/SAML availability depends on the Supabase plan and project configuration. This repository provides the safe app and database wiring, but it does not claim that a paid SSO provider has been enabled.

## Live Verification Log

| Date | Scope | Result | Evidence |
|---|---|---|---|
| 2026-06-27 | App and source-controlled DB contract | Verified | `npx vitest run src/test/enterpriseSso.test.ts --reporter=dot` passed 3/3 tests; `npm run check:enterprise-readiness-basics` passed. |
| 2026-06-27 | Supabase production `qvvicunqcrwpioqnvzxf` | Provider not configured | Read-only Supabase SQL returned zero rows for `auth.sso_providers`, `auth.sso_domains`, `organization_sso_providers`, and `organization_domains`. |
| 2026-06-27 | Supabase staging `xsiehskfgeoqyazcgauv` | Provider not configured | Read-only Supabase SQL returned zero rows for `auth.sso_providers`, `auth.sso_domains`, `organization_sso_providers`, and `organization_domains`. |
| 2026-07-02 | First-class tenant resource ownership | Source-controlled | `20260702180854_enterprise_tenant_resource_ownership.sql` adds optional tenant ownership for `listings` and `projects`, RLS branches for tenant view/manage, and keeps existing personal flows. |
| 2026-07-13 | Supabase staging `xsiehskfgeoqyazcgauv` test IdP | Provider metadata registered; login blocked by plan; provider removed | A disposable SAMLTest IdP was registered against the staging ACS and entity ID. `signInWithSSO` returned `saml_provider_disabled`; the Management API then rejected `saml_enabled=true` with `SAML 2.0 support can only be enabled on Pro Plans and up.` The synthetic provider was removed after the test and `supabase sso list` returned no providers. No production provider or user was changed. |

ECAS status: the repository, database schema, and a disposable staging IdP are
ready, but the staging Supabase project cannot enable SAML on its current plan.
Enterprise SSO/SAML cannot be graded as live-ready until the provider is enabled
and a successful `signInWithSSO` browser login, tenant membership assignment,
session revocation, and deprovisioning flow are recorded. Do not mark SSO
procurement evidence as complete from source code or provider metadata alone.

The synthetic provider uses the non-production domain `maiprop.test`. It must
never be copied to production. Before any production SSO rollout, keep a tested
non-SSO platform owner as break-glass access, default SSO members to the least
privileged organization role, and bind the Supabase provider UUID to exactly one
organization after the first staging login succeeds.

## Procurement Evidence

Procurement evidence status lives in `procurement_evidence`. The source-controlled checklist is `docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md`; organization-specific records should reference actual evidence URLs or storage paths without embedding secrets.

database membership remains the authorization source of truth for viewing and updating procurement evidence.
