# ECAS Deep Audit With Stripe Coverage - 2026-06-29

Audit target:
- Production truth: `origin/main` at `8af11e6046beba12af2634026fff78218fbc213d` (`v1.11.8`).
- Pending truth: local `codex/stripe-full-wire-integration` at `9d28db69eb802e74653ffe1554bb309d3953125e`, with a large dirty worktree.

Scope:
- Read-only/live-safe audit.
- Supabase live posture was checked with the available project access token.
- No live exploitation, destructive E2E, production write, or heavy load/soak was run.
- Provider admin evidence for Sentry, Cloudflare, and GitHub was not fully current via the strict evidence script.

## Executive Verdict

`main` is operationally deployable for the current product, but it is not yet enterprise-grade under strict ECAS because local full-suite reproducibility, live provider evidence, public API reliability evidence, and E2E environment contracts are not clean.

`codex/stripe-full-wire-integration` is not merge-ready. The core Stripe architecture is promising and many Stripe-focused tests pass, but the branch currently fails release-safety, ECAS hardening, mutation-validation, full unit smoke tests, and full E2E.

Strict answers:
- Production ready: `main` conditional yes; Stripe branch no.
- Scalable: partial yes; perf/query-budget gates pass, but no new approved 10x/soak in this audit.
- Secure: Supabase/RLS/security posture is strong; Stripe branch has boundary and type-safety gaps.
- New-developer safe: not fully; clean-worktree E2E and local full-unit reproducibility are weak.
- Enterprise procurement ready: no; live Sentry/Cloudflare/GitHub evidence and SSO/DR proof are incomplete.
- Due-diligence ready: not yet; evidence pack has gaps and branch hygiene is not clean.

Overall ECAS score:
- `main`: **82/100, B** with 82% confidence.
- Stripe branch: **72/100, C+** with 74% confidence.
- Stripe implementation only: **C+ release readiness / B- architecture** with 76% confidence.

## Evidence Summary

### Main Snapshot

Passed:
- `npm run runtime -- npm ci`
- `npm run runtime -- npm run check:secrets`
- `npm run runtime -- npm run lint:migrations:chronology`
- `npm run runtime -- npm run check:ecas-hardening`
- `npm run runtime -- npm run check:standards-readiness`
- `npm run runtime -- npm run check:mutation-validation`
- `npm run runtime -- npm run check:openapi-coverage`
- `npm run runtime -- npm run check:github-governance`
- `npm run runtime -- npm run check:dora-readiness`
- `npm run runtime -- npm run check:slsa-readiness`
- `npm run runtime -- npm run check:wcag-coverage`
- `npm run runtime -- npm run check:perf-proof`
- `npm run runtime -- npm run typecheck`
- `npm run runtime -- npm run test:deno`
- `npm run runtime -- npm run check:rls-crud-matrix`: passed for 76 public tables.
- `npm run runtime -- npm run check:live-security-posture`
- `npm run runtime -- npm run check:supabase-advisor`: 0 failing lints; 164 accepted/review items.
- `npm run runtime -- npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run runtime -- npm run test:perf`: 10/10 passed.
- `MapView.test.tsx` passes with `VITE_MAPBOX_TOKEN` set.

Failed or blocked:
- `npm run runtime -- npm run test` without Mapbox token: 1 file / 7 map tests failed.
- `npm run runtime -- npm run test` with a dummy Mapbox token: 6 files / 12 tests failed locally. Latest GitHub CI on `main` is green, so this is local reproducibility or test-order sensitivity, not proven production breakage.
- `npm run runtime -- npm run test:e2e`: blocked/failed in clean worktree because `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` were absent.
- `npm run runtime -- npm run check:ecas-live-evidence -- --strict`: missing Sentry, Cloudflare, and GitHub live evidence.

Live/manual public UX probe:
- Desktop/mobile `/`, `/listings`, `/auctions`, `/professionals`, `/new-build/1a296bc6-8941-405b-9b81-1c4f5776dd8f`, and `/open-house/34d2f993-61ea-400b-831e-0c56fdf28504` returned HTTP 200.
- No sampled horizontal overflow.
- `/professionals` logged a 401 resource error.
- New-build and open-house detail pages lacked a detectable `main`/`#main-content`/`role=main` landmark.
- Open-house desktop load took about 12.2 seconds in one run.
- Direct public API probes returned JSON 200s, but unit/live probes earlier observed transient SPA HTML or upstream-unavailable responses.

