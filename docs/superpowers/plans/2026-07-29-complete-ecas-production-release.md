# Complete ECAS Production Release

## Objective

Finish the fail-closed ECAS release train without reintroducing automatic or
rebuild-based production deployment. The exact current `main` SHA must be
proved in CI, deployed to isolated staging, independently approved, and then
promoted to production in this order:

1. Supabase database migrations
2. Supabase Edge Functions
3. Cloudflare Pages

## Global Constraints

- Production and staging Cloudflare Pages Git deployments remain disabled.
- No production mutation runs from a pull request or ordinary push.
- Every production mutation requires the exact current `main` SHA, successful
  CI provenance, signed staging evidence, a signed unexpired independent
  approval, and a run-scoped mutation lease.
- The production dispatcher and approval actor must differ.
- Production Supabase is always `qvvicunqcrwpioqnvzxf`.
- Staging Supabase is always `xsiehskfgeoqyazcgauv`.
- Database history must be a compatible subset of the exact staged migration
  inventory before apply and must equal it after apply.
- Edge source and JWT mode must match staging before mutation; production live
  `ezbr_sha256` and JWT mode must match staging after mutation.
- CI packages the exact Supabase migration and Edge source tree into the signed
  release candidate; staging and production both mutate from that package.
- Cloudflare deploys the signed CI `dist` artifact without rebuilding it.
- Cloudflare must capture a successful full-SHA rollback deployment before
  mutation and verify the exact rollback SHA if post-deploy health fails.
- Secrets are passed explicitly to reusable workflows. No `secrets: inherit`.
- No candidate branch receives live provider secrets. Provider posture checks
  execute only from a workflow SHA independently verified as current `main`.
- Production workflows use the protected `production` environment and the
  shared `maiprop-production-release` concurrency group.
- New behavior is developed test-first and all workflow YAML is parsed in tests.
- The final pushed commit begins with `[CF-Pages-Skip]`.

## Task 1: Preflight, Approval, And Lease Contracts

- Land the bootstrap Task 1 workflow as a safe bootstrap commit merged to trusted `main` under `[CF-Pages-Skip]`
  before publishing the remaining candidate. Perform main-only read and lock verification from that trusted
  workflow; candidate-ref provider verification is prohibited.
- Extend the standards evidence workflow so a main-only dispatch captures both
  fixed Pages identities. When ID pins are absent, upload minimized identity
  evidence and fail for bootstrap without requiring lock posture. After pins
  are configured, require both Pages projects to have Git deployments locked.
- Add a manual production approval workflow that:
  - accepts a full release SHA and exact confirmation text;
  - proves current `main`, successful CI, and signed staging evidence;
  - runs in a protected approval environment;
  - writes a short-lived approval JSON tied to SHA, artifact digest, staging
    run, approval run, and `github.actor`;
  - attests and uploads the approval artifact.
- Add CLI modes and tests for selecting the approval run, validating the
  approval artifact, and validating a run-scoped mutation lease.

## Task 2: Production Supabase Promotion

- Replace the database and Edge fail-closed stubs with workflow-call-only
  reusable workflows.
- Both workflows check out the exact SHA, download and verify the signed staging
  attestation and current-run mutation lease, prove the fixed production target,
  and revalidate current `main` immediately before mutation.
- Database promotion compares migration history before apply, applies only the
  staged exact inventory, then proves exact history, generated types, index
  stats, advisors, and security posture.
- Edge promotion proves staged source/JWT inventory before deploy, deploys all
  exact-SHA functions with the pinned CLI, and requires live bundle/JWT parity
  with staging after deploy.
- Upload production evidence artifacts for both boundaries.

## Task 3: Immutable Cloudflare Promotion

- Replace the Cloudflare fail-closed stub with a workflow-call-only reusable
  workflow.
- Download and cryptographically verify the source CI release candidate.
- Re-attest that both Pages projects have automatic deployments disabled.
- Capture and validate the current canonical production rollback target.
- Synchronize production runtime bindings without writing secrets to artifacts.
- Deploy the isolated signed `dist` directory with `commit-dirty=false`.
- Validate the exact deployment record, stable release marker, runtime config,
  public API contracts, browser health, and catalogue consistency.
- On health failure, roll back to the captured deployment and require the
  stable domain to serve the captured full SHA.

## Task 4: Coordinated Release And Recovery

- Wire the production entrypoint to validate the signed staging and approval
  artifacts, issue the run-scoped mutation lease, and call database, Edge, and
  Cloudflare workflows in order.
- Add a final signed production release evidence aggregate.
- Keep direct Cloudflare recovery exact-SHA and same-run-backend-proof gated;
  recovery deploys the existing signed CI artifact and never rebuilds.
- Update release-safety inventory, runbooks, and workflow contract tests.

## Task 5: Verification And Release Operation

- Add strict homepage/open-house endpoint budgets and exact-SHA staged
  catalogue navigation, AI Insights, CWV, query-budget, and N-1 compatibility
  evidence. Bind every proof digest to the staging attestation.

- Run focused workflow/script tests after every red-green change.
- Run typecheck, migration gates, release safety, Deno tests, full Vitest, and
  production build.
- Obtain independent Supabase, Cloudflare, GitHub, performance, audit, and
  architecture supervisor verdicts.
- Commit changes, add the final empty `[CF-Pages-Skip]` commit, and push once.
- Bootstrap and run standards evidence from verified current `main`; never
  dispatch a candidate ref with provider secrets.
- Open a PR, pass all checks, and squash merge.
- Pin staging variables to the exact merge SHA and run the exact-SHA staging
  train.
- Require signed staging evidence and an approval by a different allowlisted
  actor before enabling and dispatching production.
- Verify production health and preserve all release/rollback evidence.
