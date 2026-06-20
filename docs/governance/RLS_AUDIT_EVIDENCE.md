# RLS and Audit Evidence

This document tracks the code-only RLS/security proof added for tenant and audit foundations.

## Source-Controlled Proof

| Control | Evidence |
|---|---|
| Cross-user isolation | `e2e/rls-security.spec.ts` signs in two seeded users and proves profile and saved-search cross-user denial. |
| Anonymous denial without recursion | `e2e/rls-security.spec.ts` probes protected organization tables through REST and asserts no HTTP 500 or `42P17` recursion. |
| Tenant member/non-member boundaries | `e2e/rls-security.spec.ts` seeds isolated org fixtures only on allowlisted non-production projects and proves member read, non-member deny, forged role deny, and forged `organization_id` deny. |
| Admin override | `e2e/rls-security.spec.ts` optionally signs in an explicit admin fixture and proves platform-admin tenant reads. |
| Permission foundation | `supabase/migrations/20260620084356_org_permission_audit_foundation.sql` adds `private.has_org_permission` and `private.assert_org_permission`. |
| Append-only audit foundation | `supabase/migrations/20260620084356_org_permission_audit_foundation.sql` adds `organization_audit_ledger`, write-revokes browser roles, and blocks updates/deletes with `trg_prevent_organization_audit_ledger_mutation`. |

## Operating Notes

- Destructive org fixture tests require `E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS=true` and an allowlisted non-production Supabase project.
- The production Supabase project must not be used for fixture creation.
- Personal flows remain explicit: future policies that adopt org helpers should keep `organization_id IS NULL` branches rather than relying on tenant helpers to authorize null-org rows.
