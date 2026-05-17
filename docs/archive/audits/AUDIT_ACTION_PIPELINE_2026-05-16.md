# Audit Action Pipeline - 2026-05-16

This document reassesses the current audit findings and converts them into an
execution pipeline. It is intentionally ordered by blast radius: public mutation
and entitlement risks first, CI/staging fidelity second, product clarity and
maintainability after the core gates are stable.

## Current Facts

- `src/integrations/supabase/types.ts` is 3,747 lines, below the current CI
  warning threshold of 5,000 lines. The risk is freshness/schema drift, not file
  size by itself.
- `supabase/config.toml` currently has 21 `verify_jwt = false` functions.
- Linked Supabase advisors last reported 201 items: 46 security warnings, 92
  multiple permissive policy warnings, 59 unused index infos, and 4 unindexed
  foreign key infos.
- Local Supabase reset now applies the full migration chain through
  `20260707080000_harden_participant_type_entitlement_audience.sql`.
- Linked migration dry-run is blocked by one out-of-order pending migration:
  `20260516055821_guard_record_listing_view_public_visibility.sql`; live apply
  requires the explicit `--include-all` path.
- Full Playwright last ran with 305 passed, 281 skipped, and 11 failed.
- Production edge function deploy is a manual workflow and defaults to dry run.
  Staging edge deploy is automated from `main` and manual dispatch.

## Reassessment

| Priority | Finding | Reassessment | Action Lane |
| --- | --- | --- | --- |
| P0 | Every `verify_jwt = false` AI/costly/mutating endpoint must have auth, quota, signature, or secret protection. | Correct. This is the top security class. Existing invariants cover `ai-search` and `smart-filters`, but coverage must extend to every public function. | Public endpoint protection inventory. |
| P1 | `/firesale` is public; confirm deal and interest mutations are investor/admin locked. | Public marketing route is acceptable. Mutations need recurring RLS and live/staging verification. Existing migrations show investor/admin guards, but add a regression gate. | Firesale RLS smoke. |
| P1 | OS sync functions are unauthenticated in config and rely on handler checks, secrets, cron, or HMAC. | Correct. Some `verify_jwt = false` functions manually require bearer auth, some use HMAC, some use cron secrets. The protection model needs machine-readable classification. | Public endpoint protection inventory. |
| P1 | `force_pro_access` still elevates UI and server pro gates. | Intentional admin/test override, but risky if undocumented or user-writable. Existing migrations guard user writes; require admin-only auditability and production policy. | Entitlement contract. |
| P1 | Business rules live in UI, Edge, and SQL. | Correct and proven by recent bugs. SQL must be enforcement, Edge orchestration, UI presentation only. | Entitlement contract. |
| P1 | PR quality and E2E use placeholder Supabase env. | Correct. Placeholder PR E2E is a smoke gate, not integration proof. Staging security E2E must be required for protected release branches. | CI fidelity. |
| P1 | Generated Supabase types growth creates schema drift risk. | Downgrade to P2 as written. Size is not the issue today; freshness is. | Generated types freshness. |
| P1 | Pro/free feature boundaries are scattered across Pricing, Billing, and inline locks. | Product P1, security P2. Build one access summary so users see current plan, billing source, limits, and locked features. Enforcement remains server-side. | Plan visibility. |
| P2 | Subscription loading logic is complex. | Correct. `useSubscription.ts` is only 192 lines, but it coordinates several entitlement sources. Extract pure resolution helpers and keep tests matrixed. | Entitlement contract. |
| P2 | Admin pricing vs public pricing cache invalidation. | Valid. Save/seed/create paths invalidate public pricing; delete currently invalidates admin pricing only. | Pricing cache fix. |
| P2 | Many hooks/pages make onboarding heavy. | Correct maintainability issue. Address with ownership maps and focused extraction, not broad refactors. | Codebase onboarding. |
| P2 | Large Dashboard page. | Correct. `Dashboard.tsx` is 668 lines and `BillingTab.tsx` is 1,052 lines. Split by route/tab registry after security gates. | Dashboard modularization. |
| P2 | `/firesale` public vs `/investor-dashboard` protected; hide Quick Sale until eligible. | Needs nuance. Public Quick Sale marketing can stay visible. Protected deal flow should only appear for eligible users; dashboard nav already partially gates it. | Plan visibility and nav semantics. |
| P2 | Production Supabase edge deploy process needs confirmation. | Mostly addressed by manual `deploy-edge-functions.yml`, dry-run default, main-only guard, and production environment. Needs release checklist integration. | Release operations. |
| P2 | Many GitHub secrets; onboarding docs should list them. | Partially addressed by `docs/ENV_SETUP.md`; enforce with generated inventory to prevent drift. | Secrets inventory. |
| P2 | Bare Postgres CI is not Supabase RLS runtime. | Correct. Bare Postgres migration validation is useful but cannot prove auth/RLS behavior. Staging E2E and local Supabase reset are the source of truth. | CI fidelity. |
| P2 | 100+ migrations are operational burden. | Correct. Do not squash production history. Consider a new-environment baseline only after release stabilization. | Migration operations. |
| P2 | Document swapped Supabase anon/service-role key names in ops runbooks. | The local testing skill says they are swapped; repo docs mostly describe normal names. Verify current secret reality, then update the skill/docs so operators stop guessing. | Secrets inventory. |
| P3 | Lighthouse only on main with secrets. | Correct priority. Keep authenticated Lighthouse on main; add a no-secret PR performance smoke only after functional E2E is stable. | Performance gate. |

