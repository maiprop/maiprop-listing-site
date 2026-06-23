# Complete ECAS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining ECAS work to the highest defensible grade by closing source-controlled gaps, collecting live provider evidence, and explicitly separating true external blockers from code debt.

**Architecture:** Treat ECAS completion as an evidence-backed release program, not a single code patch. Source-controlled controls stay in the repo; live provider controls are captured through read-only evidence scripts or admin screenshots/artifacts; risky production operations run only in approved windows.

**Tech Stack:** React, TypeScript, Supabase, Cloudflare Pages/Workers, GitHub Actions, CircleCI config, Sentry, k6, Playwright, Vitest, Deno tests, ECAS governance scripts.

---

## Current Verified State

- Branch: `codex/ecas-evidence-completion`
- Latest evidence commit: `6493db1d docs: update ECAS live evidence`
- Latest main verified SHA: `0145793152164ac0fe5b4da22c48914251a00fa8`
- Source gates passing: `check:ecas-hardening`, `check:enterprise-readiness-basics`, `check:standards-readiness`, `check:github-governance`, `check:perf-proof`, `check:dora-readiness`, `check:slsa-readiness`, `check:mutation-validation`, `check:secrets`
- Supabase live connector verified: 73 public tables, 73 with RLS enabled, 0 with RLS disabled
- Still open: live GitHub admin controls, Cloudflare admin evidence, Sentry live evidence, Supabase leaked-password protection, restore-drill proof, production 10x/enterprise soak proof

## Completion Definition

ECAS is complete only when all of these are true:

1. Every source-controlled ECAS gate passes on the final branch and on `main`.
2. `npm run check:ecas-live-evidence -- --strict` passes or each remaining provider blocker has a dated, reviewed exception with owner, reason, and next action.
3. Supabase Security Advisor has no unresolved security WARN except documented plan-blocked controls.
4. Restore drill has a dated `Successful` row and `npm run check:dr-restore-proof` passes.
5. Production or approved staging load ladder has current artifacts for smoke, baseline_100, growth_10x, and enterprise_soak.
6. Final ECAS report regrades all 25 dimensions with evidence links and confidence.

---

### Task 1: Freeze Baseline And Push Evidence Branch

**Files:**
- Modify: `docs/archive/audits/ECAS_PHASE_9_15_REAUDIT_2026-06-22.md`
- Verify: `artifacts/performance/k6-smoke-2026-06-23*/load-test-summary.json`

- [ ] **Step 1: Confirm clean branch state**

Run:

```powershell
git status --short --branch
git log -1 --oneline
```

Expected:

```text
## codex/ecas-evidence-completion
6493db1d docs: update ECAS live evidence
```

- [ ] **Step 2: Push the evidence branch**

Run:

```powershell
git push -u origin codex/ecas-evidence-completion
```

Expected: branch pushed without secret-scanning rejection.

- [ ] **Step 3: Open a draft PR**

Run:

```powershell
gh pr create `
  --repo maiprop/maiprop-listing-site `
  --base main `
  --head codex/ecas-evidence-completion `
  --draft `
  --title "docs: update ECAS live evidence" `
  --body "Updates ECAS, DORA, performance, and GitHub governance evidence. No runtime code changes."
```

Expected: PR URL returned.

- [ ] **Step 4: Verify PR checks start**

Run:

```powershell
gh pr checks --repo maiprop/maiprop-listing-site --watch
```

Expected: CI, CodeQL, and release-related checks complete successfully or fail with actionable logs.

---

### Task 2: Complete GitHub Admin Governance

**Files:**
- Modify: `docs/governance/LIVE_GITHUB_ADMIN_SETTINGS.md`
- Verify: `docs/governance/main-branch-protection.expected.json`
- Verify: `docs/governance/github-actions-policy.expected.json`

- [ ] **Step 1: Enable or document branch protection**

Admin action in GitHub UI:

```text
Repository Settings -> Branches -> Branch protection rules -> main
Enable:
- Require pull request before merging
- Require approvals
- Require status checks before merging
- Require branches to be up to date before merging
- Require conversation resolution
- Restrict force pushes
- Restrict deletions
```

