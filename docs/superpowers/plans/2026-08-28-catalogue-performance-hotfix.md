# Catalogue Performance Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy only the materialized public-catalogue database path and prove its live latency without using or changing Stripe.

**Architecture:** A fail-closed manifest and validator bind two exact migration files. A dedicated GitHub Actions workflow applies the same migration subset to staging and then production through a temporary Supabase project, records normal migration history, and emits live performance evidence while leaving Pages and Edge runtimes unchanged.

**Tech Stack:** Node.js 22, GitHub Actions, Supabase CLI 2.104.0, PostgreSQL/psql, Vitest/Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-28-catalogue-performance-hotfix-design.md`

## Global Constraints

- Never read, print, use, update, or validate a Stripe credential in this hotfix.
- Apply only `20260728123058_materialize_public_catalogue_snapshots.sql` and `20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql`.
- Do not deploy Cloudflare Pages, Supabase Edge Functions, or any unrelated pending migration.
- Keep the live frontend marker at `db53d1b9adae41edae93fbeb3e612b42dd8fec0b`.
- Run staging before production and fail closed on any identity, digest, scope, contract, or latency mismatch.
- Use additive forward repair for a committed database failure; never rewrite applied migrations or migration history.

---

### Task 1: Bind and validate the exact catalogue hotfix

**Files:**
- Create: `scripts/catalogue-performance-hotfix-manifest.json`
- Create: `scripts/catalogue-performance-hotfix-contract.mjs`
- Create: `scripts/catalogue-performance-hotfix-contract.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: repository root, manifest path, and the two migration files.
- Produces: `validateCataloguePerformanceHotfix(root, manifest)` returning a canonical versioned record with normalized paths, lowercase SHA-256 values, fixed live SHA, target project refs, and latency ceilings; CLI command `node scripts/catalogue-performance-hotfix-contract.mjs verify --json`.

- [x] **Step 1: Write failing contract tests**

Cover the real validator with temporary fixture files and literal SHA-256 values. Require acceptance of the exact two-file manifest and rejection of an unknown path, duplicate path, digest mismatch, malformed SHA, non-SQL file, extra manifest field, Stripe secret token, and billing/subscription/payment table mutation.

- [x] **Step 2: Verify the tests fail for the missing validator**

Run:

```powershell
npm run runtime -- node --test scripts/catalogue-performance-hotfix-contract.test.mjs
```

Expected: failure because `catalogue-performance-hotfix-contract.mjs` does not exist.

- [x] **Step 3: Implement the minimal pure validator and CLI**

Use `node:crypto`, `node:fs`, and `node:path` only. Canonicalize separators to `/`, reject paths outside `supabase/migrations/`, calculate file hashes from bytes, and emit JSON without secret or connection data. The authoritative migration hashes are:

```text
0333355f5bd97bcdbe401743afeb93ef302e1f0b23f4a2cf0715cc85e5f476ff
f20d21b6c1368d0406e607a308ddd68ff1deaaf98a7d2a73927d857ddf7d85aa
```

- [x] **Step 4: Verify focused tests and the real manifest**

Run:

```powershell
npm run runtime -- node --test scripts/catalogue-performance-hotfix-contract.test.mjs
npm run runtime -- node scripts/catalogue-performance-hotfix-contract.mjs verify --json
```

Expected: all focused tests pass and the CLI emits `ok: true` with exactly two migrations.

- [x] **Step 5: Commit the contract**

```powershell
git add package.json scripts/catalogue-performance-hotfix-manifest.json scripts/catalogue-performance-hotfix-contract.mjs scripts/catalogue-performance-hotfix-contract.test.mjs
git commit -m "ci: bind catalogue performance hotfix scope"
```

---

### Task 2: Add the staging-to-production database-only workflow

**Files:**
- Create: `.github/workflows/deploy-catalogue-performance-hotfix.yml`
- Create: `scripts/catalogue-performance-hotfix-workflow.test.mjs`
- Modify: `scripts/release-safety-inventory.mjs`
- Modify: `scripts/release-safety-inventory.test.mjs`
- Modify: `docs/PRODUCTION_RELEASE_RUNBOOK.md`

**Interfaces:**
- Consumes: Task 1's validated canonical record, exact current `main` SHA, staging and production database URLs, GitHub actor, and input confirmation `DEPLOY_CATALOGUE_PERFORMANCE_HOTFIX`.
- Produces: staging and production evidence JSON artifacts containing target kind, release SHA, frontend SHA, migration versions/digests, database contract, HTTP sample status/durations, p50/p95, and UTC timestamps.

