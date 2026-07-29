# Production Release Runbook

## Release Contract

Production mutation is currently **disabled**. The repository variable
`PRODUCTION_RELEASE_ENABLED` is reserved for the future protected release gate,
but setting it to `true` is not sufficient to deploy while the workflow-level
hard stop remains in place. CI, coordinated release, and recovery entry points
validate evidence only and never mutate production.

One full 40-character SHA is deployed in this order:

1. Supabase database migrations
2. All Supabase Edge Functions
3. Cloudflare Pages

The SHA must be the current canonical `main` SHA and its push-triggered CI run
must contain the successful final job **Immutable release candidate built**.
That job proves the signed static candidate only; it is not production approval.

All production entry points share the `maiprop-production-release` concurrency
lease. A release is never cancelled after it starts.

## Required GitHub Environments

The repository is private on a GitHub Free organization plan. Native
environment required reviewers and prevent-self-review are unavailable and
must not be claimed as release controls. Before either control workflow is
dispatched, create these namespaces manually:

- `production-approval`
- `cloudflare-git-deploy-lock`

Both namespaces must disable administrator bypass, use custom deployment branch
policies, and contain exactly one branch policy named `main`. Their preflight
jobs query the GitHub API and fail closed when a namespace is absent or any of
those controls differs. Do not dispatch either workflow until this posture has
been independently verified.

`production-approval` is a main-only namespace, not a native reviewer gate. Its
compensating control is a signed exact-SHA approval created by an allowlisted
dispatcher whose login must differ from the later deployment actor. Downstream
validation binds the repository, release SHA, source tree, source CI run ID and
attempt, staging run ID and attempt, approval run ID and attempt, immutable
artifact digest, approver, timestamps, and a 256-bit cryptographic nonce.
Validation rejects future, revoked, expired, malformed, replay-ambiguous, or
self-approved records and requires a separately validated mutation lease with
a maximum 15-minute lifetime. The lease carries its own 256-bit nonce and binds
the repository, source tree, signed approval nonce, artifact digest, and every
source/staging/approval/production run ID and attempt. Invalid validation clocks
fail closed.

The Cloudflare lock workflow additionally requires repository secrets
`CLOUDFLARE_PAGES_READ_TOKEN` and `CLOUDFLARE_PAGES_EDIT_TOKEN`, plus exact
repository variables `CLOUDFLARE_PAGES_PROJECT_ID` and
`CLOUDFLARE_STAGING_PAGES_PROJECT_ID`. Merge the safe bootstrap Task 1
workflows to trusted `main` under `[CF-Pages-Skip]` before publishing the rest
of the candidate. Run read/lock verification only from that independently
verified current-main workflow SHA; no candidate branch receives provider
secrets. Candidate-branch execution is rejected. Until the
least-privilege secrets are provisioned, the isolated main-only read and edit
steps may temporarily fall back to the existing `CLOUDFLARE_API_TOKEN`; rotate
to the named read/edit tokens after bootstrap.

When the project-ID variables are absent, the read-only standards workflow
GETs both fixed project names, validates identity/source type, and uploads
minimized evidence containing their distinct IDs even when Git previews remain
unlocked. It then fails with a bootstrap instruction without treating lock
posture as an identity prerequisite. Set both variables from that evidence and
rerun; only the pinned rerun enforces lock posture. The mutation workflow never
bootstraps identity: both distinct pinned IDs are mandatory and validated
before either PATCH.

The `production` environment must contain:

- `SUPABASE_ACCESS_TOKEN`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `SUPABASE_PRODUCTION_DB_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_APP_URL`

The Supabase project ref in `VITE_SUPABASE_PROJECT_ID`, the API host in
`VITE_SUPABASE_URL`, and the direct host or pooler username in
`SUPABASE_PRODUCTION_DB_URL` must identify the same production project. The
database and Edge workflows fail before mutation when this proof does not
match.

Optional frontend/runtime secrets used when configured are:

- `SITE_LOCK_PASSWORD`
- `CF_ACCESS_CLIENT_ID` or `CLOUDFLARE_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET` or `CLOUDFLARE_ACCESS_CLIENT_SECRET`
- `CF_ACCESS_TOKEN` or `CLOUDFLARE_ACCESS_TOKEN`
- `VITE_MAPBOX_TOKEN`
- `VITE_SENTRY_DSN`
- `VITE_STRIPE_PRO_PRODUCT_ID`
- `VITE_TURNSTILE_SITE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`
- `VITE_PLAUSIBLE_DOMAIN`

