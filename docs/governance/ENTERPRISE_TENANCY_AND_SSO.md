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

Authorization must use `organization_memberships`. User-controlled profile fields, `user_metadata`, request bodies, and SSO assertions are not authorization sources.

## RLS Contract

The migration enables RLS on every enterprise table and restricts browser access to authenticated users. The core helpers are:

- `private.is_org_member(org_id, user_id)` for tenant visibility.
- `private.has_org_role(org_id, roles, user_id)` for owner/admin/security/billing workflows.
- `private.has_org_permission(org_id, permission, user_id)` and `private.assert_org_permission(...)` for permission-name based policy and RPC guards.
- `organization_audit_ledger` plus `private.append_org_audit_event(...)` for append-only tenant audit events.

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

## Procurement Evidence

Procurement evidence status lives in `procurement_evidence`. The source-controlled checklist is `docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md`; organization-specific records should reference actual evidence URLs or storage paths without embedding secrets.

database membership remains the authorization source of truth for viewing and updating procurement evidence.
