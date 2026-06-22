# ECAS Phase 9-15 Strict Reaudit - 2026-06-22

Scope: evidence added and rechecked for ECAS phases 9-15: RLS/database performance, enterprise tenant model, observability, GitHub/supply-chain governance, Cloudflare/Supabase ops proof, 10x/enterprise soak evidence, and final ECAS grading.

## Executive Verdict

The app is materially stronger than the earlier ECAS baseline, but this repo should not claim a procurement-grade `A` across every dimension yet. The verified state is closer to a strong `B` / `B+` release posture with several external or operator-controlled blockers: Supabase leaked-password protection, live Sentry issue queries, Cloudflare management evidence, full production 10x/soak execution, restore-drill execution, and live GitHub admin-setting enforcement.

## Fresh Evidence

| Area | Evidence |
|---|---|
| RLS CRUD proof | Live production read-only query on `qvvicunqcrwpioqnvzxf`: 73 public tables, 292 CRUD cells, 0 RLS-disabled cells, 0 unsafe classifications. |
| Supabase advisors | Security advisor: only `auth_leaked_password_protection` WARN. Performance advisor: `unused_index` INFO findings only; no high/critical finding was observed. |
| Supabase functions | Production Edge Function inventory lists active functions including recent service-boundary functions: `open-house-registration`, `create-new-building-listing`, `project-management`, `submit-firesale-request`, and related admin/service functions. |
| GitHub Actions | Latest `main` commit `b0b25931` has successful Release Please, CI, and CodeQL runs. |
| Cloudflare deploy smoke | `npm run check:production-deploy -- https://portal.maiprop.co --browser --public-api` passed with public APIs online. |
| Browser smoke | In-app browser loaded `https://portal.maiprop.co/`, app mounted, expected navigation links rendered, and 0 console errors were captured. |
| Performance gate | `npm run test:perf` passed: build, typecheck, 10 Playwright performance/query-budget tests. |
| Standards gates | `check:ecas-hardening`, `check:enterprise-readiness-basics`, `check:github-governance`, `check:standards-readiness`, `check:perf-proof`, and `check:dr-readiness` passed. |
| CircleCI | `.circleci/config.yml` passed YAML lint and `circleci config validate`. GitHub Actions remains the active primary CI path. |

## Scorecard