If GitHub returns the current plan blocker, update `docs/governance/LIVE_GITHUB_ADMIN_SETTINGS.md` with:

```markdown
Branch protection remains blocked on YYYY-MM-DD because GitHub returned:
`Upgrade to GitHub Pro or make this repository public to enable this feature.`
Owner: repository admin.
Next action: upgrade GitHub plan or make repository public before procurement review.
```

- [ ] **Step 2: Configure production environment approvals**

Admin action in GitHub UI:

```text
Repository Settings -> Environments -> production
Enable:
- Required reviewers
- Wait timer if desired
- Prevent self-review where available
```

Update `docs/governance/LIVE_GITHUB_ADMIN_SETTINGS.md` with the reviewer group and verification date.

- [ ] **Step 3: Verify GitHub governance gate**

Run:

```powershell
npm run runtime -- npm run check:github-governance
```

Expected:

```text
GitHub governance evidence OK
```

---

### Task 3: Complete Supabase Security And Restore Proof

**Files:**
- Modify: `docs/RLS_ACCESS_MATRIX.md`
- Modify: `docs/SUPABASE_PERFORMANCE_ADVISOR_TRIAGE.md`
- Modify: `docs/compliance/dora/RESTORE_DRILL_LOG.md`
- Verify: `docs/backups/FREE_TIER_LOGICAL_BACKUPS.md`

- [ ] **Step 1: Enable leaked-password protection if available**

Admin action in Supabase:

```text
Authentication -> Providers / Security settings -> Password security
Enable leaked password protection.
```

If unavailable on the current plan, update `docs/RLS_ACCESS_MATRIX.md` with:

```markdown
Leaked-password protection remains plan blocked as of YYYY-MM-DD.
Owner: Supabase project admin.
Next action: enable immediately after the required Supabase plan/control is available.
```

- [ ] **Step 2: Capture live advisors**

Use the Supabase connector or local token.

Run when local token exists:

```powershell
$env:SUPABASE_ACCESS_TOKEN="<redacted>"
npm run runtime -- npm run check:supabase-advisor
```

Expected: no high/critical findings; any INFO unused-index findings remain telemetry-gated.

- [ ] **Step 3: Execute a non-production restore drill**

Follow `docs/backups/FREE_TIER_LOGICAL_BACKUPS.md` exactly:

```powershell
npm run runtime -- npm run backup:supabase:logical
```

Then restore the encrypted dump into a non-production database and record:

```markdown
| YYYY-MM-DD | Non-production logical restore | Successful | Operator name | Backup artifact path; restore target; row-count checks; checksum; no production writes |
```

in `docs/compliance/dora/RESTORE_DRILL_LOG.md`.

- [ ] **Step 4: Verify restore proof**

Run:

```powershell
npm run runtime -- npm run check:dr-restore-proof
```

Expected:

```text
Disaster recovery readiness evidence OK
```

---

### Task 4: Complete Cloudflare Admin Evidence

**Files:**
- Modify: `docs/archive/audits/ECAS_PHASE_9_15_REAUDIT_2026-06-22.md`
- Modify: `docs/governance/LIVE_GITHUB_ADMIN_SETTINGS.md` only if deployment settings are GitHub-linked
- Verify: `scripts/capture-cloudflare-admin-posture.mjs`

- [ ] **Step 1: Authenticate Cloudflare read-only access**

Preferred shell variables:

```powershell
$env:CLOUDFLARE_API_TOKEN="<redacted read-only token>"
$env:CLOUDFLARE_ACCOUNT_ID="<redacted account id>"
```

Alternative:

```powershell
npx wrangler login
npx wrangler whoami
```

Expected: authenticated Cloudflare account is shown.

- [ ] **Step 2: Capture Cloudflare posture**

Run:

```powershell
npm run runtime -- npm run capture:cloudflare-admin-posture -- --strict
```

Expected: artifact written under `artifacts/compliance/live-evidence/` and no strict blocker.

- [ ] **Step 3: Fix Cloudflare control gaps if found**

Admin actions to verify or enable:

