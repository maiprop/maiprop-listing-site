# Platform architecture and access

This describes inspected candidate source, updated 27 September 2026. It is not a deployment or whole-module acceptance statement. See [the remediation checkpoint](superpowers/plans/2026-09-27-remediation-checkpoint.md) for remaining gates.

## Independent access dimensions

| Dimension | Source and enforcement |
| --- | --- |
| Authority | Protected profiles.role; frontend helpers in src/lib/authUtils.ts, database authoritative_role/has_platform_admin and resource-specific policies/RPCs. Admin is a role, never an email match. |
| Participant identity | src/lib/participantConfig.ts selects dashboard/pricing audience. Explicit onboarding uses participant_type; legacy display fallback can read role/bio. Presentation identity does not grant authority. |
| Billing entitlement | src/hooks/useSubscription.ts consumes durable validated grant state; Edge _shared/entitlements.ts checks active pricing configuration against audience/product/price. Database entitlement helpers enforce server access. Admin/managed overrides and investor grants are not proof of a Stripe payment. |
| Resource permission | Ownership, organization membership/permission, workflow state and RLS/RPC checks apply independently of plan or route visibility. |

Route guards improve navigation; they do not replace backend checks. Sell-side roles include seller, agent, developer and institutional, with explicit admin handling. Investor access includes eligibility/subscription checks. Inspect the actual guard and server operation for the action under test.

## Limits and accounting

The audience-specific display contract is [usePlanLimits.ts](../src/hooks/usePlanLimits.ts). For example, buyer Free has one saved search, one search alert, one monthly contact, three monthly Open House RSVPs, one monthly viewing, five monthly valuations and a 60-row auction window. Buyer Pro has five search/auction alerts, ten monthly viewings, fifty monthly valuations, three monthly reports and a 600-row auction window; saved searches/contacts/RSVPs are unlimited. Other audiences differ. Zero means unavailable and null means unlimited in this display contract. These examples do not prove every path's enforcement or describe current hosted configuration.

Server limits live in effective database helpers, triggers and service RPCs, not in a universal Free/Pro table. AI handlers call enforceAiQuota before provider work: it verifies the actor and reserves through service-only reserve_ai_quota_for_user. The normal database trigger consumes usage; purchased credits contribute through get_ai_call_monthly_limit. There is no post-success recordAiCall writer. Usage readers and credit balances remain. See [selected schema lineage](effective-schema-remediation-map.md); full final replay/equivalence is still pending.

## Data and performance

React Query caches are actor-scoped where data is private. Favourite hearts share projected membership rows; saved-property views separately hydrate listings and retain inaccessible joins as null. Failed optimistic writes roll back without overwriting another actor's cache. Related professionals use a four-field public projection, category/exclusion filters and a stable three-row bound. Full directory and management interfaces remain.

Public website catalogue routes live in functions/api/public; Supabase services live in supabase/functions. Public projections deliberately differ from owner/admin raw management. Never expose protected data in HTML and merely blur it as an access control. Public SEO output must use the authorized public projection.

Performance findings require comparable measurements, not assertions that every app path is optimized. Source-bound transfer improvements and local tests are separate from hosted latency, provider availability and final browser acceptance.

## Current and proposed architecture

The app remains one root npm project with multiple runtime surfaces. The package extraction layout in [Repository Architecture](REPOSITORY_ARCHITECTURE.md) is a future direction, not implemented restructuring. Modules and migration history remain; removal requires consumer and compatibility evidence.

Email uses multiple direct producers plus an existing queue consumer. See [ADR-004](adr/004-pgmq-email-queue.md). Release follows the [Production Release Runbook](PRODUCTION_RELEASE_RUNBOOK.md); a local implementation does not enable cleanup, reconciliation, billing or schedulers.