- [ ] **Step 1: Write failing workflow behavior tests**

Parse the workflow YAML as data and assert observable job behavior: exact `workflow_dispatch` inputs; validate → staging → production dependency chain; `environment: staging` and `environment: production`; contract CLI execution before either mutation; temporary migration-directory construction from validated remote numeric history; dry-run allowlist validation; Supabase CLI push by database URL; post-apply migration/RPC/publication checks; 30 live samples; artifact upload; exact frontend marker check; and absence of Stripe secrets, Stripe commands, Edge deployment, Pages deployment, `migration repair`, and unrestricted `supabase db push` against the repository migration directory.

- [ ] **Step 2: Verify the workflow tests fail**

Run:

```powershell
npm run runtime -- node --test scripts/catalogue-performance-hotfix-workflow.test.mjs
```

Expected: failure because the workflow does not exist.

- [ ] **Step 3: Implement the workflow and release-safety inventory rule**

Pin all third-party actions to full commit SHAs already used by the repository. Require `release_sha` to equal both current `main` and checked-out `HEAD`; require the live marker to equal the manifest's fixed SHA. Build the temporary migration project under `$RUNNER_TEMP`, copy only the validated paths, and prove the dry-run pending set is a subset of the manifest before applying. Use the existing release deployer allowlist and the repository's single-admin break-glass validation without emitting the reason or credentials.

- [ ] **Step 4: Verify focused and release-safety tests**

Run:

```powershell
npm run runtime -- node --test scripts/catalogue-performance-hotfix-workflow.test.mjs
npm run runtime -- node --test scripts/release-safety-inventory.test.mjs
npm run runtime -- npm run check:release-safety
```

Expected: all commands pass with no inventory drift.

- [ ] **Step 5: Commit the workflow**

```powershell
git add .github/workflows/deploy-catalogue-performance-hotfix.yml scripts/catalogue-performance-hotfix-workflow.test.mjs scripts/release-safety-inventory.mjs scripts/release-safety-inventory.test.mjs docs/PRODUCTION_RELEASE_RUNBOOK.md
git commit -m "ci: stage catalogue database performance hotfix"
```

---

### Task 3: Review, merge, deploy, and remeasure

**Files:**
- Verify all files changed by Tasks 1 and 2.
- Update: `docs/performance/2026-08-28-production-predeployment-baseline.md` with a postdeployment section only after measurement.

**Interfaces:**
- Consumes: green task commits and task reviews.
- Produces: merged exact `main` SHA, passing staging and production hotfix artifacts, verified production database contract, and a before/after timing table.

- [ ] **Step 1: Run deterministic verification**

```powershell
npm run runtime -- node --test scripts/catalogue-performance-hotfix-contract.test.mjs
npm run runtime -- node --test scripts/catalogue-performance-hotfix-workflow.test.mjs
npm run runtime -- npm run check:release-safety
npm run runtime -- npm run check:secrets
npm run runtime -- npm run typecheck
npm run runtime -- npm test -- --maxWorkers=1 --reporter=dot
```

- [ ] **Step 2: Review task diffs and the aggregate branch**

Require clean spec-compliance and code-quality reviews. Resolve every Critical
or Important finding and rerun the affected tests.

- [ ] **Step 3: Push and merge through the reviewed PR path**

Update PR #587, wait for required checks, merge, and resolve the new full
remote `main` SHA. Do not reuse the failed `31c35ebd` staging attempt.

- [ ] **Step 4: Dispatch the exact hotfix workflow**

Dispatch `Deploy Catalogue Performance Hotfix` for the new `main` SHA with
`confirm=DEPLOY_CATALOGUE_PERFORMANCE_HOTFIX`. Require staging success before
production and preserve all evidence artifacts.

- [ ] **Step 5: Verify production and collect timings**

Run 30 cold and 30 warm public catalogue samples, five fresh-browser samples
for public navigation and catalogue readiness, three sign-in/sign-out cycles,
signup-page readiness, listing-wizard step timings, and a publication test only
where exact-ID cleanup can be independently proven. Record HTTP status, cache
state, duration, p50/p95, browser errors, frontend SHA, and database-hotfix SHA.

- [ ] **Step 6: Decide the next release from evidence**

If catalogue/API budgets pass but Auth or frontend budgets fail, prepare a
separate frontend-only artifact rooted at the live Pages SHA. Do not deploy the
payment-sensitive `main` tree until Stripe is rotated and the normal
coordinated release passes its live-readiness proof.
