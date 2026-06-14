# Branch Protection - Required Settings

This repository treats `main` as production-bearing. The settings below are the
minimum ECAS target for the `main` branch. If a GitHub plan or repository setting
prevents enforcement, record that as an external blocker rather than weakening
this standard.

## `main` Branch Rules

GitHub -> Settings -> Branches -> Add branch protection rule

| Setting | Value | Rationale |
|---------|-------|-----------|
| Branch name pattern | `main` | Production-bearing branch |
| Require status checks to pass | enabled | Prevents merging broken code |
| Required checks | `Build / Lint / Test`, `Release Safety Inventory`, `Validate Supabase migrations`, `E2E Tests` | Core quality, release, DB, and UI gates |
| Require branches to be up to date | enabled | Ensures checks ran against the latest base |
| Require pull request reviews | enabled | Stops direct unreviewed production changes |
| Required approving reviews | `1` minimum | Raises governance above single-operator merge discipline |
| Require review from Code Owners | enabled | Routes auth, DB, CI, payment, and edge changes to owners |
| Dismiss stale pull request approvals | enabled | Re-review after material changes |
| Require conversation resolution | enabled | Blocks unresolved security/release questions |
| Do not allow bypassing the above settings | enabled | Administrators should not bypass release gates |
| Allow force pushes | disabled | Never force-push to `main` |
| Allow deletions | disabled | Production branch must not be deletable |
| Include administrators | enabled | Admins follow the same release controls |

## Evidence Artifact

The intended configuration is mirrored in:

```text
docs/governance/main-branch-protection.expected.json
```

Local and CI validation:

```powershell
npm run check:github-governance
```

This gate cannot prove GitHub has the setting enabled in the dashboard, but it
does prevent the repository standard from drifting backward. The live repository
setting still needs periodic dashboard/API verification.

## CODEOWNERS

`.github/CODEOWNERS` must cover at least:

- default ownership with `*`
- `.github/workflows/`
- `.github/CODEOWNERS`
- `supabase/migrations/`
- `supabase/functions/_shared/`
- `src/integrations/supabase/`
- `src/contexts/AuthContext.tsx`
- `functions/_middleware.ts`
- `public/_headers`
- `scripts/`

These paths map to ECAS high-blast-radius areas: CI/CD, database schema, RLS,
auth, edge middleware, headers, and release tooling.
