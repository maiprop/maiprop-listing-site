# Live GitHub Admin Settings Evidence

Last verified: 2026-06-23

This file records the live GitHub controls that are not fully expressible in
source code. Source gates still validate the expected policy files, but ECAS
and procurement review should distinguish source evidence from live repository
administration.

## Actions Policy

Live repository Actions permissions were updated and verified with GitHub API:

- `enabled: true`
- `allowed_actions: selected`
- `sha_pinning_required: true`
- `github_owned_allowed: true`
- `verified_allowed: false`
- `patterns_allowed` matches `docs/governance/github-actions-policy.expected.json`

This satisfies the source-controlled SLSA-style requirement that GitHub Actions
are selected and SHA pinning is required.

Supabase deployment workflows install the pinned Supabase CLI directly with npm.
They do not use `supabase/setup-cli`, because that action invokes
`oven-sh/setup-bun` internally and the live repository action policy rejects
that nested action.

## Branch Protection

Branch protection API result: blocked. Rechecked on 2026-06-23 with
`npm run capture:github-admin-posture -- --strict` after loading the authenticated
GitHub CLI token into `GITHUB_TOKEN`.

GitHub returned: `Upgrade to GitHub Pro or make this repository public to enable this feature.`

The live capture command is:

```bash
npm run capture:github-admin-posture
```

It writes a redacted JSON artifact under
`artifacts/compliance/live-evidence/` locally, or under
`compliance-evidence/` in the monthly Standards Evidence workflow.

Required target policy remains source-controlled in
`docs/governance/main-branch-protection.expected.json` and documented in
`docs/BRANCH_PROTECTION.md`, but live enforcement cannot be enabled from this
private repository without the required GitHub plan or repository visibility
change.

## Production Approval Boundary

Protected-environment approvals are not an active control for this private
repository on GitHub Free. The `production` and `staging` environment objects
may still exist for organization, but workflows must not claim that their
secrets or reviewer settings provide isolation.

GitHub API recheck on 2026-06-23 returned two environments:

- `production`: configured with a branch policy protection rule and custom
  branch policies; no required-reviewer protection rule was reported.
- `staging`: configured without protection rules.

The production workflow instead requires an attempt-one approval artifact from
an allowlisted GitHub actor who differs from the allowlisted deployer. Exact
current-`main` SHA/tree checks, GitHub artifact API metadata, a
repository-secret HMAC binding, Stripe live readiness, and short-lived mutation
leases are revalidated before each provider mutation. If the repository moves
to a plan that supports private-repository required reviewers, environment
reviewers may be added as defense in depth; they are not a current prerequisite
or substitute for the in-workflow controls.

## Push Protection

Push protection: pending repository admin.

The repository has source secret scanning with `npm run check:secrets` and
gitleaks in CI. GitHub Advanced Security push protection still requires live
repository/security settings and should be verified by a repository admin.

## Latest Main Health

Latest fully completed main workflow health before release `1.11.3` was checked
with GitHub CLI on 2026-06-23:

- `CI` success for `chore(main): release 1.11.2`
  ([run 28003451539](https://github.com/maiprop/maiprop-listing-site/actions/runs/28003451539))
- `Release Please` success for `chore(main): release 1.11.2`
  ([run 28003451427](https://github.com/maiprop/maiprop-listing-site/actions/runs/28003451427))
- `CodeQL` success for `Code Quality: Push on main`
  ([run 28003450688](https://github.com/maiprop/maiprop-listing-site/actions/runs/28003450688))
- Verified head SHA: `0145793152164ac0fe5b4da22c48914251a00fa8`

The GitHub connector could not fetch workflow runs in this Codex session
because the API returned `404 Not Found`; the CLI check is the authoritative
local evidence for this verification pass.

Release `1.11.3` was squash-merged on 2026-06-23 as
`7251316915bae10e20237628a8227c2a68a01c7f`. Release Please and CodeQL
completed successfully for that SHA. CI run `28043405941` completed
successfully, including build, lint, tests, coverage, migration validation,
Lighthouse, E2E, live-safe security checks, Cloudflare production deployment,
and post-deploy health check.

## Standards Evidence Workflow

The `Standards Evidence` workflow requires `pull-requests: read` because it
uses `gh pr list` to archive the open PR inventory. Without that permission,
GitHub returns `Resource not accessible by integration`.

Branch `codex/ecas-completion-admin-evidence` verified the permission fix on
2026-06-23 with run `28044234620`. The run completed successfully and uploaded
the `standards-evidence` artifact. Key captured statuses:

- GitHub admin posture: `blocked`; branch protection API returned `403`.
- Supabase live security: passed.
- Cloudflare admin posture: `captured`; Pages project `maiprop-listing-site`,
  production branch `main`, domains `maiprop-listing-site.pages.dev` and
  `portal.maiprop.co`.
- Sentry live evidence: `unconfigured`; missing `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORG`, and `SENTRY_PROJECT`.
