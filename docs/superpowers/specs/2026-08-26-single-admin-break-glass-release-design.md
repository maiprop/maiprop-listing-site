# Single-Admin Break-Glass Release Design

**Date:** 2026-08-26

**Status:** Approved design, pending written-spec review

**Owner/operator:** `krenios`
**Applies to:** `maiprop/maiprop-listing-site`

## Background

The production release train deliberately requires different GitHub actors for release evidence production, protected provider provisioning, approval, and deployment. That is the correct steady-state control, but the repository currently has one available owner/operator, `krenios`. The existing approver accounts are unavailable to the owner, so the normal path cannot complete even though the required Stripe and Cloudflare credentials are configured.

This design adds a temporary, explicit, exact-SHA break-glass path. It does not remove or weaken the normal two-person path. The exception is limited to one configured actor, one configured current-main SHA, one incident, a short expiry, attempt-1 manual workflow runs, action-specific confirmations, signed evidence, and single-use mutation receipts.

The break-glass path is intended only to bootstrap this release, deploy the accumulated performance work, and remeasure the live critical flows. It is not a permanent substitute for independent approval.

## Goals

- Permit the sole owner/operator, `krenios`, to complete the otherwise-blocked Stripe readiness, staging and production Pages provisioning, production approval, and coordinated production deployment.
- Bind every exception decision to the exact current-main commit, repository, actor, incident, reason hash, expiry, workflow action, run ID, and run attempt.
- Preserve all existing exact-SHA CI, staging, signed evidence, provider isolation, preflight, lease, rollback, post-deploy verification, and release-variable gates.
- Make every state-changing break-glass action single-use and non-replayable during the authorization window.
- Make failures fail closed and burn the affected mutation authorization, requiring a new incident before retrying a state-changing action.
- Remove the temporary repository authorization variables after final production verification.

## Non-goals

- No permanent self-approval or general bypass of `PRODUCTION_RELEASE_APPROVERS`.
- No bypass for historical commits, non-`main` refs, reruns, substituted actors, direct provider deployments, or standalone recovery workflows.
- No broader GitHub, Stripe, Supabase, or Cloudflare permissions.
- No change to the production release order or rollback semantics.
- No automatic deployment merely because break-glass variables exist.
- No reuse of the exception for later releases.

## Selected approach

Use a SHA-bound, short-lived, one-incident exception inside the existing workflows. Normal authorization remains the default. Each participating workflow chooses exactly one of two discriminated modes:

- `standard`: all current allowlists and actor-separation checks remain mandatory.
- `break_glass`: a central validator must prove the complete exception contract before the narrowly identified separation check may be waived.

A separate duplicate deployment workflow is rejected because it would drift from the signed evidence, leases, rollback, and verification controls already present. A permanent self-approval flag is rejected because it would turn an incident mechanism into an ambient privilege. A GitHub App approver remains the preferred long-term way to restore actor separation, but it is not required to unblock this release.

## Authorization configuration

Four repository variables define the complete break-glass authorization:

| Variable | Required value and validation |
| --- | --- |
| `PRODUCTION_BREAK_GLASS_ACTOR` | Exact GitHub login `krenios`, normalized to lowercase, and also present in `PRODUCTION_RELEASE_DEPLOYERS`. |
| `PRODUCTION_BREAK_GLASS_RELEASE_SHA` | Exact lowercase 40-character SHA. It must equal the dispatch input, checkout SHA, workflow SHA, and current `main` SHA. |
| `PRODUCTION_BREAK_GLASS_INCIDENT_ID` | The exact incident identifier supplied to every workflow. Format: `[A-Z0-9][A-Z0-9._-]{7,63}` after trimming and uppercasing. |
| `PRODUCTION_BREAK_GLASS_EXPIRES_AT` | RFC 3339 UTC timestamp in the future and no more than four hours after validation begins. |

These variables are configuration, not secrets. Possession of repository administration alone is not treated as sufficient workflow authorization: all runtime checks and explicit dispatch inputs below are still required.

Every participating `workflow_dispatch` adds these inputs:

| Input | Type | Rule |
| --- | --- | --- |
| `single_admin_break_glass` | boolean, default `false` | Must be explicitly true to enter break-glass mode. |
| `incident_id` | string, optional in the dispatch schema | Required and exact-match to the configured incident in break-glass mode; must be empty in standard mode. |
| `reason` | string, optional in the dispatch schema | Required in break-glass mode, 20-500 trimmed printable characters with no line breaks; must be empty in standard mode. Only its SHA-256 digest is persisted. |

