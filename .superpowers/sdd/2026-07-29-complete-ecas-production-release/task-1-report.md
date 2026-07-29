# Task 1 Report: Preflight, Approval, And Lease Contracts

## Status

Task 1 and its review amendments are implemented locally. No GitHub,
Cloudflare, Supabase, staging, production, workflow-dispatch, push, pull
request, or remote-setting mutation was performed.

Implementation commits:

- `5afd3151b71e563e33a969ff7ece3371cd3f6bf4`
  (`feat: add ECAS release approval controls`)
- `1861c273222170f9d6fea09651083647a35801ba`
  (`fix: harden ECAS release approval controls`)
- `9e93a1a7abdab5b79f07592e33365c4e40d70ad9`
  (`fix: close ECAS architecture control gaps`)
- This final audit follow-up commit
  (`fix: tighten ECAS credential and mutation controls`)

## Changed Files

- `.github/workflows/approve-production-release.yml`
  - Adds a manual, trusted-main approval flow.
  - Fails closed unless the `production-approval` namespace exists, disables
    administrator bypass, uses custom branch policies, and has exactly one
    branch policy whose name is `main` and whose type is `branch`.
  - Uses the GitHub API to verify current `main`.
  - Attests an approval schema-v1 record binding repository, release SHA,
    source tree, source run ID/attempt, staging run ID/attempt, approval run
    ID/attempt, artifact digest, actor, timestamps, and a 256-bit nonce.
- `.github/workflows/compliance-evidence.yml`
  - Remains read-only.
  - Isolates the Cloudflare token in a globally serialized, main-only job with
    no checkout, npm install, or repository-controlled script.
  - GETs and minimizes both fixed Pages projects.
  - When project-ID variables are absent, uploads the discovered IDs and then
    fails with an explicit bootstrap message, even when production preview
    posture is still unlocked.
  - Gates every secret-bearing collector path behind a secretless current-main
    API preflight and pins checkout to that verified SHA.
  - Has no job-wide provider credentials: GitHub, Supabase, and Sentry
    credentials are scoped only to their exact evidence steps, while checkout,
    Node setup, dependency installation, and local repository scripts receive
    none of them.
  - Temporarily falls back from `CLOUDFLARE_PAGES_READ_TOKEN` to the legacy
    `CLOUDFLARE_API_TOKEN`; collection receives no Cloudflare token.
- `.github/workflows/lock-cloudflare-pages-git-deploys.yml`
  - Adds the only Cloudflare Pages Git-lock PATCH workflow.
  - Is manual-only, main-only, globally serialized, non-cancelling, isolated,
    and protected by an environment namespace preflight that requires exactly
    one policy named `main` with type `branch`.
  - Requires two distinct pinned project IDs before either PATCH.
  - GET-validates both projects, preserves each source type, PATCHes all three
    lock fields, re-GETs both, strictly validates, and uploads only minimized
    pre/post/result evidence even after a partial mutation failure.
  - Temporarily falls back from named read/edit tokens to the legacy token.
- `scripts/production-release-validation.mjs`
  - Selects readiness, staging, and approval runs by newest run ID before
    attempt.
  - Validates the complete signed approval tuple and rejects materially future
    approval timestamps.
  - Validates a maximum 15-minute mutation lease with its own nonce, bound to
    repository, source tree, approval nonce, artifact digest, and source,
    staging, approval, and production run IDs and attempts.
  - Rejects invalid validation clocks for approvals and leases.
- `scripts/release-safety-inventory.mjs`
  - Inventories Cloudflare API POST/PUT/PATCH/DELETE mutations made with curl,
    Node `fetch`, PowerShell `Invoke-RestMethod`/`Invoke-WebRequest`, wget, and
    `gh api`.
  - Rejects provider mutations in evidence workflows.
  - Uses a dedicated Cloudflare HTTP mutation allowlist containing only the
    lock workflow and existing staging control path.
- Release workflow, validation, compliance, and inventory tests.
- `docs/ENV_SETUP.md`, `docs/PRODUCTION_RELEASE_RUNBOOK.md`, and
  `docs/SECRETS_ROTATION.md`.

## TDD RED Evidence

Review amendment contract:

```text
npx vitest run scripts/production-release-validation.test.mjs scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs scripts/release-safety-inventory.test.mjs scripts/capture-cloudflare-admin-posture.test.mjs scripts/validate-cloudflare-pages-staging-posture.test.mjs
Exit 1: 11 failures covering missing isolated lock workflow, approval
environment preflight, run ordering, future approval rejection, attempt-bound
leases, and generic Cloudflare HTTP mutation inventory.
```

Evidence-workflow mutation counterexample:

```text
npx vitest run scripts/release-safety-inventory.test.mjs
Exit 1: variable Cloudflare API base plus curl PATCH was not inventoried.
```

Bootstrap and replay-binding amendment:

```text
npx vitest run scripts/production-release-validation.test.mjs scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs
Exit 1: 5 failures, 45 passed.
Expected failures: no least-privilege token fallback, no missing-ID bootstrap
evidence path, no mutation token fallback, missing approval tuple fields, and
repository mismatch accepted by approval validation.
```