| # | Dimension | Grade | Certainty | Strict Finding | ASAP Fix |
|---:|---|---|---:|---|---|
| 1 | Business Architecture | B- | 78% | Domains are now more recognizable, but business rules are still split across React, Edge Functions, migrations, and docs. | Continue moving mutation/business rules into domain services and shared schemas. |
| 2 | Repository Architecture | B- | 82% | ADR/package boundaries exist, but this is still a pragmatic single-app repo rather than a clean enterprise monorepo. | Keep extracting shared schemas/domain helpers; defer disruptive full monorepo split until release pressure is lower. |
| 3 | TypeScript Maturity | B | 85% | Runtime pinning and type-debt gates exist; remaining debt is tracked rather than eliminated. | Burn down type-debt baseline file by file. |
| 4 | React Frontend | B | 82% | Perf/query gates pass; direct client reads remain acceptable where RLS-safe, but sensitive writes must keep moving behind Edge boundaries. | Keep service-boundary inventory current and prevent new direct sensitive writes. |
| 5 | Backend / Edge Architecture | B | 82% | Edge/service boundary is improving, especially for open-house, firesale, and project writes. | Finish service ownership docs and contract tests for every high-risk mutation. |
| 6 | Supabase Architecture | B+ | 90% | RLS and Edge Function posture is strong; leaked-password protection remains dashboard/plan gated. | Enable leaked-password protection when plan/settings allow. |
| 7 | Database Engineering | B | 88% | Live CRUD/RLS proof is clean; performance advisor still reports unused-index INFO findings. | Review unused indexes with real query history before dropping anything. |
| 8 | Security | B+ | 88% | No live high/critical Supabase advisor findings observed; remaining password leak protection is external. | Enable leaked-password protection and keep live advisor artifacts in release evidence. |
| 9 | RLS Security | A- | 94% | 73 public tables and 292 CRUD cells classified cleanly with 0 RLS-disabled cells. | Run destructive tenant-escape fixtures only against approved non-production environments before procurement. |
| 10 | Authorization | B | 85% | Org membership, permission helpers, audit ledger, and IDOR test markers are enforced by readiness checks. | Build admin UX and lifecycle workflows around org membership/delegation. |
| 11 | API Design | B- | 82% | OpenAPI and public-function inventories are gated; error/version contracts are still uneven. | Expand OpenAPI coverage to every Edge Function response/error contract. |
| 12 | Validation | B | 84% | Schema-first validation gates exist for high-risk mutation paths. | Extend schema-first parsing to every remaining low-risk mutation for uniformity. |
| 13 | Testing | B+ | 88% | Focused Vitest, Deno, Playwright perf, standards, and governance gates passed. | Keep adding live-safe E2E tests for authenticated dashboard flows. |
| 14 | Performance | B | 86% | Local perf/query budgets pass and load-test proof framework exists. Full production 10x/soak remains approval/quota dependent. | Run approved staging/prod load ladder and save normalized k6 artifacts. |
| 15 | Observability | B- | 80% | Sentry wiring and health tests exist; live Sentry issue query is blocked by missing local `SENTRY_AUTH_TOKEN`. | Configure read-only Sentry token in the operator shell/CI and archive last-24h issue evidence. |
| 16 | DevOps | B+ | 88% | GitHub Actions main is green; DR/deploy checks pass; CircleCI config validates as secondary. | Avoid duplicate CI spend by keeping GitHub as primary and CircleCI as optional mirror until needed. |
| 17 | GitHub Governance | B | 82% | Source-controlled governance gates pass; latest main CI/CodeQL/Release Please are green. | Verify live branch protection, push protection, and environment approvals in GitHub admin UI/API. |
| 18 | Cloudflare | B | 84% | Production smoke passes; management-level WAF/cache/rate-limit evidence is blocked by missing Cloudflare API token. | Capture Cloudflare Pages/WAF/rate-limit settings with a scoped read-only token. |
| 19 | Infrastructure | B- | 80% | DR readiness docs and gates pass, but restore drill remains operator-executed evidence. | Run and record a non-production restore drill. |
| 20 | Data Governance | B- | 80% | Governance docs exist for privacy, deletion, retention, and procurement evidence. | Automate DSAR/export and retention verification checks. |
| 21 | AI Governance | B- | 80% | AI quota and latency/cost logging contracts exist, but live spend telemetry is not fully proven here. | Add release artifact for AI request latency/cost percentiles. |
| 22 | Multi-Tenancy | B | 84% | Org model and RLS/IDOR markers are now source-gated. | Finish UX and administrative lifecycle around organizations. |
| 23 | Enterprise Readiness | B- | 80% | SSO/SAML configuration model and procurement evidence docs exist, but external IdP/certification evidence is not complete. | Add real IdP test tenant, SAML metadata validation, and procurement evidence pack owner sign-off. |
| 24 | Scalability | B | 85% | Query budgets and load-test contracts exist; production 10x/soak proof is not complete. | Run staging load ladder, enterprise soak, and capped production canary in an approved window. |
| 25 | Deployment Readiness | B+ | 88% | Production deploy smoke passed and latest main is green. | Confirm live admin settings and rollback/restore evidence after the next deploy. |

## Remaining Exceptions

1. Supabase leaked-password protection remains disabled and must be enabled in Supabase Auth settings when available.
2. Live Sentry issue/event audit was not run because `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are not configured locally.
3. Cloudflare management evidence was not captured because `CLOUDFLARE_API_TOKEN` / Access credentials are not configured locally.
4. Full production 10x/enterprise soak was not rerun in this pass; the repo has the proof framework and static gates, but production execution needs explicit cost/risk approval.
5. Restore-drill execution remains an operator task; the repository has the runbook and readiness gate.
6. GitHub connector workflow reads returned 404 on this private repo; `gh` CLI was used for Actions evidence.

## 30/60/90-Day Roadmap

| Window | Action |
|---|---|
| 30 days | Enable Supabase leaked-password protection, add read-only Sentry evidence job, capture Cloudflare admin settings, and archive a fresh RLS CRUD matrix artifact. |
| 60 days | Run staging load ladder and enterprise soak with k6 artifacts; execute a non-production restore drill; finish OpenAPI response/error coverage. |
| 90 days | Complete real IdP SSO/SAML test tenant, DSAR/export automation, and org-admin lifecycle UX; regrade ECAS aiming for A-/A where external evidence is complete. |
