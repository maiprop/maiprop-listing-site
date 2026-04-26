# Issue Type Audit Report

Date: 2026-04-15  
Project: `maiprop-listing-site`  
Scope: Local audit based on `build`, `lint`, `test`, TypeScript check, dependency audit, and CI workflow requirements.

## Executive Summary

- **Deployability status:** Not deployable
- **Primary blockers:** Lint failure, large TypeScript failure surface, schema/type drift with Supabase
- **Secondary risks:** Dependency vulnerabilities (moderate/low), unverified Deno test gate on this machine

## Issue Inventory by Type

## 1) Static Analysis Issues (Lint)

- **Count:** 1 error
- **Severity:** High (CI blocker)
- **Status:** Failing
- **Evidence:**
  - `e2e/interaction-open-house.spec.ts`: unused `Browser` type import/variable
- **Impact:**
  - CI quality job fails before deploy pipeline can be considered clean.

## 2) Type Safety Issues (TypeScript Compile)

- **Count:** 180 errors (`npx tsc -p tsconfig.app.json --noEmit`)
- **Severity:** Critical
- **Status:** Failing
- **Issue sub-types observed:**
  - **Schema mismatch / unknown columns or tables** (Supabase typed client rejects fields like missing columns/tables/relations)
  - **Invalid RPC/function identifiers** (RPC names not present in generated types)
  - **Missing symbols/imports** (`Cannot find name ...`)
  - **Nullability violations** (`string | null` assigned to `string`)
  - **Narrow literal type conflicts** (`"manual"` vs wider union assignment)
  - **Unsafe casts** (`TS2352` conversion complaints to `Record<string, unknown>` or similar)
  - **Implicit `any` and indexability issues** (`TS7006`, `TS7053`)
  - **Component typing issues in tests** (invalid JSX component signature)
- **Most affected areas:**
  - `src/pages/*` (high concentration)
  - `src/hooks/*` (high concentration)
  - `src/components/*` (high concentration)
  - `src/test/*` (some type regressions in tests)
- **Impact:**
  - High probability of runtime failures in affected user flows.
  - Indicates current code + generated backend types are not in sync.

## 3) Backend Contract / Data Model Drift (Supabase)

- **Count:** Embedded within TypeScript failures (large)
- **Severity:** Critical
- **Status:** Failing
- **Patterns observed:**
  - Referenced relations not found (e.g., conversations/listings relation errors)
  - Referenced table names absent from generated type map (e.g., `contact_submissions`, `professional_reviews`)
  - Referenced columns absent (e.g., fields like `listing_id`, `updated_at`, `rejection_reason`, etc. in specific contexts)
  - Insert payloads include keys not accepted by typed `Insert` models
- **Impact:**
  - Data writes/reads can fail at runtime.
  - Feature areas relying on these queries are unreliable until schema and types are reconciled.

## 4) Build Pipeline Status

- **Count:** 0 blocking errors in production build
- **Severity:** Informational
- **Status:** Passing
- **Result:** `npm run build` completed successfully.
- **Caveat:** Passing bundle build does not mitigate failed lint/type quality gates.

## 5) Automated Tests (Vitest)

- **Count:** 176 tests passed, 0 failed
- **Severity:** Medium confidence signal
- **Status:** Passing
- **Observed warnings (non-failing):**
  - React Router future flag warnings
  - React `act(...)` warnings in some tests
  - `react-i18next` NO_I18NEXT_INSTANCE warnings in test contexts
- **Impact:**
  - Core test suite passes, but warnings indicate technical debt and possible flaky behavior in future dependency upgrades.

## 6) Security / Dependency Issues

- **Count:** 5 vulnerabilities (`npm audit --audit-level=high`)
  - 2 moderate
  - 3 low
- **Severity:** Medium
- **Status:** Not blocking at current threshold (no high/critical)
- **Notable advisories:**
  - `esbuild` advisory affecting dev-server behavior
  - `@tootallnate/once` via `jsdom`/`http-proxy-agent`
- **Impact:**
  - Not immediate release stopper for production build artifact, but should be scheduled for remediation.
  - Full auto-fix currently implies breaking major upgrades (`vite`, `jsdom`).

## 7) Tooling / Environment Gaps

- **Count:** 1 local prerequisite missing
- **Severity:** Medium (CI parity gap)
- **Status:** Failing locally
- **Evidence:** `npm run test:deno` failed (`deno` not installed in local environment)
- **Impact:**
  - Cannot validate full CI gate locally.
  - Risk of merge surprises if Deno tests fail remotely.

## 8) CI Gate Risk Summary

Based on `.github/workflows/ci.yml`, deployment readiness requires:

- `npm run build` -> **Pass**
- `npm run lint` -> **Fail**
- `npm test` -> **Pass**
- `npm run test:coverage` -> **Not executed in this audit**
- `deno test supabase/functions/_shared/` -> **Not verifiable locally (tool missing)**

Current status indicates **pipeline would fail** before deployment approval.

## Recommended Remediation Order (by unblock value)

1. **Fix lint error** to clear first hard gate quickly.
2. **Reconcile Supabase schema and generated TypeScript types** (single biggest root cause).
3. **Resolve TypeScript compile errors to zero** (`tsc --noEmit` must pass).
4. **Install Deno locally** and run edge-function test gate.
5. **Address dependency vulnerabilities** with controlled upgrade strategy and regression checks.
6. **Clean test warnings** (`act`, i18n setup, future flags) to reduce long-term instability.

## Deployment Verdict

- **Current verdict:** **Not deployable**
- **Reason:** CI-blocking lint failure + critical compile/type/schema drift issues.