`confirm` remains required. Standard mode preserves the current confirmation phrase. Break-glass mode requires the following exact, case-sensitive phrase, including the SHA and incident ID:

| Action | Break-glass confirmation |
| --- | --- |
| Stripe live readiness | `VERIFY_STRIPE_BREAK_GLASS <release_sha> <incident_id>` |
| Staging Pages provisioning | `PROVISION_STAGING_PAGES_BREAK_GLASS <release_sha> <incident_id>` |
| Production Pages provisioning | `PROVISION_PRODUCTION_PAGES_BREAK_GLASS <release_sha> <incident_id>` |
| Production approval | `APPROVE_PRODUCTION_BREAK_GLASS <release_sha> <incident_id>` |
| Coordinated production deployment | `DEPLOY_PRODUCTION_BREAK_GLASS <release_sha> <incident_id>` |

The angle-bracket tokens above are replaced with the submitted exact SHA and incident ID. A generic phrase, the standard phrase, a wrong action phrase, or extra whitespace fails.

## Central validation contract

Add `scripts/production-break-glass-validation.mjs` as the only implementation of break-glass input validation. It exposes importable functions for unit tests and a CLI used by workflows. The CLI receives an action enum plus trusted GitHub context, repository variables, and dispatch inputs, then emits normalized JSON and selected `GITHUB_OUTPUT` fields.

Allowed actions are:

- `stripe-readiness`
- `pages-staging`
- `pages-production`
- `production-approval`
- `production-deploy`

For `break_glass`, validation requires all of the following:

1. The boolean input is exactly true; no truthy string coercion is accepted by the library.
2. Repository and ref are `maiprop/maiprop-listing-site` and `refs/heads/main`.
3. `github.actor` equals `github.triggering_actor`, equals `PRODUCTION_BREAK_GLASS_ACTOR`, and equals `krenios` after lowercase normalization.
4. The actor remains an allowlisted production deployer. Approver membership is not used in break-glass mode.
5. The run is `workflow_dispatch` attempt 1.
6. The submitted SHA is lowercase, full length, and equals the configured SHA, `GITHUB_SHA`, `GITHUB_WORKFLOW_SHA`, checked-out `HEAD`, and the SHA returned for current `main`.
7. The submitted incident ID is valid and equals the configured incident ID after normalization.
8. The reason passes length and character validation; `reason_sha256` is computed from the exact trimmed UTF-8 reason.
9. The configured expiry is valid, in the future, and no more than four hours away.
10. The confirmation is exactly the phrase for the requested action, SHA, and incident.

The normalized output is:

```json
{
  "mode": "break_glass",
  "action": "production-deploy",
  "actor": "krenios",
  "release_sha": "<40 lowercase hex>",
  "incident_id": "<normalized incident>",
  "reason_sha256": "<64 lowercase hex>",
  "authorized_expires_at": "<RFC 3339 UTC>",
  "workflow_run_id": "<positive integer string>",
  "workflow_run_attempt": "1"
}
```

For `standard`, the central mode selector requires `single_admin_break_glass == false`, empty `incident_id`, empty `reason`, and the current standard confirmation. It then delegates authorization to the existing workflow checks. Mixed-mode inputs fail closed instead of silently falling back to standard mode.

The helper must not read provider secrets, modify repository state, or call provider APIs.

## Signed authorization evidence

Every break-glass workflow persists the normalized authorization object in its evidence and signs the artifact through the existing release-evidence binding mechanism. The persisted reason is always `reason_sha256`; plaintext reason must not appear in artifacts, logs, summaries, or job outputs.

The following fields are mandatory in every signed break-glass evidence object:

- `mode`
- `action`
- `actor`
- `release_sha`
- `incident_id`
- `reason_sha256`
- `authorized_expires_at`
- `workflow_run_id`
- `workflow_run_attempt`

The Stripe readiness artifact gains an `authorization` object and its existing signed binding covers it. Each Pages provisioning artifact gains the same object and a new signed artifact binding produced and verified with `RELEASE_EVIDENCE_SIGNING_KEY` and `RELEASE_EVIDENCE_SIGNING_KEY_ID`. Standard evidence either records `{ "mode": "standard" }` in a new schema or remains accepted under its current schema; it can never be interpreted as break-glass evidence.

Production approval moves to schema version 2 and adds the complete `authorization` object. The validator continues to accept schema-version-1 approvals only as standard approvals for backward compatibility. Schema version 2 is discriminated strictly:

- `authorization.mode == "standard"`: the approver must be allowlisted and different from CI, staging, and deployment actors exactly as today.
- `authorization.mode == "break_glass"`: the full central contract must be revalidated; the approver must equal the configured break-glass actor and eventual deployment actor; only the independence and approver-allowlist checks are waived.

