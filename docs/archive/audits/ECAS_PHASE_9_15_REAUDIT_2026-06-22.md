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
| GitHub Actions | Latest `main` release commit `72513169` has successful Release Please, CodeQL, and CI run `28043405941`, including Cloudflare production deployment and post-deploy health check. |
| Cloudflare deploy smoke | `npm run check:production-deploy -- https://portal.maiprop.co --browser --public-api` passed with public APIs online. Standards Evidence run `28044234620` also captured the Cloudflare Pages project via GitHub secrets. |
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
| 18 | Cloudflare | B | 86% | Production smoke passes and Standards Evidence run `28044234620` captured Pages project posture via GitHub secrets. Detailed WAF/cache/rate-limit evidence is still not fully modeled in the capture script. | Extend Cloudflare capture to WAF, bot/rate-limit, and cache rules with a scoped read-only token. |
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
3. Cloudflare Pages management evidence was captured in Standards Evidence run `28044234620` using GitHub secrets. Local shell capture remains unconfigured because `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `CLOUDFLARE_PAGES_PROJECT` are not exported locally. Detailed WAF, bot/rate-limit, and cache-rule capture remains a follow-up.
4. Full production 10x/enterprise soak was not rerun in this pass; the repo has the proof framework and static gates, but production execution needs explicit cost/risk approval.
5. Restore-drill execution remains an operator task; the repository has the runbook and readiness gate.
6. GitHub connector workflow reads returned 404 on this private repo; `gh` CLI was used for Actions evidence.

## Added Live-Evidence Gate

Follow-up branch `codex/ecas-live-evidence-hardening` adds redacted, read-only
capture scripts for the remaining provider evidence:

- `npm run capture:sentry-live-evidence`
- `npm run capture:cloudflare-admin-posture`
- `npm run capture:github-admin-posture`
- `npm run check:ecas-live-evidence`

These scripts are advisory by default so local development and CI are not
blocked when provider audit tokens are absent. In procurement or release-audit
mode, run `npm run check:ecas-live-evidence -- --strict` after all provider
artifacts have been captured.

## 2026-06-23 Evidence Follow-Up

- `npm run check:ecas-hardening`, `npm run check:enterprise-readiness-basics`,
  and `npm run check:standards-readiness` passed on commit
  `0145793152164ac0fe5b4da22c48914251a00fa8`.
- Production k6 smoke first run failed strict route-level availability gates:
  `api_listings`, `api_open_houses`, and `sitemap` each failed once out of 63
  route requests. Overall p95 and overall error rate still passed. Artifact:
  `artifacts/performance/k6-smoke-2026-06-23/load-test-summary.json`.
- Immediate production k6 smoke rerun passed: 448 requests, 10 peak VUs, zero
  failed routes, p95 24.82 ms. Artifact:
  `artifacts/performance/k6-smoke-2026-06-23-rerun/load-test-summary.json`.
- Direct route probes after the rerun returned 25/25 HTTP 200 responses for
  `/api/public/listings?limit=24`, `/api/public/open-houses?limit=24`, and
  `/sitemap-dynamic.xml`; responses were served from Cloudflare cache/stale
  cache where applicable.
- Supabase connector read-only verification against project `qvvicunqcrwpioqnvzxf`
  returned 73 public tables with RLS enabled, 0 public tables with RLS disabled,
  and no RLS-disabled table names.
- Supabase Security Advisor returned one WARN: `auth_leaked_password_protection`.
  Supabase Performance Advisor returned INFO-level `unused_index` findings only;
  no high/critical advisor finding was observed in this pass.
- Strict live evidence gate remains blocked, not failed by source code:
  Sentry evidence is unconfigured, Cloudflare evidence is unconfigured, and
  GitHub live admin evidence is blocked by the GitHub branch-protection API
  returning `403` for the current private repository/plan.
- Cloudflare management evidence was cross-checked with local Wrangler on
  2026-06-23; `npx wrangler whoami` reported the session is not authenticated,
  and no `CLOUDFLARE_*` or `CF_*` environment variables are set in the shell.
- Release Please PR #412 was squash-merged on 2026-06-23 as
  `7251316915bae10e20237628a8227c2a68a01c7f`; tag `v1.11.3` was created and
  the release branch was deleted.
- Standards Evidence workflow run `28043794057` failed because
  `gh pr list` requires `pull-requests: read`. Branch
  `codex/ecas-completion-admin-evidence` adds that permission, and verification
  run `28044234620` passed.
- Standards Evidence artifact `28044234620` captured Cloudflare Pages posture:
  project `maiprop-listing-site`, production branch `main`, domains
  `maiprop-listing-site.pages.dev` and `portal.maiprop.co`, latest deployment
  environment `production`. The same artifact recorded Sentry as unconfigured
  because `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are absent.

## 30/60/90-Day Roadmap

| Window | Action |
|---|---|
| 30 days | Enable Supabase leaked-password protection, add read-only Sentry evidence job, capture Cloudflare admin settings, and archive a fresh RLS CRUD matrix artifact. |
| 60 days | Run staging load ladder and enterprise soak with k6 artifacts; execute a non-production restore drill; finish OpenAPI response/error coverage. |
| 90 days | Complete real IdP SSO/SAML test tenant, DSAR/export automation, and org-admin lifecycle UX; regrade ECAS aiming for A-/A where external evidence is complete. |
