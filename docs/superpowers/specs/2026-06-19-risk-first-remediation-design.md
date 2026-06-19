# Risk-First Remediation Design

Date: 2026-06-19
Branch: `codex/risk-first-remediation`
Base: `origin/main`

## Goal

Improve the highest-risk audit dimensions first without changing live user flows,
database semantics, or frontend rendering performance. Each fix must be small,
testable, and reversible.

## Sequence

1. Supply-chain and GitHub governance evidence.
   - Patch open dependency advisories through explicit npm overrides and lockfile
     updates.
   - Keep CI gates aligned with the override rationale.
   - Verify with dependency override checks, npm audit, and GitHub alert checks
     where available.

2. Runtime and developer validation reliability.
   - Ensure project validation commands run through the required Node 20/npm 10
     runtime.
   - Treat local runtime mismatch as an onboarding and deployment-readiness risk,
     not an app behavior change.

3. Supabase and security evidence cleanup.
   - Recheck live RLS/security posture through existing scripts and the Supabase
     connector.
   - Only change SQL when the finding is proven, scoped, and backed by a replay or
     static guard.

4. Documentation-only blockers that cannot be safely automated.
   - Mark paid-plan or admin-console-only controls separately from code defects.
   - Do not fake evidence for restore drills, branch protection, or Sentry
     telemetry when the connected tool cannot prove them.

## Guardrails

- No user-facing UI changes in this first remediation slice.
- No production database mutation unless an explicit Supabase migration is added
  and validated.
- No broad dependency upgrades; only targeted security resolution updates.
- No completion claim without fresh command output.

## Acceptance Checks

- `node scripts/project-runtime.mjs --doctor`
- `node scripts/project-runtime.mjs -- npm run check:dependency-overrides`
- `node scripts/project-runtime.mjs -- npm audit --omit=dev --audit-level=high`
- Relevant unit or script tests for any changed helper.
- GitHub CI status after push before merge/squash.