### Stripe Branch Snapshot

Passed:
- `npm run runtime -- npm run check:secrets`
- `npm run runtime -- npm run lint:migrations:chronology`
- `npm run runtime -- npm run check:standards-readiness`
- `npm run runtime -- npm run check:openapi-coverage`
- `npm run runtime -- npm run check:github-governance`
- `npm run runtime -- npm run check:dora-readiness`
- `npm run runtime -- npm run check:slsa-readiness`
- `npm run runtime -- npm run check:wcag-coverage`
- `npm run runtime -- npm run check:perf-proof`
- `npm run runtime -- npm run typecheck`
- `npm run runtime -- npm run test:deno`
- Focused Stripe/Billing unit suite: 15 files / 80 tests passed.
- `npm run runtime -- npm run check:rls-crud-matrix`: passed for 76 public tables.
- `npm run runtime -- npm run check:live-security-posture`
- `npm run runtime -- npm run check:supabase-advisor`: 0 failing lints.
- `npm run runtime -- npm audit --audit-level=high`: 0 vulnerabilities.
- `npm run runtime -- npm run test:perf`: 10/10 passed.

Failed or blocked:
- `npm run runtime -- npm run check:ecas-hardening`
  - `AdminInvitationRequests.tsx` invokes `create-investor-payment` with a request body without function-boundary evidence.
  - `BillingTab.tsx` invokes `customer-portal` with a request body without function-boundary evidence.
- `npm run runtime -- npm run check:mutation-validation`
  - `customer-portal` reads a raw request body without edge-function request-boundary evidence.
- `npm run runtime -- npm run test` with Mapbox token: 4 files / 5 tests failed.
  - Release safety inventory failed.
  - Dashboard smoke tests timed out/duplicated navbar.
  - OpenHouseDetail malformed-id smoke timed out.
- `npm run runtime -- npm run test:e2e`: failed early on auction image fallback, AI valuation, accessibility, and auth checks.
- `npm run runtime -- npm run check:ecas-live-evidence -- --strict`: Sentry/Cloudflare unconfigured; GitHub evidence blocked.
- Static scan found production type escapes:
  - `src/components/POFVerificationPanel.tsx` uses `as never`.
  - Several Edge Function helpers use `as any` around Supabase clients.
- Branch has future-dated migration names in the working tree, including July 2026 and one June 30, 2026 migration while audit date is June 29, 2026.

## ECAS Dimension Grades

