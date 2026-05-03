# Branch Protection — Recommended Settings

## `main` Branch Rules

GitHub → Settings → Branches → Add branch protection rule

| Setting | Value | Rationale |
|---------|-------|-----------|
| **Branch name pattern** | `main` | |
| **Require status checks to pass** | ✅ | Prevents merging broken code |
| **Required checks** | `Build · Lint · Test`, `E2E Tests`, `Validate Supabase migrations` | Core quality gates |
| **Require branches to be up to date** | ✅ | Ensures CI ran on the latest base |
| **Require pull request reviews** | ❌ (for now) | Bus factor = 1; self-review adds friction with no benefit. Enable when team grows. |
| **Allow force pushes** | ❌ | Never force-push to main |
| **Allow deletions** | ❌ | |
| **Require linear history** | Optional | Nice-to-have but blocks merge commits |
| **Include administrators** | ✅ | Even admins must go through CI |

## Why Not Require Reviews?

With a single developer, requiring reviews means either:
1. Self-approving every PR (security theatre)
2. Waiting for an external reviewer (blocking)

The CI status checks are the real quality gate. Add review requirements when the team grows beyond 1.

## Automated Enforcement

The CI workflow already enforces:
- TypeScript type-checking + build
- ESLint linting
- Vitest unit tests (1179+)
- Deno edge function tests (238+)
- Playwright E2E tests
- Supabase migration validation
- License compliance
- Secret scanning (gitleaks)
- CodeQL security analysis
