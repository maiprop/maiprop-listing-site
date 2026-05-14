# Release Traceability - 2026-05-14

## Purpose

This artifact records the hardening release candidate that reconciles source,
Supabase Edge Functions, and production database migrations for the
`codex/deployment-grade-hardening` branch.

## Repository

- Branch: `codex/deployment-grade-hardening`
- Base SHA before release commit: `4f010f7906bd3732bae538c7110b83e5563a45aa`
- Release tag: `release/hardening-2026-05-14`
- Release commit: resolve with `git rev-parse release/hardening-2026-05-14`
- Workspace: `C:\Users\K R\OneDrive\Desktop\maiprop-listing-site`

## Live Supabase Target

- Project ref: `qvvicunqcrwpioqnvzxf`
- Deployment target: Supabase Edge Functions and Supabase Postgres
- Public app runtime: Vite/React static frontend with Supabase backend services

## Live Changes Reconciled

The following live changes were applied or verified during the hardening pass
and must remain mapped to this release branch:

- `owner-pro-status` Edge Function now requires JWT verification.
- `owner-pro-status` live anonymous invoke returned HTTP 401.
- `20260514142236_harden_open_house_offer_workflow` is applied live.
- `20260514150000_firesale_interest_reservation_workflow` is applied live.
- Open-house offer submission and acceptance invariants are enforced through
  Postgres RPC/trigger/index protections.
- Firesale reservation uniqueness and workflow transitions are protected by
  Postgres trigger/RPC locking.
- Live Edge Function inventory matches repository source/config names.
- `delete-account` now includes `open-house-docs` user-folder cleanup for
  proof-of-funds and open-house document erasure.
- `create-checkout` was redeployed from repository source after live smoke
  detected the invite-only checkout path returning HTTP 500 instead of 403.
- `npm run test:e2e:live-smoke` now covers account deletion auth, checkout
  eligibility, role approval access, firesale access, and open-house/RPC
  boundaries.

## Verification Commands

Run before promotion:

```powershell
git status --short --branch
git rev-parse HEAD
npm run typecheck
npm run lint
npm test
npm run test:deno
npm run build
npm run test:e2e:live-smoke
npm audit --omit=dev
npm run lint:migrations
npm run lint:migrations:chronology
$env:RELEASE_SAFETY_LIVE_FUNCTIONS='true'
$env:RELEASE_SAFETY_SUPABASE_PROJECT_REF='qvvicunqcrwpioqnvzxf'
npm run check:release-safety
```

## Deployment Rule

Deploy production Edge Functions only from a clean committed workspace. Record
the post-commit SHA and function deployment command in release notes or CI logs.

## Rollback Rule

Rollback must identify both:

- the Git commit for the frontend/function source; and
- the Supabase migration versions already applied to production.

Database migrations in this release include security invariants and should not
be rolled back casually. Prefer forward-fix migrations unless a migration has a
documented reversible rollback.

## Known Deferred Risks

- `ai-translate` remains intentionally deferred and still requires its separate
  authentication/cost-control hardening item.
- The Supabase access token pasted into the working thread must be rotated
  outside this repository.