## Pipeline

### Phase 0 - Stabilize The Facts

Goal: make the audit inputs reproducible before changing behavior.

1. Public endpoint inventory
   - Generate a machine-readable inventory for every `verify_jwt = false`
     function.
   - Required fields: function, caller type, auth mechanism, quota/rate limit,
     mutation surface, service-role usage, expected public status, tests.
   - Fail if any public function is unclassified.
   - Verification: `npm run check:release-safety` or a new dedicated
     `npm run check:public-functions`.

2. Advisor baseline
   - Save current linked and local advisor summaries.
   - Split each warning into: intentional/documented, safe win, needs design,
     or false positive.
   - Verification: advisor count deltas are tracked; new untriaged security
     warnings fail release review.

3. Generated types freshness
   - Replace the line-count-only concern with a freshness check.
   - Regenerate Supabase types from staging/linked schema in a controlled job
     and fail if `src/integrations/supabase/types.ts` differs unexpectedly.
   - Verification: CI diff proves the generated file matches the chosen schema.

### Phase 1 - Block P0/P1 Risk

Goal: prevent public abuse, entitlement drift, and integration-only failures.

1. Public endpoint protection gate
   - For AI and costly public endpoints: require signed-in quota or strict
     fail-closed rate limiting before provider work.
   - For webhooks: require signature/HMAC before parsing or mutation.
   - For cron/internal jobs: require `CRON_SECRET` or an authenticated admin
     bearer path; document why `verify_jwt = false` is required.
   - For public read endpoints: allowlist response fields and apply rate
     limits where scraping matters.
   - Verification: static invariant plus Deno tests for missing/invalid/valid
     credentials.

2. Entitlement contract
   - Declare SQL as the enforcement source for Pro/role limits.
   - Keep Edge helpers as orchestration only and UI hooks as display only.
   - Build a role/plan matrix covering free/pro, seller/buyer/agent/developer,
     professional, investor/private/institutional, expired Stripe, mock billing,
     and `force_pro_access`.
   - Verification: Vitest invariant matrix, Deno checkout/webhook tests, and
     staging RLS E2E.

3. CI fidelity
   - Keep placeholder PR E2E as smoke only.
   - Require staging security E2E for same-repo non-draft PRs and every release
     branch.
   - Add explicit CI labels/output that says "placeholder smoke" vs "staging
     integration" so nobody reads smoke as proof.
   - Verification: branch protection requires quality, release safety, E2E,
     staging security, migration validation, and Lighthouse for production.

4. Firesale mutation proof
   - Add staging E2E/RLS tests proving anonymous users can view marketing but
     cannot create investor interest, reserve deals, or mutate deal state.
   - Prove eligible investors can express interest only on published deals.
   - Verification: `e2e/rls-security.spec.ts` includes Quick Sale assertions.

