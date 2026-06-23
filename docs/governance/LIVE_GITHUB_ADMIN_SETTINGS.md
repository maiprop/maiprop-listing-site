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

`oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6` is allowed only
because the pinned `supabase/setup-cli` action invokes it internally. It should
remain pinned to that exact SHA unless the Supabase setup action removes the
nested dependency or the workflow is migrated to a direct CLI installation.

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

## Environment Approvals

Environment approvals: pending repository admin.

The environment object exists, but the reviewer gate is still pending
repository admin.

GitHub API recheck on 2026-06-23 returned two environments:

- `production`: configured with a branch policy protection rule and custom
  branch policies; no required-reviewer protection rule was reported.
- `staging`: configured without protection rules.

The production workflow requires source gates before deployment, but live
environment reviewer settings require repository administration. Before marking
ECAS Deployment Readiness as top-grade, configure production environment
reviewers and wait timers in GitHub repository settings.

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
completed successfully for that SHA. The CI run was still in progress during
this documentation update, after completing build, lint, migration, governance,
and unit-test steps.

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