Unknown modes, partial authorization objects, break-glass fields on version 1, or extra unsupported authorization fields fail validation.

The approval expiry is the earlier of two hours after approval or `authorized_expires_at`. Downstream validation checks both deadlines.

## Single-use consumption receipts

The read-only Stripe check and approval artifact do not mutate provider state and therefore do not consume the incident. Each state-changing action has a separate one-shot scope:

- `pages-staging`
- `pages-production`
- `production-deploy`

Before the first provider mutation in one of those actions, the workflow performs these steps inside its existing non-cancelling concurrency group:

1. Compute the exact artifact name `production-break-glass-consumed-<action>-<release_sha>-<incident_id>`.
2. Query the repository Actions artifact API by exact name. Any existing artifact, including an expired result returned by the API, causes a hard failure.
3. Create `production-break-glass-consumption.json` containing schema version 1, the normalized authorization object, a cryptographic nonce, `consumed_at`, repository, workflow ref/SHA, run ID, and run attempt.
4. Upload it with `actions/upload-artifact`, `overwrite: false`, and seven-day retention.
5. Create and verify a signed release-artifact binding using the returned immutable artifact ID and digest.
6. Query by exact name again and require exactly one artifact whose ID and digest match the just-uploaded receipt.
7. Expose the receipt artifact ID, digest, binding artifact ID, and payload SHA-256 as the `consumption` tuple.

No provider mutation may begin until all seven steps succeed. The four-hour maximum authorization lifetime is shorter than receipt retention, so expiration cannot create a replay window. The workflow concurrency groups serialize competing uses; the post-upload uniqueness check detects unexpected duplicates before mutation.

Once the receipt is uploaded, that action is burned even if a later provider step fails or automatic rollback succeeds. A retry requires a new incident ID and freshly configured expiry. Rerunning the failed workflow is always rejected because only attempt 1 is valid.

Standard-mode releases do not create or require break-glass consumption receipts.

## Workflow changes

### Stripe live readiness

Update `.github/workflows/verify-stripe-live-readiness.yml` to select standard or break-glass authorization before checkout or Stripe access. Standard mode keeps the approver allowlist. Break-glass mode uses the central validator, adds the normalized authorization object to the live-readiness evidence, and signs it with the existing binding. It remains read-only and attempt 1 only.

The production deployment validator must require the selected Stripe readiness evidence to use the same authorization mode, SHA, incident, reason hash, actor, and unexpired authorization as the production approval when either artifact is break-glass. Standard and break-glass evidence cannot be mixed in one release tuple.

### Pages runtime provisioning

Update `.github/workflows/provision-cloudflare-pages-runtime.yml` to authorize both targets through the mode selector.

In standard mode, the current target-specific confirmation, release-enabled variable, approver allowlist, and deployer separation remain unchanged.

In break-glass mode:

- The target maps to `pages-staging` or `pages-production` and its exact confirmation.
- The central validator replaces only the release-enabled and approver/deployer-separation gates. Provider credential-isolation, exact-current-main, fixed project/account identity, secret completeness, and all post-write reads remain mandatory.
- A target-specific consumption receipt is signed and verified before the first Cloudflare or Supabase mutation.
- The provisioning evidence includes the authorization and consumption tuples and receives a signed artifact binding.

This resolves the bootstrap ordering problem: Pages runtime proof can be established while `STAGING_RELEASE_ENABLED` and `PRODUCTION_RELEASE_ENABLED` remain false. Those variables are enabled only after both target proofs succeed.

### Production approval

Update `.github/workflows/approve-production-release.yml` so its job-level condition accepts either the unchanged standard confirmation or a break-glass dispatch that is validated inside the job. Do not place the entire break-glass security policy only in a job-level expression; the Node validator is authoritative.

All exact-SHA source CI and signed staging evidence checks remain. Standard mode retains the current approver allowlist and independence checks. Break-glass mode permits `krenios` to match the CI/staging producer only after the central validator succeeds. It emits and signs the schema-version-2 approval described above.

### Coordinated production deployment

Update `.github/workflows/deploy-production-release.yml` to select the authorization mode at the start of `validate`. Standard mode behaves exactly as today. Break-glass mode must:

- Revalidate the configured actor, exact current-main SHA, incident, reason hash, expiry, attempt, and action-specific confirmation.
- Require the signed Stripe and production approval artifacts to contain the identical authorization tuple.
- Require both signed Pages provisioning proofs to contain the identical authorization tuple and their target-specific consumption tuples.
- Preserve `PRODUCTION_RELEASE_ENABLED == true`, production deployer membership, CI and staging evidence, Pages proofs, provider preflight, immutable source archival, and all current exact-SHA checks.
- Create and bind the `production-deploy` consumption receipt before archive or any database, Edge, or Cloudflare mutation. The receipt job becomes a dependency of every mutating job.
- Pass the authorization and consumption tuples to database deployment, Edge deployment, Cloudflare deployment, every lease-renewal job, automatic rollback, and final evidence aggregation.

The top-level global `maiprop-production-release` concurrency group remains non-cancelling.

### Reusable mutation workflows and leases

Extend the `workflow_call` contracts for `.github/workflows/deploy-supabase-production-db.yml`, `.github/workflows/deploy-edge-functions.yml`, and `.github/workflows/reusable-cloudflare-production-deploy.yml` with explicit authorization and consumption inputs. Do not infer break-glass mode from actor equality.

Every reusable workflow must independently validate:

- authorization mode and complete tuple;
- approval mode and tuple equivalence;
- receipt artifact identity, digest, payload hash, signed binding, action `production-deploy`, and parent production run;
- exact SHA, source tree, current run ID/attempt, and deploy actor;
- unexpired authorization at mutation time.

Mutation leases move to schema version 3 and include `authorization` and `consumption`. Schema-version-2 leases remain valid only for standard-mode paths. Each renewal copies the same tuples and the validator rejects changes or omissions. Database, Edge, Cloudflare, and aggregate production attestations also include hashes of both tuples so the final signed evidence proves which authorization was used.

### Rollback and recovery

Automatic rollback within the coordinated production run inherits and revalidates the same authorization, consumption receipt, lease, and parent run. It remains allowed after the authorization time passes only when the forward mutation began while authorization and the lease were valid; this prevents expiry from blocking safety recovery. The final evidence records that timing and the rollback outcome.

Standalone or manually dispatched recovery and direct Cloudflare production deployment workflows receive no break-glass path. They continue to require their existing independent controls. A failed break-glass deployment must not be resumed through a direct provider workflow under the consumed incident.

## Release state transitions

The exception follows this sequence:

1. Merge the reviewed implementation to `main`.
2. Wait for successful exact-SHA CI on the new `main` SHA.
3. Configure the four break-glass repository variables for that exact SHA, actor, incident, and a fresh expiry.
4. Run signed Stripe readiness in break-glass mode.
5. Provision staging Pages in break-glass mode; consume `pages-staging`.
6. Provision production Pages in break-glass mode; consume `pages-production`.
7. Verify both target proofs and then set `STAGING_RELEASE_ENABLED=true` and `PRODUCTION_RELEASE_ENABLED=true`.
8. Stage the exact candidate and verify signed staging evidence.
9. Approve the exact release in break-glass mode.
10. Dispatch the coordinated production deployment in break-glass mode; consume `production-deploy` before mutations.
11. Verify database, Edge, Cloudflare, automatic rollback readiness, final production evidence, and the live application.
12. Remeasure explore, sign-in, sign-up, listing creation, and relevant navigation timings with the existing performance protocol.
13. Record the intended steady-state release-enabled values and delete all four `PRODUCTION_BREAK_GLASS_*` variables. The exception is removed regardless of whether the release-enabled gates remain true for the normal two-person train.

If `main` advances at any point before deployment, every break-glass action for the old SHA fails and the operator must start with a new incident and exact SHA.

## Failure behavior

- Validation failure occurs before credentials are used or providers are mutated.
- Missing, malformed, mixed-mode, expired, or mismatched authorization data fails closed.
- A failed read-only Stripe check may be dispatched again as a new attempt-1 run under the same unexpired incident because it creates no provider state.
- A failed approval may be dispatched again as a new attempt-1 run under the same unexpired incident; only the approval selected by the deployment is valid.
- A failed Pages or production mutation action remains consumed and requires a new incident, even if no external change is observed.
- Provider partial failure follows the existing rollback/reconciliation behavior. Break-glass does not introduce force-forward recovery.
- Job summaries state mode, action, actor, SHA, incident ID, expiry, run ID, receipt IDs, and outcome, but never the plaintext reason or secrets.

## Security boundaries

The exception waives only actor independence and approver allowlist membership for the configured single admin. It does not waive:

- exact current `main` identity;
- attempt-1 and actor-equals-triggering-actor checks;
- production deployer membership;
- signed CI, staging, Stripe, approval, lease, and deployment evidence;
- fixed provider account/project identities and isolated credentials;
- release-enabled gates at coordinated deployment time;
- immutable source archival, preflight, staged ordering, health checks, final proof, or automatic rollback;
- least-privilege provider credentials.