```text
- Pages production deployment connected to main
- HTTPS always on
- WAF managed rules enabled
- Bot protection or equivalent available control enabled
- Rate limits for sensitive routes where available
- Cache rules match public route strategy
- Rollback path documented
```

- [ ] **Step 4: Re-run live evidence gate**

Run:

```powershell
npm run runtime -- npm run check:ecas-live-evidence -- --strict
```

Expected: Cloudflare no longer appears as unconfigured or blocked.

---

### Task 5: Complete Sentry Live Observability Evidence

**Files:**
- Modify: `docs/OBSERVABILITY.md`
- Modify: `docs/archive/audits/ECAS_PHASE_9_15_REAUDIT_2026-06-22.md`
- Verify: `scripts/capture-sentry-live-evidence.mjs`

- [ ] **Step 1: Configure read-only Sentry credentials**

Run:

```powershell
$env:SENTRY_AUTH_TOKEN="<redacted read-only token>"
$env:SENTRY_ORG="<org slug>"
$env:SENTRY_PROJECT="<project slug>"
```

- [ ] **Step 2: Capture live issue evidence**

Run:

```powershell
npm run runtime -- npm run capture:sentry-live-evidence -- --strict
```

Expected: artifact written under `artifacts/compliance/live-evidence/`.

- [ ] **Step 3: Update observability evidence**

Add to `docs/OBSERVABILITY.md`:

```markdown
## Live Sentry Evidence - YYYY-MM-DD

- Project: `<project slug>`
- Window: last 24h or configured release window
- Open critical issues: N
- Open high issues: N
- Release under review: `<git sha>`
- Artifact: `artifacts/compliance/live-evidence/<file>.json`
```

- [ ] **Step 4: Re-run strict live evidence gate**

Run:

```powershell
npm run runtime -- npm run check:ecas-live-evidence -- --strict
```

Expected: Sentry no longer appears as unconfigured.

---

### Task 6: Complete Production Load Ladder And Enterprise Soak

**Files:**
- Modify: `docs/performance/LOAD_TEST_EVIDENCE.md`
- Modify: `docs/compliance/dora/PERFORMANCE_PROOF_LOG.md`
- Verify: `scripts/load-test/basic.js`
- Verify: `scripts/perf-k6-run.mjs`

- [ ] **Step 1: Confirm approval window**

Record approval in both evidence docs before running quota-impacting tests:

```markdown
Approval ref: YYYY-MM-DD-production-load-window-approved-by-<owner>
Scope: smoke, baseline_100, growth_10x, enterprise_soak
Abort condition: p95 > 2500 ms, error rate >= 1%, Supabase/Cloudflare incident, user-facing degradation
```

- [ ] **Step 2: Run production smoke**

Run:

```powershell
$env:LOAD_TEST_APPROVED_PRODUCTION="true"
npm run runtime -- npm run perf:k6:smoke -- --base-url https://portal.maiprop.co --summary-dir artifacts/performance/k6/prod-smoke-YYYYMMDDTHHMMZ
```

Expected: `Status passed`, failed routes `none`.

- [ ] **Step 3: Run baseline_100**

Run:

```powershell
$env:LOAD_TEST_APPROVED_PRODUCTION="true"
npm run runtime -- npm run perf:k6:baseline -- --base-url https://portal.maiprop.co --summary-dir artifacts/performance/k6/prod-baseline-100-YYYYMMDDTHHMMZ
```

Expected: `Status passed`, failed routes `none`.

- [ ] **Step 4: Run growth_10x only if baseline passes**

Run:

```powershell
$env:LOAD_TEST_APPROVED_PRODUCTION="true"
npm run runtime -- npm run perf:k6:growth -- --base-url https://portal.maiprop.co --summary-dir artifacts/performance/k6/prod-growth-10x-YYYYMMDDTHHMMZ
```

Expected: `Status passed`, failed routes `none`.

- [ ] **Step 5: Run enterprise_soak only if growth_10x passes**

Run:

```powershell
$env:LOAD_TEST_APPROVED_PRODUCTION="true"
npm run runtime -- npm run perf:k6:soak -- --base-url https://portal.maiprop.co --summary-dir artifacts/performance/k6/prod-enterprise-soak-YYYYMMDDTHHMMZ
```