| # | Dimension | Main Grade | Main Certainty | Stripe Branch Grade | Branch Certainty | Evidence And Risk | ASAP Fix |
|---|---|---:|---:|---:|---:|---|---|
| 1 | Business Architecture | B | 82% | B- | 76% | Main domains are recognizable. Stripe adds billing logic but expands cross-cutting rules across UI, Edge, and SQL. | Centralize billing/domain workflows into service contracts and update architecture docs. |
| 2 | Repository Architecture | B- | 84% | C+ | 74% | Main remote clean. Branch is very large, dirty, and contains future-dated migration artifacts. | Split Stripe branch into clean PRs; remove/rename future-dated migrations; keep one reviewable slice per domain. |
| 3 | TypeScript Maturity | B+ | 88% | B | 83% | Typecheck passes both. Branch has `as never` in production and Edge `as any` debt. | Remove `as never`; replace broad Edge client casts with typed adapters. |
| 4 | React Frontend | B- | 78% | C+ | 68% | Main and branch local full-unit smoke tests fail. Live public pages mostly load, but detail pages lack main landmarks. | Stabilize Dashboard/OpenHouse/Professional smoke tests; add landmarks to detail layouts. |
| 5 | Backend / Edge Architecture | B+ | 85% | B- | 72% | Main hardening passes. Branch fails function-boundary evidence around billing calls. | Add schema-bound Edge request boundaries for `customer-portal`, `create-investor-payment`, and dashboard callers. |
| 6 | Supabase Architecture | A- | 92% | B+ | 86% | RLS matrix and live security posture pass. Advisor has 0 failing lints. Branch migration hygiene lowers grade. | Keep generated types current; remove future-date migration exceptions. |
| 7 | Database Engineering | B+ | 86% | B | 80% | Perf proof and advisor pass. No fresh heavy 10x load or restore drill was executed in this audit. | Run approved restore drill and non-invasive index telemetry review. |
| 8 | Security | B+ | 88% | B- | 78% | Secrets/audit/security posture pass. Branch billing boundary/type escapes remain. | Close branch hardening failures; verify billing IDOR/cross-user reads with E2E/test-mode data. |
| 9 | RLS Security | A- | 93% | A- | 90% | Live `check:rls-crud-matrix` passed for 76 public tables on both snapshots. | Keep malicious-actor CRUD tests in CI and add Stripe billing ledger RLS proof. |
| 10 | Authorization | B | 84% | B- | 78% | Role/plan gates exist. Full org/tenant maturity is still not complete. | Harden org membership/resource ownership and billing entitlement downgrade paths. |
| 11 | API Design | B | 82% | B- | 75% | OpenAPI coverage passes. Live public API showed transient fail-open warnings in tests, direct probes later returned JSON. | Add public API uptime/JSON-shape monitor and fail CI on SPA fallback for API routes. |
| 12 | Validation | B | 84% | C+ | 70% | Main mutation-validation passes. Branch fails raw body boundary in `customer-portal`. | Add Zod/schema-first request parsing for every Stripe Edge function body. |
| 13 | Testing | C+ | 68% | C | 60% | GitHub main CI green, but local full unit and full E2E are not reproducible cleanly. Branch full unit and E2E fail. | Fix flaky/timeouting smoke tests; document local E2E env contract; require branch full-suite green before PR. |
| 14 | Performance | B+ | 86% | B+ | 84% | `test:perf` passed 10/10 on both. Large lazy chunks remain (`mapbox-gl`, `LazyRecharts`, main index). | Keep chart/map lazy; add route-level bundle budgets and AI response p95 telemetry. |
| 15 | Observability | C+ | 65% | C | 58% | Strict live evidence missing/unconfigured for Sentry and Cloudflare. | Refresh Sentry evidence, define alerts as code, and wire release health checks. |
| 16 | DevOps | B+ | 86% | C+ | 70% | Main GitHub CI/CodeQL/Release Please green at current SHA. Branch has no PR and local blockers. | Do not merge branch until all release gates pass; add clean-worktree audit command. |
| 17 | GitHub Governance | B+ | 88% | C | 65% | GitHub remote has no open PRs; latest main CI green. Strict provider evidence still missing. | Capture branch protection/environment approval evidence into live-evidence artifacts. |
| 18 | Cloudflare | B- | 72% | B- | 70% | Public pages load; strict Cloudflare evidence missing; API probes had transient fail-open warnings. | Verify Pages Functions routing, WAF/Bot/Access posture, API JSON monitor, and cache behavior. |
| 19 | Infrastructure | B | 78% | B- | 73% | Perf gates pass and prior restore artifacts exist, but no fresh non-prod restore/PITR drill in this audit. | Run current restore drill against non-prod target and attach evidence. |
| 20 | Data Governance | B | 80% | B | 78% | GDPR/retention docs and tests exist. Stripe billing data extends PII/payment metadata surface. | Add billing-specific retention, export, and deletion checks. |
| 21 | AI Governance | B | 80% | B | 78% | AI quota and valuation tests exist; AI latency and cost evidence not live-verified. | Add AI response time/cost dashboard and alert budgets per feature. |
| 22 | Multi-Tenancy | B | 80% | B- | 75% | User/resource isolation is strong; full enterprise org model still maturing. | Complete org membership/capabilities model and tenant-owned billing resources. |
| 23 | Enterprise Readiness | B- | 72% | C+ | 68% | SSO/SAML/procurement/live evidence not complete. | Attach SSO test IdP proof, procurement checklist, and vendor-risk evidence. |
| 24 | Scalability | B+ | 84% | B+ | 82% | Perf/query-budget gates pass; k6 artifacts exist. No new approved live 10x/soak run. | Schedule approved 10x/soak window and compare against SLOs. |
| 25 | Deployment Readiness | B | 80% | D+ | 58% | Main production CI is green but local reproducibility has gaps. Branch has release-safety and test blockers. | Keep `main` as deploy source; do not deploy Stripe branch until blockers are closed. |

## Stripe/Billing Strict Assessment

Grade: **C+ release readiness / B- architecture**.

What is strong:
- Checkout, webhook, subscription check, customer portal, invoice, pricing sync, investor payment, and data-input credit functions have Deno tests.
- Webhook signature checks and idempotency behavior are covered.
- Focused frontend Stripe/Billing tests passed: 15 files / 80 tests.
- Billing state tables and add-on ledgers are represented in migrations/tests.
- `test:perf` passed on the Stripe branch.