The Supabase project must also keep `CRON_SECRET` synchronized between Vault
and the `process-storage-cleanup` Edge Function. This secret is runtime
infrastructure, not a frontend build variable.

`SITE_LOCK_PASSWORD` is synchronized to Cloudflare as a `secret_text` binding.
It must never be written into Wrangler `[vars]`, build artifacts, summaries, or
uploaded release evidence.

## Preconditions

- The selected SHA is the current `main` SHA.
- **Immutable release candidate built** succeeded for that exact SHA.
- The staging gate proved an isolated Supabase staging project; a successful
  no-op or production fallback is not release readiness.
- Staging migration, security, E2E, performance, and Lighthouse gates succeeded.
- Database and Edge changes are backward compatible with the N-1 frontend.
- The N-1 frontend remains compatible with the post-migration database and the
  newly deployed Edge Functions for the entire Cloudflare rollback window.
- Every destructive schema or API change uses a two-phase rollout or feature
  gate. A release that breaks N-1 compatibility must not start.

## Coordinated Deploy

This procedure is intentionally unavailable while production mutations remain
disabled. The dispatch validates the candidate and then fails closed before it
can call a database, Edge Function, or Cloudflare mutation workflow.

1. Open GitHub Actions and select **Deploy Production Release**.
2. Select `main`.
3. Enter the current full 40-character `main` SHA in `release_sha`.
4. Enter `DEPLOY_PRODUCTION_RELEASE`.
5. Run the workflow and do not start another production release until it ends.

The reusable database and Edge workflows permit standalone dry runs for
inventory only. They reject standalone production mutations without an
explicit release SHA from the coordinated release workflow.

## Cloudflare Recovery Entry Point

**Direct Cloudflare Production Deploy** is also validation-only while
`PRODUCTION_RELEASE_ENABLED` is disabled. It proves the current SHA and backend
proof, then fails closed without invoking Cloudflare.

The recovery workflow accepts only:

- the current canonical `main` SHA;
- successful **Immutable release candidate built** evidence for that SHA; and
- backend proof from one completed **Deploy Production Release** run where both
  the production database and Edge deployment jobs succeeded for that SHA.

Enter `RECOVER_CLOUDFLARE_PRODUCTION`. This path cannot deploy an older SHA,
cannot combine proof from separate runs, and cannot bypass final readiness.

## Release Evidence

The database artifact contains project identity proof, migration lists, schema
lint output, push output, index statistics, and advisor results.

The Edge artifact contains:

- the exact release SHA recorded as `RELEASE_SAFETY_RELEASE_SHA` and the
  production project ref;
- a deterministic SHA-256 source manifest for shared runtime files, config, and
  every function file;
- each function's local and effective source hashes;
- the manifest hash;
- post-deploy function version, update time, JWT mode, and Supabase bundle hash
  (`ezbr_sha256`);
- an attestation linking the exact source manifest to the live inventory.

Cloudflare captures the previous successful production deployment ID and SHA
before deployment, writes the release SHA to `deploy-version.json`, and rejects
a stable-domain health check serving any other SHA.

## Rollback Contract

Rollback-candidate capture is mandatory. If Cloudflare cannot identify a
successful prior production deployment with a full commit SHA, deployment
stops before production is changed.

When the post-deploy health check fails:

1. Cloudflare rolls back to the captured deployment ID.
2. The workflow runs the production browser/API health check again.
3. The second check must serve the captured rollback SHA, not merely HTTP 200.
4. The failed release remains failed even when rollback verification succeeds.

Cloudflare rollback does not roll back Supabase migrations or Edge Functions.
Therefore:

- migrations must be additive and backward compatible;
- renamed/dropped columns require expand, migrate, and contract releases;
- Edge request and response contracts must support N-1 frontend clients;
- feature activation must occur only after all compatible layers are live.

If database or Edge rollback is required, stop traffic-changing work and use a
separately reviewed forward-fix or additive repair. Never rewrite or delete an
applied production migration.

## Failure Handling

- Database failure: stop; Edge and Cloudflare do not run.
- Edge failure: stop; Cloudflare does not run.
- Cloudflare failure: perform and verify the automatic SHA-specific rollback.
- Storage cleanup dead-letter: inspect the exact bucket/path and commitment
  state, correct the underlying Storage/configuration fault, then requeue the
  reviewed job with `requeue_storage_cleanup_job(uuid)`. Never delete by URL
  prefix or requeue unreviewed dead jobs in bulk.
- A failed release is never resumed from a later stage. Correct the issue,
  obtain new exact-SHA final readiness, and start a new coordinated release.