Final architecture RED:

```text
npx vitest run scripts/production-release-validation.test.mjs scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs
Exit 1: 3 failures, 48 passed.
Expected failures: no secretless current-main collector preflight/pinned
checkout and no repository/source-tree/approval-nonce lease binding.

npx vitest run scripts/production-release-validation.test.mjs scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs
Exit 1: 4 failures, 49 passed.
Expected failures: lock posture blocked unlocked identity bootstrap, trusted-main
bootstrap was not formalized, and invalid approval/lease clocks were accepted.
```

Final audit RED:

```text
npx vitest run scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs scripts/release-safety-inventory.test.mjs
Exit 1: 3 files failed; 6 tests failed and 31 passed.
Expected failures: compliance collection still exposed GitHub, Supabase, and
Sentry credentials job-wide; approval and Cloudflare lock policy checks did
not reject a tag policy named main; non-curl Cloudflare API mutations were not
inventoried; and no dedicated Cloudflare HTTP mutation allowlist existed.
```

## GREEN Verification

```text
npx vitest run scripts/production-release-validation.test.mjs scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs scripts/release-safety-inventory.test.mjs scripts/capture-cloudflare-admin-posture.test.mjs scripts/validate-cloudflare-pages-staging-posture.test.mjs
Exit 0: 6 files, 78 tests passed.

node --input-type=module -e "<js-yaml parse of approve, compliance, and lock workflows>"
Exit 0: all three workflows parsed.

npm run typecheck
Exit 0.

npm run build
Exit 0.

npm run check:release-safety
Exit 0: release-safety OK; dedicated lock PATCH and existing staging POST
inventoried, with zero workflow violations.

npm run check:github-governance
Exit 0: GitHub governance evidence OK.

npx vitest run scripts/production-mutations-disabled.test.mjs scripts/check-github-governance.test.mjs
Exit 0: 2 files, 22 tests passed.

npm run check:secrets
Exit 0: check-secrets OK.

npm run check:repo-architecture
Exit 0: repository architecture contract OK.

npx eslint --no-ignore scripts/production-release-validation.mjs scripts/production-release-validation.test.mjs scripts/production-release-train.test.mjs scripts/compliance-evidence-workflow.test.mjs scripts/release-safety-inventory.mjs scripts/release-safety-inventory.test.mjs
Exit 0.

git diff --check
Exit 0; only configured LF-to-CRLF notices.
```

## Self-Review

- Production deployment topology was not enabled or mutated.
- Compliance evidence contains no Cloudflare HTTP write.
- Cloudflare write credentials exist only in the isolated manual lock step.
- Raw Cloudflare responses and PATCH bodies remain under runner temp and are
  not uploaded.
- Read-only identity bootstrap fails only after minimized evidence upload.
- Unlocked posture does not prevent missing-ID bootstrap evidence; lock posture
  is enforced only after exact IDs are pinned.
- Secret-bearing standards collection cannot run on non-main refs and checks
  out only the API-verified current-main/workflow SHA.
- Checkout, setup, installation, and local standards steps receive no GitHub,
  Supabase, or Sentry credentials; each credential set exists only on its
  corresponding evidence step.
- Provider mutation inventory detects the supported curl, Node, PowerShell,
  wget, and GitHub CLI mutation forms and uses a Cloudflare-specific allowlist.
- Mutation cannot use discovered/unpinned identity.
- Approval validation is attempt-exact and rejects self-approval, non-
  allowlisted actors, malformed nonce, mismatched tuple fields, revocation,
  expiry, and materially future approval time.
- Mutation leases bind repository, source tree, approval nonce, lease nonce,
  and all four run IDs/attempts, and expire within 15 minutes.

## Concerns And Rollout Blockers

- The repository is private on a GitHub Free organization plan. Native
  required reviewers and prevent-self-review are unavailable and are not
  claimed as controls.
- Do not dispatch approval until `production-approval` exists with
  `can_admins_bypass=false`, custom branch-policy mode, and exactly one branch
  policy named `main`.
- Compensating approval control is the signed, allowlisted, exact-tuple record
  whose actor must differ from the later deploy actor, plus the short mutation
  lease.
- Do not dispatch the Cloudflare lock until the safe workflow is merged to
  `main`, `cloudflare-git-deploy-lock` has the same main-only/admin-bypass-off
  posture with a sole branch policy named `main`, account/read/edit credentials
  are available, and both project-ID variables are pinned from read-only
  evidence.
- Provider bootstrap must be a safe Task 1 commit merged to trusted `main`
  under `[CF-Pages-Skip]`; perform main-only read/lock verification before
  publishing the remaining candidate. Candidate refs receive no provider
  secrets.
- The named Cloudflare read/edit secrets and project-ID variables do not yet
  exist. The legacy token fallback is temporary and must be rotated to
  least-privilege named tokens after bootstrap.
- No live Cloudflare posture or environment configuration is claimed by this
  local implementation.
- The pre-existing untracked
  `docs/superpowers/plans/2026-07-29-complete-ecas-production-release.md`
  remains untouched and excluded.