Release blockers:
1. Release safety inventory fails because `emergency-db-maintenance-20260629` has source without config.
2. Stripe tax code env vars are used but undocumented:
   - `STRIPE_AI_BUSINESS_TAX_CODE`
   - `STRIPE_AI_PERSONAL_TAX_CODE`
   - `STRIPE_SAAS_BUSINESS_TAX_CODE`
   - `STRIPE_SAAS_PERSONAL_TAX_CODE`
3. `check:ecas-hardening` fails on missing function-boundary evidence for `create-investor-payment` and `customer-portal` browser calls.
4. `check:mutation-validation` fails because `customer-portal` reads raw body without schema-bound request evidence.
5. Full unit smoke suite fails.
6. Full E2E fails early.
7. Branch still has type escapes and future-dated migration artifacts.

Stripe-specific ASAP fixes:
- Document all Stripe tax code env vars in env docs and release-safety inventory.
- Add/remove `emergency-db-maintenance-20260629` config so source and `supabase/config.toml` match.
- Add schema-first body parsing for `customer-portal`.
- Add request-boundary evidence comments/tests for browser-to-Edge billing calls.
- Add cross-user billing read/price escalation tests.
- Run test-mode Checkout/Portal happy path with approved test credentials.
- Prove downgrade on canceled, failed, expired trial, and unpaid states.

## Risk Matrix

Critical:
- Stripe branch is not merge-ready because release-safety, hardening, mutation-validation, full unit, and E2E checks fail.

High:
- Clean-worktree local full unit and E2E reproducibility are not enterprise-grade.
- Strict provider live evidence for Sentry, Cloudflare, and GitHub is missing/unconfigured/blocked.
- Branch migration hygiene includes future-dated artifacts.
- Branch has production type escapes in sensitive proof-of-funds/billing-adjacent flows.

Medium:
- Public API live probes showed intermittent fail-open behavior in automated tests, even though direct probes later returned JSON.
- Detail pages lack a main landmark, reducing WCAG confidence.
- Open-house detail had one slow desktop load (~12.2s).
- Large route chunks remain; lazy strategy is good but budgets should be enforced per route.

Low:
- React `fetchPriority` casing warning appears in tests.
- Professionals page logs one 401 resource error on public probe.
- React Router future warnings appear in tests.

## Main vs Branch

Production `main`:
- Remote GitHub is clean: no open PRs.
- Latest `main` CI, CodeQL, and Release Please are green at `8af11e60`.
- Supabase/RLS/security live checks pass.
- Performance gates pass.
- Strict ECAS blockers remain around reproducible local tests, E2E env, live provider evidence, and enterprise evidence.

Stripe branch:
- Local only, large dirty worktree.
- Core Stripe tests are substantial and mostly healthy.
- Release readiness is blocked by failing inventory, boundary, validation, smoke, E2E, and migration hygiene.

## 30/60/90 Day Roadmap

30 days:
- Fix Stripe branch release-safety inventory.
- Fix `customer-portal` schema-first validation and billing request-boundary evidence.
- Remove production `as never` in `POFVerificationPanel`.
- Rename or formally justify future-dated branch migrations.
- Make `npm run test` reproducible from a clean local checkout.
- Document and automate local E2E env setup.
- Add main landmarks to new-build/open-house detail pages.

60 days:
- Add live Stripe test-mode checkout/portal/add-on/invoice E2E with approved test credentials.
- Add cross-user billing IDOR and price/product escalation tests.
- Add Cloudflare public API JSON-shape monitor and fail-open alerting.
- Refresh Sentry, Cloudflare, and GitHub governance evidence artifacts.
- Add route-level bundle budgets and AI response p95/cost telemetry.

90 days:
- Run approved 10x and enterprise soak window with rollback plan.
- Run fresh non-production restore/PITR/auth/storage drill.
- Complete org/tenant authorization model and billing resource ownership.
- Attach SSO/SAML test IdP proof and procurement evidence.
- Convert ECAS evidence into a repeatable release evidence pack.

## Not Verified

- No live destructive RLS exploitation or production data writes were performed.
- No fresh production 10x/enterprise soak was run.
- No fresh non-production full Supabase PITR/auth/storage restore was run.
- No live Stripe Checkout completion was executed.
- No current Sentry/Cloudflare/GitHub admin evidence was collected through the strict live-evidence script.
- Full E2E did not complete cleanly on either snapshot.