5. Stripe real-mode prelaunch
   - Keep mock billing clearly labeled.
   - Before paid launch, run a Stripe CLI/live test-mode checklist:
     checkout session, webhook signature, subscription activation, cancellation,
     expired subscription fallback, customer portal, and invoice listing.
   - Verification: real `checkout.stripe.com` redirect and signed webhook event
     in staging.

### Phase 2 - Fix High-Signal P2s

Goal: remove the most likely sources of future regressions.

1. Pricing cache fix
   - Invalidate `pricing-configs-public` after deleting an admin pricing row.
   - Add a unit test around delete invalidation.
   - Verification: `AdminPricing.test.tsx` or focused hook/component test.

2. `force_pro_access` governance
   - Document it as an admin-only test/support override.
   - Add audit logging for changes if missing.
   - Decide whether production should allow it at all outside platform admins.
   - Verification: RLS/update tests prove ordinary users cannot change it.

3. Release operations
   - Update promotion checklist so production edge deploy is an explicit manual
     step after staging deploy, staging security E2E, and live function drift
     inventory.
   - Keep dry-run default and main-only guard.
   - Verification: release checklist references `deploy-edge-functions.yml`.

4. Secrets inventory
   - Generate a workflow-secret inventory from CI and compare it to
     `docs/ENV_SETUP.md`.
   - Verify whether local testing secret names are actually swapped; update the
     repo skill and runbooks with the current truth.
   - Verification: release safety fails on undocumented workflow secrets.

5. Migration operations
   - Keep full-history migrations for production.
   - For new environments only, design a baseline/squash plan after the current
     security release is stable.
   - Verification: local Supabase reset and linked dry-run stay green.

### Phase 3 - Product Clarity And Maintainability

Goal: reduce user confusion and engineer onboarding cost without weakening
server-side enforcement.

1. Plan and access summary
   - Add one dashboard/Billing surface that shows plan, audience, billing
     source, renewal/expiry, `force_pro_access` support state, and current
     feature limits.
   - Reuse this in Pricing/Billing instead of scattering slightly different
     explanations.
   - Verification: role/plan UI tests for current plan and locked states.

2. Nav semantics
   - Keep `/firesale` visible as public seller marketing if product wants that.
   - Gate protected investor deal flow in dashboard/nav by eligibility.
   - Use labels that distinguish "Quick Sale for sellers" from "Investor deal
     flow" to avoid accidental promise leakage.
   - Verification: mobile and desktop nav tests.

3. Dashboard modularization
   - Split `Dashboard.tsx` by tab registry and render adapters.
   - Split `BillingTab.tsx` into plan summary, payment actions, add-ons, and
     invoice/history sections.
   - Verification: no route behavior changes; existing dashboard tests stay
     green.

4. Onboarding/codebase map
   - Maintain a concise ownership map for pages, hooks, Edge functions, and
     database enforcement.
   - Prefer per-domain README files over a single giant architecture doc.
   - Verification: new engineer can find entitlement, pricing, firesale, and
     OS integration owners from docs.

### Phase 4 - Performance And Advisor Debt

Goal: improve release signal after correctness gates are trustworthy.

1. Playwright failure cleanup
   - Fix the 11 current failures first: title expectation, Firefox auctions
     `networkidle`, and mobile selectors hitting hidden desktop elements.
   - Verification: full Playwright passes locally and in CI.

2. PR performance smoke
   - Add no-secret Lighthouse or bundle/perf smoke on PRs.
   - Keep authenticated Lighthouse on `main` with staging secrets.
   - Verification: PR perf smoke catches large regressions without blocking on
     unavailable secrets.

3. Advisor debt reduction
   - Work through security-definer grants, permissive policy duplicates, public
     bucket listing, leaked password protection, unused indexes, and unindexed
     foreign keys in small batches.
   - Verification: advisor deltas trend down; intentional warnings are
     documented with rationale.

## Execution Rules

- Do not treat UI gating as security. SQL/RLS and Edge functions enforce.
- Do not apply live migrations from an out-of-order state without an explicit
  `--include-all` release decision.
- Do not squash production migration history. Baseline only new environments.
- Do not mark Stripe complete while billing mode returns mock checkout URLs.
- Do not count placeholder Supabase PR E2E as integration proof.
- Every fixed issue needs a test or release-safety invariant before closing.

