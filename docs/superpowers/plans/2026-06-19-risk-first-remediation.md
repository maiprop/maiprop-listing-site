# Risk-First Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the highest-confidence supply-chain and validation blockers without changing user-facing app behavior.

**Architecture:** Keep remediation in dependency metadata, lockfile state, and audit evidence scripts/docs. No frontend route, component, Supabase table, or Edge Function behavior changes are part of this first slice.

**Tech Stack:** npm 10 lockfile, Node 20 runtime launcher, GitHub Dependabot evidence, existing project audit scripts.

---

## File Map

- Modify: `package.json`
  - Add a targeted `undici` override and rationale when the lockfile proves a vulnerable transitive version.
- Modify: `package-lock.json`
  - Resolve `node_modules/undici` to the patched version selected by npm.
- Create: `docs/superpowers/specs/2026-06-19-risk-first-remediation-design.md`
  - Capture the approved risk-first remediation constraints.
- Create: `docs/superpowers/plans/2026-06-19-risk-first-remediation.md`
  - Capture this implementation plan.

## Task 1: Confirm Runtime And Advisory Baseline

**Files:**
- Read: `package.json`
- Read: `package-lock.json`

- [x] **Step 1: Verify project runtime resolution**

Run:

```powershell
node scripts/project-runtime.mjs --doctor
```

Expected: exit `0`, Node `20.x`, npm `10.x`.

- [x] **Step 2: Confirm locked vulnerable package**

Run:

```powershell
rg -n '"undici"|undici-' package.json package-lock.json
```

Expected: `package-lock.json` shows the currently locked `undici` version.

- [x] **Step 3: Confirm current dependency override gate**

Run:

```powershell
node scripts/project-runtime.mjs -- npm run check:dependency-overrides
```

Expected: exit `0` before edits, proving existing override metadata is valid.

## Task 2: Patch The Undici Advisory

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Add the targeted override**

Add this entry under `overrides` in `package.json`:

```json
"undici": "7.28.0"
```

Add this matching entry under `overridesRationale`:

```json
"undici": "Transitive tooling pulls undici 7.25.0, which is covered by open Dependabot advisories GHSA-vmh5-mc38-953g and GHSA-pr7r-676h-xcf6. Pin to 7.28.0 until upstream packages refresh their ranges."
```

- [x] **Step 2: Refresh only the lockfile**

Run:

```powershell
node scripts/project-runtime.mjs -- npm install --package-lock-only --ignore-scripts
```

Expected: lockfile updates `node_modules/undici` to `7.28.0` without installing packages or running scripts.

- [x] **Step 3: Verify override metadata**

Run:

```powershell
node scripts/project-runtime.mjs -- npm run check:dependency-overrides
```

Expected: exit `0`, with `undici` included in the override summary and locked at `7.28.0`.

- [x] **Step 4: Verify production audit**

Run:

```powershell
node scripts/project-runtime.mjs -- npm audit --omit=dev --audit-level=high
```

Expected: exit `0`.

## Task 3: Verify No Runtime App Regression

**Files:**
- Read: `package.json`
- Read: `package-lock.json`

- [x] **Step 1: Run non-UI audit gates**

Run:

```powershell
node scripts/project-runtime.mjs -- npm run check:standards-readiness
```

Expected: exit `0`.

- [x] **Step 2: Build the app**

Run:

```powershell
node scripts/project-runtime.mjs -- npm run build
```

Expected: exit `0`, proving the lockfile metadata change does not break compile or bundle generation.

## Task 4: Gather External Evidence

**Files:**
- No file edits.

- [x] **Step 1: Check open Dependabot alerts before push**

Run:

```powershell
gh api "repos/maiprop/maiprop-listing-site/dependabot/alerts?state=open&per_page=100"
```

Observed: GitHub still lists two open `undici` alerts on `main`; both require
`7.28.0`, which this branch pins. They should auto-close after this branch is
merged to the default branch and Dependabot refreshes.

- [ ] **Step 2: Check CI after push**

Run:

```powershell
gh run view <latest-run-id> --json status,conclusion,jobs,url
```

Expected: CI reaches `completed` with conclusion `success`.