Expected: `Status passed`, failed routes `none`.

- [ ] **Step 6: Update evidence and verify**

Run:

```powershell
npm run runtime -- npm run check:perf-proof
```

Expected:

```text
Load test contract OK
Performance evidence contract OK
```

---

### Task 7: Finish Enterprise SSO And Procurement Evidence

**Files:**
- Modify: `docs/governance/ENTERPRISE_TENANCY_AND_SSO.md`
- Modify: `docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md`
- Modify: `docs/PRODUCTION_CHECKLIST.md`
- Test: `src/test/enterpriseSso.test.ts`
- Verify: `supabase/migrations/20260614155000_enterprise_tenant_sso_procurement.sql`

- [ ] **Step 1: Configure a real test IdP**

Admin action:

```text
Create a staging/test enterprise organization.
Configure Supabase SSO/SAML provider.
Use a test corporate domain or provider ID.
Do not store SAML private keys or certificates in the repo.
```

- [ ] **Step 2: Verify app-side SSO parsing still passes**

Run:

```powershell
npm run runtime -- npx vitest run src/test/enterpriseSso.test.ts
```

Expected: all enterprise SSO helper tests pass.

- [ ] **Step 3: Record procurement evidence**

Update `docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md` with:

```markdown
| SAML/SSO test tenant | Available | Supabase SSO provider ID/domain verified on YYYY-MM-DD; test sign-in passed; secrets not stored in repo |
| DR restore drill | Available | `docs/compliance/dora/RESTORE_DRILL_LOG.md` successful row YYYY-MM-DD |
| Live monitoring | Available | `docs/OBSERVABILITY.md` live Sentry evidence YYYY-MM-DD |
| Cloudflare controls | Available | `artifacts/compliance/live-evidence/<cloudflare artifact>.json` |
```

- [ ] **Step 4: Verify enterprise readiness**

Run:

```powershell
npm run runtime -- npm run check:enterprise-readiness-basics
```

Expected:

```text
Enterprise readiness basics OK
```

---

### Task 8: Final Strict ECAS Reaudit And Grade

**Files:**
- Create: `docs/archive/audits/ECAS_FINAL_REAUDIT_YYYY-MM-DD.md`
- Modify: `docs/archive/audits/README.md`

- [ ] **Step 1: Run all source gates**

Run:

```powershell
npm run runtime -- npm run check:secrets
npm run runtime -- npm run check:ecas-hardening
npm run runtime -- npm run check:enterprise-readiness-basics
npm run runtime -- npm run check:standards-readiness
npm run runtime -- npm run check:github-governance
npm run runtime -- npm run check:perf-proof
npm run runtime -- npm run check:dora-readiness
npm run runtime -- npm run check:slsa-readiness
npm run runtime -- npm run check:mutation-validation
npm run runtime -- npm run check:dr-restore-proof
npm run runtime -- npm run check:ecas-live-evidence -- --strict
```

Expected: all commands pass. If one does not pass, the final report must list it as an exception, not an A-grade completion.

- [ ] **Step 2: Create final ECAS report**

Create `docs/archive/audits/ECAS_FINAL_REAUDIT_YYYY-MM-DD.md` with:

```markdown
# ECAS Final Strict Reaudit - YYYY-MM-DD

## Verdict

Production readiness: Pass/Fail
Enterprise readiness: Pass/Fail
Security audit readiness: Pass/Fail
Due diligence readiness: Pass/Fail

## Scorecard

| # | Dimension | Grade | Certainty | Evidence | Remaining Action |
|---:|---|---|---:|---|---|
| 1 | Business Architecture |  |  |  |  |
| 2 | Repository Architecture |  |  |  |  |
| 3 | TypeScript Maturity |  |  |  |  |
| 4 | React Frontend |  |  |  |  |
| 5 | Backend / Edge Architecture |  |  |  |  |
| 6 | Supabase Architecture |  |  |  |  |
| 7 | Database Engineering |  |  |  |  |
| 8 | Security |  |  |  |  |
| 9 | RLS Security |  |  |  |  |
| 10 | Authorization |  |  |  |  |
| 11 | API Design |  |  |  |  |
| 12 | Validation |  |  |  |  |
| 13 | Testing |  |  |  |  |
| 14 | Performance |  |  |  |  |
| 15 | Observability |  |  |  |  |
| 16 | DevOps |  |  |  |  |
| 17 | GitHub Governance |  |  |  |  |
| 18 | Cloudflare |  |  |  |  |
| 19 | Infrastructure |  |  |  |  |
| 20 | Data Governance |  |  |  |  |
| 21 | AI Governance |  |  |  |  |
| 22 | Multi-Tenancy |  |  |  |  |
| 23 | Enterprise Readiness |  |  |  |  |
| 24 | Scalability |  |  |  |  |
| 25 | Deployment Readiness |  |  |  |  |
```

- [ ] **Step 3: Commit final report**

Run:

```powershell
git add docs/archive/audits/ECAS_FINAL_REAUDIT_YYYY-MM-DD.md docs/archive/audits/README.md
git commit -m "docs: add final ECAS reaudit"
```

Expected: commit succeeds and pre-commit checks pass.

---

### Task 9: Merge, Squash, And Monitor

**Files:**
- No direct file changes expected.

- [ ] **Step 1: Push final branch**

Run:

```powershell
git push
```

Expected: branch updates successfully.

- [ ] **Step 2: Convert PR from draft when all required checks pass**

Run:

```powershell
gh pr ready --repo maiprop/maiprop-listing-site <PR_NUMBER>
gh pr checks --repo maiprop/maiprop-listing-site <PR_NUMBER> --watch
```

Expected: all required checks pass.

- [ ] **Step 3: Squash merge**

Run:

```powershell
gh pr merge --repo maiprop/maiprop-listing-site <PR_NUMBER> --squash --delete-branch
```

Expected: PR merges to `main`, remote branch deleted.

- [ ] **Step 4: Monitor main**

Run:

```powershell
gh run list --repo maiprop/maiprop-listing-site --branch main --limit 10
gh run watch --repo maiprop/maiprop-listing-site <RUN_ID>
```

Expected: main CI, CodeQL, release, Supabase deploy, and Cloudflare deploy are green.

- [ ] **Step 5: Production smoke**

Run:

```powershell
npm run runtime -- npm run check:production-deploy -- https://portal.maiprop.co --browser --public-api
```

Expected: production deploy smoke passes.

---

## Dependency Matrix

| Blocker | Can Codex complete alone? | Required resource |
|---|---:|---|
| Source ECAS gates | Yes | Local repo + CI |
| Supabase RLS read-only proof | Yes, connector available | Supabase connector |
| Supabase leaked-password protection | No | Supabase project admin / plan capability |
| Restore drill proof | Partially | Backup credentials and non-production restore target |
| GitHub branch protection | No | GitHub admin and possibly GitHub Pro/private repo capability |
| GitHub environment approvals | No | GitHub repository admin |
| Cloudflare WAF/rate-limit/admin evidence | No, until authenticated | Cloudflare API token or Wrangler login |
| Sentry live evidence | No, until authenticated | Read-only Sentry token, org, project |
| Production 10x/soak | Partially | Approved load window, Cloudflare/Supabase quota acceptance, monitoring |
| Enterprise SSO/SAML proof | Partially | Supabase SSO capability and test IdP |

## Recommended Sequence

1. Push current evidence PR.
2. Complete GitHub admin controls.
3. Complete Cloudflare and Sentry evidence capture.
4. Enable or formally exception Supabase leaked-password protection.
5. Run restore drill.
6. Run production load ladder in approved window.
7. Complete SSO/procurement evidence.
8. Run final strict ECAS reaudit.
9. Squash merge and monitor main.

## Self-Review

- Spec coverage: covers all remaining ECAS blockers identified in the latest evidence pass.
- Placeholder scan: no `TBD`, `TODO`, or undefined implementation placeholders are used.
- Type consistency: commands use existing package scripts and known evidence files.
