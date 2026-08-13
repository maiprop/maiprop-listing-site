# Production Release Runbook

## Release Contract

Production mutation is enabled only through the protected coordinated release
and exact-artifact Cloudflare recovery workflows. Both fail closed unless
`PRODUCTION_RELEASE_ENABLED=true`, the requested SHA is current `main`, signed
staging and independent approval evidence validate, and the current workflow
attempt owns an unexpired mutation lease.

One full 40-character SHA is deployed in this order:

1. Supabase database migrations
2. All Supabase Edge Functions
3. Cloudflare Pages

The SHA must be the current canonical `main` SHA and its push-triggered CI run
must contain the successful final job **Immutable release candidate built**.
That job proves the signed static candidate only; it is not production approval.

All production entry points share the `maiprop-production-release` concurrency
lease. A release is never cancelled after it starts.

## GitHub Free Release Controls

The repository is private on a GitHub Free organization plan. Native
environment required reviewers, protected environment secrets, and
prevent-self-review are unavailable and must not be claimed as release
controls. Release jobs therefore use repository-scoped secrets and fail closed
unless the workflow, event, checkout, and requested release all identify the
exact current `main` SHA; the run is attempt one; and the actor equals the
triggering actor and belongs to the relevant repository allowlist. No release
job declares a GitHub `environment`.

Production approval is a signed exact-SHA artifact created by an allowlisted
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

The Cloudflare compliance and lock workflows require separate repository
secrets `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_PAGES_READ_TOKEN`,
`CLOUDFLARE_PAGES_EDIT_TOKEN`, `CLOUDFLARE_STAGING_ACCOUNT_ID`,
`CLOUDFLARE_STAGING_PAGES_READ_TOKEN`, and
`CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN`, plus exact repository variables
`CLOUDFLARE_PAGES_PROJECT_ID` and `CLOUDFLARE_STAGING_PAGES_PROJECT_ID`.
Equal production/staging account IDs fail before lookup or mutation. Merge the
safe bootstrap Task 1
workflows to trusted `main` under `[CF-Pages-Skip]` before publishing the rest
of the candidate. Run read/lock verification only from that independently
verified current-main workflow SHA; no candidate branch receives provider
secrets. Candidate-branch execution is rejected. Protected release trains do
not use the legacy broad `CLOUDFLARE_API_TOKEN`.

When the project-ID variables are absent, the read-only standards workflow
GETs both fixed project names, validates identity and optional Git source type, and uploads
minimized evidence containing their distinct IDs even when Git previews remain
unlocked. It then fails with a bootstrap instruction without treating lock
posture as an identity prerequisite. Set both variables from that evidence and
rerun; only the pinned rerun enforces lock posture. The bootstrap lock workflow
never bootstraps identity: both distinct pinned IDs are mandatory before it can
change Git integration posture. A Direct Upload project has no Git source and
is therefore already locked; the workflow records `source: null` and performs
no settings PATCH for that project. The production release train performs no
project-settings PATCH and accepts only pre-provisioned runtime bindings.

The caller resolves these repository or organization secrets explicitly when
invoking the reusable provider boundaries:

- `SUPABASE_ACCESS_TOKEN`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_STAGING_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_READ_TOKEN`
- `CLOUDFLARE_PAGES_EDIT_TOKEN`
- `CLOUDFLARE_STAGING_PAGES_READ_TOKEN`
- `CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN`
- `CLOUDFLARE_TURN_KEY_ID`
- `CLOUDFLARE_TURN_API_TOKEN`

`SUPABASE_PRODUCTION_DB_URL` is stored only in the exact GitHub `production`
environment. The called production database and Edge deployment jobs bind that
environment and read the credential directly; a reusable-workflow caller cannot
forward an environment-scoped secret. This environment binding scopes the
credential only and is not treated as release authorization. The signed release
binding, mutation lease, and provider preflight remain the authorization gates.
`secrets: inherit` is forbidden.

The Supabase project ref in `VITE_SUPABASE_PROJECT_ID`, the API host in
`VITE_SUPABASE_URL`, and the direct host or pooler username in
`SUPABASE_PRODUCTION_DB_URL` must identify the same production project. The
database and Edge workflows fail before mutation when this proof does not
match.

Staging and production must use different Cloudflare account IDs. The staging
workflow receives only the staging edit token and account ID. Production
promotion receives the staging read token solely to re-attest the approved
staging deployment, and it uses separate production read/edit credentials for
production. Missing or equal account IDs fail before any provider mutation.

Production Pages runtime bindings are provisioned outside the release train.
Promotion verifies those bindings read-only against the pinned project and
account identities, then proves N-1 compatibility using that exact runtime
posture. It does not synchronize bindings or use a Supabase service-role secret.

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

The staging and production Supabase projects must keep `CRON_SECRET`
synchronized between Vault and the `process-storage-cleanup` and
`reconcile-role-switch-billing` Edge Functions. This secret is runtime
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
- Before any staging mutation, the workflow captured the canonical production
  N-1 deployment identity and its unexpired, attempt-qualified CI artifact.
- Database and Edge changes are backward compatible with the N-1 frontend.
- The N-1 frontend remains compatible with the post-migration database and the
  newly deployed Edge Functions for the entire Cloudflare rollback window. The
  automated proof must run that captured artifact against the isolated staged
  backend and finish with zero skipped, unexpected, or flaky catalogue tests.
- Both the immutable staging deployment URL and stable staging origin pass the
  public API latency/payload budgets. The exact-SHA browser proof must render
  homepage, listings, auctions, and open houses, preserve auction identity into
  detail navigation, show AI Market Insights, and make no direct listings REST
  or `fetch-os-auctions` authority fallback request.
- Exact-SHA CWV/query evidence stays within LCP 3000 ms, CLS 0.1, and INP 200 ms
  plus each route's explicit Supabase request budget.
- Every destructive schema or API change uses a two-phase rollout or feature
  gate. A release that breaks N-1 compatibility must not start.

## Legacy Migration Convergence

Historical migration-ledger differences are accepted only when they match the
fixed, reviewed anomaly manifest at
`supabase/reconciliation/production-history-v1.json`. The release train must
reject any additional alias, marker-only entry, version collision, or changed
canonical migration hash. Canonical SQL file hashes use UTF-8 text with line
endings normalized to LF, so evidence is identical on Windows and Linux.

Staging proves convergence by applying the normal migration chain once, then
running `supabase/reconciliation/production-history-v1.sql` read-only and the
pgTap contract in `supabase/tests/legacy_migration_convergence_test.sql`. The
signed staging database attestation binds the canonical schema evidence object,
its SHA-256 digest, and the forward cutover migration
`20260812102342_reconcile_legacy_migration_effects.sql`.

Production may start only when its pre-mutation history matches that signed
manifest exactly. It applies the forward cutover through the ordinary
lease-bound `supabase db push` path, captures the same read-only schema evidence
afterward, and requires byte-for-byte equality with the signed staging object.
The workflows must never run `supabase migration repair`, update
`supabase_migrations.schema_migrations` directly, or rewrite/delete an applied
migration to manufacture convergence.

## Coordinated Deploy

1. Open GitHub Actions and select **Deploy Production Release**.
2. Select `main`.
3. Enter the current full 40-character `main` SHA in `release_sha`.
4. Enter `DEPLOY_PRODUCTION_RELEASE`.
5. Run the workflow and do not start another production release until it ends.
6. Confirm the serialized jobs complete in this order: database, renewed Edge
   lease, Edge Functions, renewed Cloudflare lease, Cloudflare Pages, signed
   aggregate.
7. Retain the attempt-qualified N-1 source/compatibility, catalogue-performance,
   database, Edge, Cloudflare, and final release artifacts. The schema-v4
   staging attestation must bind every evidence digest. The final production
   aggregate must report `release_status=passed` and
   `rollback_performed=false`.

The database, Edge, and Cloudflare workflows are reusable boundaries only.
They reject standalone production mutations that are not bound to the exact
source, staging, approval, production run ID, run attempt, artifact digests,
and current mutation lease supplied by the coordinated workflow.

## Cloudflare Recovery Entry Point

The recovery workflow accepts only:

- the current canonical `main` SHA;
- successful **Immutable release candidate built** evidence for that SHA; and
- backend proof from one completed **Deploy Production Release** run where both
  the production database and Edge deployment jobs succeeded in the same run
  attempt for that SHA; and
- a fresh signed approval and fresh current-run mutation lease. The fresh
  authorization run is intentionally distinct from the historical backend
  proof run and approval identities.

Enter `RECOVER_CLOUDFLARE_PRODUCTION`. The workflow downloads the existing CI
artifact and attempt-qualified backend attestations; it never rebuilds. This
path cannot deploy an older SHA, combine proof from separate runs or attempts,
or bypass final readiness. Success produces a signed, attempt-qualified
recovery aggregate with `rollback_performed=false`.

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
before deployment, verifies immediately before mutation that the canonical
deployment still has that exact ID/SHA pair, writes the release SHA to
`deploy-version.json`, and rejects a stable-domain health check serving any
other SHA. The captured rollback target must differ from the candidate SHA.

The final signed aggregate binds the candidate and manifest digests, source and
staging run attempts, authorization approval, backend run/approval attempts,
immutable Cloudflare project ID, deployment ID and URL, mutation-lease digest,
and every provider evidence digest. A successful rollback remains failed
release evidence and is never attested as a successful release.

## Rollback Contract

Rollback-candidate capture is mandatory. If Cloudflare cannot identify a
successful prior production deployment with a full commit SHA, deployment
stops before production is changed.

The captured rollback deployment ID/SHA and the candidate SHA are bound into
the rollback authorization lease. Immediately before deploy, the canonical
production deployment must still equal the captured rollback pair. A rollback
is allowed only when production is already at the exact rollback target or is
still at the exact candidate deployment ID/SHA created by this run. A newer or
unrelated deployment causes a fail-closed refusal instead of being overwritten.

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
- A database or Edge failure is never resumed from a later stage. Correct the
  issue, obtain new exact-SHA final readiness, and start a new coordinated
  release. The only supported late-stage recovery is the dedicated no-rebuild
  Cloudflare workflow after one run attempt has already proved both backend
  promotions.
