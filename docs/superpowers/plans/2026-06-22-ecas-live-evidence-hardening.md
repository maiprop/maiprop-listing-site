# ECAS Live Evidence Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, token-safe live evidence capture for the remaining ECAS provider-side findings without changing product runtime behavior.

**Architecture:** Keep provider checks as standalone Node scripts that default to safe dry/read-only behavior and write redacted artifacts under `artifacts/compliance/live-evidence/`. CI and operators can run strict mode when credentials are available. Existing app code, Supabase migrations, and Cloudflare deploy behavior remain untouched.

**Tech Stack:** Node 20 ESM scripts, Vitest unit tests, GitHub Actions/gh CLI where available, Sentry REST API, Cloudflare REST API, existing Supabase advisor connector/CI gates.

---

### Task 1: Sentry Live Evidence Script

**Files:**
- Create: `scripts/capture-sentry-live-evidence.mjs`
- Test: `scripts/capture-sentry-live-evidence.test.mjs`
- Modify: `package.json`

- [x] **Step 1: Write tests for missing credentials and successful issue summary**
- [x] **Step 2: Run the focused test and verify it fails because the script is missing**
- [x] **Step 3: Implement a read-only Sentry issue capture script with redaction**
- [x] **Step 4: Run focused tests and verify pass**

### Task 2: Cloudflare Admin Posture Script

**Files:**
- Create: `scripts/capture-cloudflare-admin-posture.mjs`
- Test: `scripts/capture-cloudflare-admin-posture.test.mjs`
- Modify: `package.json`

- [x] **Step 1: Write tests for missing credentials and redacted Pages project capture**
- [x] **Step 2: Run the focused test and verify it fails because the script is missing**
- [x] **Step 3: Implement read-only Cloudflare Pages/admin capture using env-gated API calls**
- [x] **Step 4: Run focused tests and verify pass**

### Task 3: GitHub Live Admin Snapshot

**Files:**
- Create: `scripts/capture-github-admin-posture.mjs`
- Test: `scripts/capture-github-admin-posture.test.mjs`
- Modify: `package.json`

- [x] **Step 1: Write tests for branch protection, environment, and unavailable-plan states**
- [x] **Step 2: Run the focused test and verify it fails because the script is missing**
- [x] **Step 3: Implement read-only GitHub REST capture with explicit blocked/unavailable statuses**
- [x] **Step 4: Run focused tests and verify pass**

### Task 4: ECAS Evidence Rollup

**Files:**
- Create: `scripts/check-ecas-live-evidence.mjs`
- Test: `scripts/check-ecas-live-evidence.test.mjs`
- Modify: `package.json`
- Modify: `docs/archive/audits/ECAS_PHASE_9_15_REAUDIT_2026-06-22.md`

- [x] **Step 1: Write tests for strict versus advisory mode**
- [x] **Step 2: Run the focused test and verify it fails because the script is missing**
- [x] **Step 3: Implement the rollup checker over the live evidence artifacts**
- [x] **Step 4: Update ECAS report with the new evidence-gate workflow**
- [x] **Step 5: Run focused tests and all relevant ECAS/governance checks**

### Task 5: Verification and Release

**Files:**
- No new files unless verification uncovers a focused fix.

- [x] **Step 1: Run focused Vitest tests for the new scripts**
- [x] **Step 2: Run `npm run check:ecas-live-evidence` in advisory mode**
- [x] **Step 3: Run governance/security/performance checks that prove no runtime regression**
- [x] **Step 4: Run production smoke without deploying**
- [ ] **Step 5: Commit, push, open PR, and only merge after GitHub checks pass**