Repository administrators can edit Actions variables and workflow code, so this mechanism cannot create separation from a compromised repository owner. Its purpose is narrower: make the exceptional action explicit, time-bound, exact-SHA-bound, reviewable, non-ambient, and resistant to accidental replay while preserving all technical release proofs.

## Test strategy

Implementation follows test-driven development. Failing tests are added before workflow or validator changes.

### Unit tests

Add `scripts/production-break-glass-validation.test.mjs` covering:

- valid standard selection and valid break-glass selection for every action;
- wrong actor, substituted triggering actor, actor not in deployers, wrong repository/ref, wrong current-main/workflow/checkout SHA, uppercase or malformed SHA;
- missing or wrong incident, invalid reason, changed reason hash, missing/invalid/too-distant/expired expiry;
- standard, generic, wrong-action, wrong-SHA, wrong-incident, or whitespace-altered confirmations;
- reruns and non-dispatch events;
- mixed standard and break-glass inputs;
- deterministic normalization and reason hashing.

Extend `scripts/production-release-validation.test.mjs` for approval schema 2, strict standard behavior, narrow break-glass actor equality, tuple tampering, expiry, and mutation lease schema 3. Existing tests must still prove that standard self-approval fails.

### Workflow contract tests

Extend:

- `scripts/production-release-train.test.mjs`
- `scripts/github-free-production-release.test.mjs`
- `src/test/ciLiveSecurityWorkflow.test.ts`
- `src/test/directProductionDeployWorkflow.test.ts`
- `src/test/productionProviderBindingWorkflow.test.ts`
- `scripts/check-slsa-readiness.test.mjs`

Contract tests must prove:

- every participating dispatch has typed mode/incident/reason inputs;
- normal self-approval remains rejected in approval, deployment, leases, reusable workflows, and direct recovery;
- only the central validator can authorize the exception;
- all mutating jobs depend on a verified consumption receipt;
- receipt name, precheck, upload, postcheck, binding, retention, and no-overwrite rules are present;
- replay, duplicate receipt, wrong receipt action, wrong parent run, missing propagation, tuple tampering, and direct reusable-workflow invocation fail;
- Stripe, Pages, approval, leases, rollback, and final evidence carry signed authorization fields;
- standalone recovery and direct production deploy remain excluded;
- standard release behavior and existing SLSA/readiness checks remain intact.

### Verification before release

Run targeted validator and workflow tests first, then the complete repository suite. Require zero failures. After merge, use only the exact merged `main` SHA for CI, readiness, provisioning, staging, approval, and deployment. Capture workflow run IDs and immutable artifact identities in the release ledger.

After production verification, run repeated cold and warm live measurements for:

- explore/listing discovery;
- sign-in;
- sign-up through the non-destructive test path;
- listing-creation form navigation and authorized test listing creation;
- the navigation transitions involved in those flows.

Report median, p95 where sample size permits, failures, and before/after deltas. Provider and application errors are reported separately from elapsed time.

## Documentation and audit updates

Update the production runbook, release governance documentation, environment setup reference, SLSA/readiness documentation, and performance stabilization ledger with:

- the break-glass configuration and exact confirmations;
- the one-shot consumption and burn semantics;
- the prohibition on standalone recovery;
- the precise enable/disable and cleanup order;
- immutable artifact and workflow run identifiers;
- live post-deploy timing results.

Plaintext reasons and secret values must never be committed or copied into documentation.

## Expected implementation surface

- `scripts/production-break-glass-validation.mjs`
- `scripts/production-break-glass-validation.test.mjs`
- `scripts/production-release-validation.mjs`
- `scripts/production-release-validation.test.mjs`
- `.github/workflows/verify-stripe-live-readiness.yml`
- `.github/workflows/provision-cloudflare-pages-runtime.yml`
- `.github/workflows/approve-production-release.yml`
- `.github/workflows/deploy-production-release.yml`
- `.github/workflows/deploy-supabase-production-db.yml`
- `.github/workflows/deploy-edge-functions.yml`
- `.github/workflows/reusable-cloudflare-production-deploy.yml`
- relevant release-train, security-contract, provider-binding, and SLSA tests
- production release runbook, governance, environment setup, SLSA/readiness, and stabilization ledger documents

The implementation plan may split this surface into reviewed tasks, but it must not reduce any validation, evidence, propagation, receipt, rollback, cleanup, or test requirement in this design.
