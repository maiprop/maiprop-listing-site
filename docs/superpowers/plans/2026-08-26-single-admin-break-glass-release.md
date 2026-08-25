# Single-Admin Break-Glass Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a short-lived, exact-SHA, single-actor release exception that lets `krenios` bootstrap providers and complete one coordinated performance release without weakening the normal two-person release path.

**Architecture:** Introduce one pure authorization validator and one pure consumption-receipt validator, then carry their signed tuples through existing Stripe, Pages, approval, mutation-lease, database, Edge, Cloudflare, rollback, and final-evidence paths. Standard releases continue through the existing actor-separation rules; break-glass is a discriminated mode whose state-changing actions are burned by immutable, signed Actions artifacts before mutation.

**Tech Stack:** Node.js 20 ESM, GitHub Actions, GitHub Actions artifacts and REST API, HMAC release-artifact bindings, Vitest/Node test runner, TypeScript workflow-contract tests, Supabase release workflows, Cloudflare Pages workflows.

**Spec:** `docs/superpowers/specs/2026-08-26-single-admin-break-glass-release-design.md`

## Global Constraints

- The normal two-person release path remains the default and must keep rejecting self-approval.
- Break-glass is valid only for repository `maiprop/maiprop-listing-site`, ref `refs/heads/main`, actor `krenios`, `workflow_dispatch`, run attempt `1`, and `github.actor == github.triggering_actor`.
- `PRODUCTION_BREAK_GLASS_RELEASE_SHA` must be lowercase full-length Git SHA and equal the dispatch SHA, checkout SHA, workflow SHA, and current `main` SHA.
- `PRODUCTION_BREAK_GLASS_INCIDENT_ID` uses `[A-Z0-9][A-Z0-9._-]{7,63}` after trim/uppercase normalization.
- `PRODUCTION_BREAK_GLASS_EXPIRES_AT` is an RFC 3339 UTC timestamp in the future and at most four hours after validation.
- Break-glass reason is 20-500 printable single-line characters; persist only its lowercase SHA-256 digest.
- The configured break-glass actor must remain present in `PRODUCTION_RELEASE_DEPLOYERS`.
- Mixed standard/break-glass inputs fail closed. Standard mode requires empty incident and reason inputs.
- Break-glass never applies to historical SHAs, reruns, direct provider deployments, or standalone recovery.
- Stripe readiness remains read-only. `pages-staging`, `pages-production`, and `production-deploy` each require a unique signed consumption receipt before mutation.
- Once uploaded, a consumption receipt burns its action even if a later step fails or rolls back. Retrying a burned action requires a new incident ID and expiry.
- Never log or persist the plaintext reason, provider secrets, release signing key, user access token, or Stripe restricted key.
- Preserve exact-SHA CI/staging evidence, immutable source archival, provider isolation, release-enabled gates at coordinated deployment time, leases, N-1 checks, health verification, and automatic rollback.
- Every behavior change follows strict TDD: add one behavioral test, run it RED for the intended missing behavior, implement minimally, and rerun GREEN before proceeding.
- All repository commands use the pinned runtime prefix `npm run runtime --`.
- The operational incident ID for this release is `PERF-BOOTSTRAP-20260826-01`.
- The exact operational reason is held only in operator memory during dispatch and must hash identically across Stripe, Pages, approval, and deployment runs.

---

### Task 1: Add the central release-authorization validator

**Files:**

- Create: `scripts/production-break-glass-validation.mjs`
- Create: `scripts/production-break-glass-validation.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Produces:

```js
export const RELEASE_AUTHORIZATION_ACTIONS = Object.freeze([
  "stripe-readiness",
  "pages-staging",
  "pages-production",
  "production-approval",
  "production-deploy",
]);

export function selectReleaseAuthorization(input, options = {}) {}
export function validateReleaseAuthorization(record, expected, options = {}) {}
export function releaseAuthorizationGrant(record) {}
export function validateReleaseAuthorizationGrant(records) {}
export function releaseAuthorizationSha256(record) {}
export function releaseAuthorizationGrantSha256(record) {}
export function releaseAuthorizationReasonSha256(reason) {}
export function breakGlassConfirmation(action, releaseSha, incidentId) {}
```

- `selectReleaseAuthorization` returns a frozen standard record or the exact break-glass record defined by the spec.
- `releaseAuthorizationGrant` returns `{ mode: "standard" }` for standard evidence. For break-glass it returns mode, actor, release SHA, incident ID, reason hash, and authorization expiry while intentionally excluding action and workflow run identity.
- `validateReleaseAuthorizationGrant` requires every record to use one mode and every break-glass grant field to match while allowing each signed workflow to retain its own action and run identity.
- Authorization hashes use recursively key-sorted canonical JSON encoded as UTF-8, then lowercase SHA-256. Tests use fixed literal digests rather than the implementation helper to derive expectations.
- The CLI command `validate-workflow` reads values from environment variables, writes normalized JSON to `--out`, and writes only non-sensitive scalar fields to the optional `--github-output` path.
- Later tasks consume `release-authorization.json`; no workflow implements its own parsing, expiry, incident, reason, confirmation, or cross-workflow grant logic.

- [ ] **Step 1: Write the failing pure-validator tests**

Add table-driven tests with literal expected values for all five exact confirmations:

```js
const sha = "0123456789abcdef0123456789abcdef01234567";
const incidentId = "PERF-BOOTSTRAP-20260826-01";

assert.equal(
  breakGlassConfirmation("production-deploy", sha, incidentId),
  `DEPLOY_PRODUCTION_BREAK_GLASS ${sha} ${incidentId}`,
);
```

Cover valid standard and break-glass records plus rejection of wrong actor, substituted triggering actor, actor absent from deployers, wrong repository/ref/event, attempt 2, uppercase/malformed/mismatched SHA, malformed/mismatched incident, short/multiline reason, changed reason hash, missing/expired/invalid/five-hour expiry, generic/wrong-action/whitespace-altered confirmations, and mixed-mode inputs. Add grant tests proving action/run differences are allowed while actor/SHA/incident/reason-hash/expiry differences fail, plus fixed canonical authorization and grant SHA-256 assertions.

- [ ] **Step 2: Run the tests and confirm RED**

```powershell
npm run runtime -- node --test scripts/production-break-glass-validation.test.mjs
```

Expected: failure because `production-break-glass-validation.mjs` does not exist.

- [ ] **Step 3: Implement the pure validator**

Use exact discriminated records:

```js
// standard
{
  mode: "standard",
  action,
  actor,
  release_sha: releaseSha,
  workflow_run_id: runId,
  workflow_run_attempt: "1"
}

// break_glass
{
  mode: "break_glass",
  action,
  actor: "krenios",
  release_sha: releaseSha,
  incident_id: incidentId,
  reason_sha256: createHash("sha256").update(trimmedReason, "utf8").digest("hex"),
  authorized_expires_at: expiresAt.toISOString(),
  workflow_run_id: runId,
  workflow_run_attempt: "1"
}
```

Use strict equality and explicit regular expressions. Parse the boolean as the literal strings `true` or `false`; reject all other values. Freeze returned records so callers cannot mutate a validated tuple.

- [ ] **Step 4: Add the environment-only CLI**

`validate-workflow` requires these environment names:

```text
RELEASE_AUTHORIZATION_ACTION
RELEASE_STANDARD_CONFIRMATION
RELEASE_SINGLE_ADMIN_BREAK_GLASS
RELEASE_INCIDENT_ID
RELEASE_REASON
RELEASE_CONFIRM
RELEASE_SHA
RELEASE_CURRENT_MAIN_SHA
RELEASE_CHECKOUT_SHA
GITHUB_REPOSITORY
GITHUB_REF
GITHUB_EVENT_NAME
GITHUB_ACTOR
GITHUB_TRIGGERING_ACTOR
GITHUB_RUN_ID
GITHUB_RUN_ATTEMPT
GITHUB_WORKFLOW_SHA
PRODUCTION_RELEASE_DEPLOYERS
PRODUCTION_BREAK_GLASS_ACTOR
PRODUCTION_BREAK_GLASS_RELEASE_SHA
PRODUCTION_BREAK_GLASS_INCIDENT_ID
PRODUCTION_BREAK_GLASS_EXPIRES_AT
```

The CLI must never print `RELEASE_REASON`. Its success output is the JSON file plus `mode`, `action`, `reason_sha256`, and `authorized_expires_at` outputs.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm run runtime -- node --test scripts/production-break-glass-validation.test.mjs
npm run runtime -- npm run lint
git add scripts/production-break-glass-validation.mjs scripts/production-break-glass-validation.test.mjs package.json
git commit -m "feat: validate exact-sha break-glass authorization"
```

---

### Task 2: Version production approval and mutation evidence

**Files:**

- Modify: `scripts/production-release-validation.mjs`
- Modify: `scripts/production-release-validation.test.mjs`

**Interfaces:**

- Consumes: `validateReleaseAuthorization` from Task 1.
- Produces:

```js
export function validateReleaseApproval({
  approval,
  sha,
  repository,
  sourceTree,
  sourceRunId,
  sourceRunAttempt,
  artifactSha256,
  stagingRunId,
  stagingRunAttempt,
  approvalRunId,
  approvalRunAttempt,
  deployActor,
  allowedApprovers,
  expectedAuthorization,
  now,
}) {}

export function validateMutationLease({
  lease,
  sha,
  repository,
  sourceTree,
  artifactSha256,
  approvalNonce,
  expectedAuthorization,
  expectedConsumption,
  now,
  ...existingRunBindings
}) {}
```

- Schema-version-1 approvals are standard-only and keep every existing independent-actor check.
- Schema-version-2 approvals contain `authorization` and use the exact validation branch specified below.
- Schema-version-2 mutation leases are standard-only. Schema-version-3 leases contain `authorization` and `consumption`.

- [ ] **Step 1: Add failing approval-schema tests**

Add literal fixtures proving:

- version 1 standard approvals still pass with different approver/deployer and fail for self-approval;
- version 1 can never be interpreted as break-glass;
- version 2 standard approvals preserve allowlist and independent actor checks;
- version 2 break-glass permits `approver == deployActor == krenios` only when its authorization equals `expectedAuthorization`;
- unknown mode, extra authorization keys, wrong action, actor, SHA, incident, reason hash, expiry, run ID, or attempt fails;
- approval expiry is `min(approved_at + 2h, authorized_expires_at)` and both boundaries are exclusive at expiration.

- [ ] **Step 2: Run the approval tests and confirm RED**

```powershell
npm run runtime -- npm test -- scripts/production-release-validation.test.mjs -t "authorization mode" --maxWorkers=1 --reporter=verbose
```

Expected: failures because schema 2 and `expectedAuthorization` are unsupported.

- [ ] **Step 3: Implement approval schema 2 minimally**

The exact new approval shape is:

```js
{
  schema_version: 2,
  repository,
  release_sha: releaseSha,
  source_tree: sourceTree,
  source_run_id: sourceRunId,
  source_run_attempt: sourceRunAttempt,
  artifact_sha256: artifactSha256,
  staging_run_id: stagingRunId,
  staging_run_attempt: stagingRunAttempt,
  approval_run_id: approvalRunId,
  approval_run_attempt: approvalRunAttempt,
  approver,
  nonce,
  revoked: false,
  approved_at: approvedAt,
  expires_at: expiresAt,
  authorization
}
```

Break-glass waives only approver allowlist membership and actor inequality. Every other existing approval field and time validation remains.

- [ ] **Step 4: Add failing lease-schema tests**

Prove schema 3 requires exact nested authorization and consumption tuples; changing one receipt ID/digest/hash/action/parent run fails. Prove schema 2 remains valid only when `expectedAuthorization.mode == "standard"` and `expectedConsumption` is absent.

- [ ] **Step 5: Implement lease schema 3 and CLI flags**

Add `--authorization-file` and `--consumption-file` to `release-approval` and `mutation-lease` commands. Parse files as JSON and pass them as `expectedAuthorization` and `expectedConsumption`; never accept equivalent loose shell fields as a substitute.

- [ ] **Step 6: Verify GREEN and commit**

```powershell
npm run runtime -- npm test -- scripts/production-release-validation.test.mjs --maxWorkers=1 --reporter=dot
npm run runtime -- npm run lint
git add scripts/production-release-validation.mjs scripts/production-release-validation.test.mjs
git commit -m "feat: bind release evidence to authorization mode"
```

---

### Task 3: Add immutable one-shot consumption receipts

**Files:**

- Create: `scripts/production-break-glass-consumption.mjs`
- Create: `scripts/production-break-glass-consumption.test.mjs`
- Modify: `package.json`

**Interfaces:**

- Consumes: a validated break-glass authorization record from Task 1.
- Produces:

```js
export function consumptionArtifactName({ action, releaseSha, incidentId }) {}
export function createConsumptionReceipt({ authorization, repository, workflowRef, workflowSha, runId, runAttempt, consumedAt, nonce }) {}
export function validateConsumptionReceipt(receipt, expected, options = {}) {}
export function consumptionTuple({ receipt, payloadArtifact, bindingArtifact, payloadSha256 }) {}
```

- The CLI supports `create --authorization release-authorization.json --out production-break-glass-consumption.json` and `verify --file production-break-glass-consumption.json --authorization release-authorization.json --action pages-staging`.
- GitHub API lookup/upload remains in workflows; this module owns naming, payload, tuple shape, and validation.

- [ ] **Step 1: Write failing receipt behavior tests**

Use hand-derived fixtures to verify exact names for all three state-changing actions, reject Stripe/approval actions, create a version-1 receipt with the trusted run tuple, and reject wrong action/SHA/incident/actor/repository/workflow/run/attempt/nonce/time.

The exact name assertion is:

```js
assert.equal(
  consumptionArtifactName({
    action: "production-deploy",
    releaseSha: "0123456789abcdef0123456789abcdef01234567",
    incidentId: "PERF-BOOTSTRAP-20260826-01",
  }),
  "production-break-glass-consumed-production-deploy-0123456789abcdef0123456789abcdef01234567-PERF-BOOTSTRAP-20260826-01",
);
```

- [ ] **Step 2: Run tests and confirm RED**

```powershell
npm run runtime -- node --test scripts/production-break-glass-consumption.test.mjs
```

Expected: failure because the receipt module does not exist.

- [ ] **Step 3: Implement receipt creation and validation**

The payload is exact:

```js
{
  schema_version: 1,
  evidence_type: "maiprop-production-break-glass-consumption",
  repository,
  workflow_ref: workflowRef,
  workflow_sha: workflowSha,
  workflow_run_id: runId,
  workflow_run_attempt: "1",
  consumed_at: consumedAt,
  nonce,
  authorization
}
```

Require a 64-lowercase-hex nonce and `consumed_at < authorized_expires_at`. The tuple contains payload artifact ID/digest, binding artifact ID, payload SHA-256, action, incident, release SHA, and parent run.

- [ ] **Step 4: Verify GREEN and commit**

```powershell
npm run runtime -- node --test scripts/production-break-glass-consumption.test.mjs
npm run runtime -- npm run lint
git add scripts/production-break-glass-consumption.mjs scripts/production-break-glass-consumption.test.mjs package.json
git commit -m "feat: create one-shot release consumption receipts"
```

---

### Task 4: Integrate break-glass into Stripe and Pages bootstrap workflows

**Files:**

- Modify: `.github/workflows/verify-stripe-live-readiness.yml`
- Modify: `.github/workflows/provision-cloudflare-pages-runtime.yml`
- Modify: `scripts/stripe-live-readiness-workflow.test.mjs`
- Modify: `scripts/provision-cloudflare-pages-runtime.test.mjs`
- Modify: `src/test/productionProviderBindingWorkflow.test.ts`

**Interfaces:**

- Consumes: Task 1 authorization file and Task 3 receipt module.
- Produces signed Stripe authorization evidence and signed Pages authorization/consumption evidence.
- Artifact names remain attempt-qualified for Stripe. Pages payload and binding names become attempt-qualified:

```text
cloudflare-pages-runtime-${target}-${releaseSha}-${runId}-${runAttempt}
cloudflare-pages-runtime-${target}-${releaseSha}-${runId}-${runAttempt}-binding
```

- [ ] **Step 1: Add failing Stripe workflow tests**

Parse the workflow and execute the validator fixture used by the contract tests. Assert typed inputs `single_admin_break_glass`, `incident_id`, and `reason`; central validation before Stripe secret use; standard allowlist preserved; normalized authorization merged into `stripe-live-migration-evidence.json`; existing signed binding covers the modified payload; plaintext reason absent from generated evidence and summaries.

- [ ] **Step 2: Run Stripe tests and confirm RED**

```powershell
npm run runtime -- node --test scripts/stripe-live-readiness-workflow.test.mjs
```

Expected: failures for missing dispatch inputs and authorization evidence.

- [ ] **Step 3: Implement Stripe mode selection**

Add the three dispatch inputs and run `validate-workflow` after exact checkout identity but before `STRIPE_RESTRICTED_KEY` is placed in a step environment. Use action `stripe-readiness` and standard confirmation `VERIFY_STRIPE_LIVE_READINESS`. Merge authorization with `jq --slurpfile authorization release-authorization.json '. + {authorization: $authorization[0]}'` and rerun the existing Stripe evidence verifier before upload.

- [ ] **Step 4: Add failing Pages workflow and replay tests**

Assert both targets call the central validator with their action, keep provider credential-isolation and fixed project/account checks, permit break-glass while release-enabled variables are false, and preserve the variables in standard mode. Assert provider mutation cannot run until receipt precheck, receipt upload, signed binding, and post-upload uniqueness verification pass.

Simulate repository artifact listings with zero, one, duplicate, expired, and wrong-ID matches. One existing exact-name match must block mutation.

- [ ] **Step 5: Implement Pages receipts and signed evidence**

Each Pages job checks out the exact release and runs the central validator before a step receives provider credentials. Before `Provision strict Cloudflare Pages runtime bindings` mutates anything in break-glass mode:

```bash
receipt_name="$(node scripts/production-break-glass-consumption.mjs name \
  --authorization release-authorization.json)"
gh api "repos/${GITHUB_REPOSITORY}/actions/artifacts?name=${receipt_name}&per_page=100" \
  > receipt-precheck.json
jq -e '.total_count == 0' receipt-precheck.json > /dev/null
```

Create/upload the receipt with `overwrite: false`, retention seven days, create and same-run verify its signed binding, then query again and require exactly one matching ID/digest before provider mutation. Add authorization and consumption to the minimized Pages result, upload it with 30-day retention, and create/verify its signed binding with the existing release signing key.

- [ ] **Step 6: Verify GREEN and commit**

```powershell
npm run runtime -- node --test scripts/stripe-live-readiness-workflow.test.mjs scripts/provision-cloudflare-pages-runtime.test.mjs
npm run runtime -- npm test -- src/test/productionProviderBindingWorkflow.test.ts --maxWorkers=1 --reporter=dot
npm run runtime -- npm run check:release-safety
npm run runtime -- npm run lint
git add .github/workflows/verify-stripe-live-readiness.yml .github/workflows/provision-cloudflare-pages-runtime.yml scripts/stripe-live-readiness-workflow.test.mjs scripts/provision-cloudflare-pages-runtime.test.mjs src/test/productionProviderBindingWorkflow.test.ts
git commit -m "feat: authorize signed provider bootstrap break-glass"
```

---

### Task 5: Integrate approval and coordinated production deployment

**Files:**

- Modify: `.github/workflows/approve-production-release.yml`
- Modify: `.github/workflows/deploy-production-release.yml`
- Modify: `.github/workflows/deploy-supabase-production-db.yml`
- Modify: `.github/workflows/deploy-edge-functions.yml`
- Modify: `.github/workflows/reusable-cloudflare-production-deploy.yml`
- Modify: `scripts/production-release-train.test.mjs`
- Modify: `scripts/github-free-production-release.test.mjs`
- Modify: `src/test/ciLiveSecurityWorkflow.test.ts`
- Modify: `src/test/directProductionDeployWorkflow.test.ts`

**Interfaces:**

- Consumes signed Stripe and both Pages proofs from Task 4, approval/lease schema validation from Task 2, and receipts from Task 3.
- Produces a schema-version-2 approval; production-deploy consumption tuple; schema-version-3 database, Edge, and Cloudflare leases; signed attestations carrying authorization/consumption hashes; and final aggregate proof.
- Reusable workflows receive explicit string inputs for authorization mode, authorization artifact/run identity, consumption payload artifact/binding identity, and their SHA-256 values. They do not infer mode from actor equality.

- [ ] **Step 1: Add failing approval workflow tests**

Prove standard mode still requires `APPROVE_PRODUCTION_RELEASE`, an allowlisted approver, and independence from source/staging actors. Prove break-glass requires the exact central `production-approval` validation and permits only `krenios`. Prove the produced approval is schema 2, contains the full authorization, expires at the earlier deadline, and remains covered by the existing signed artifact binding.

- [ ] **Step 2: Run approval tests and confirm RED**

```powershell
npm run runtime -- node --test scripts/production-release-train.test.mjs --test-name-pattern "break-glass approval"
```

Expected: failures for missing mode inputs and schema-version-2 payload.

- [ ] **Step 3: Implement production approval**

Add typed mode/incident/reason inputs. Keep a broad job guard limited to main, attempt 1, and actor equality; run the authoritative validator inside the job after checkout. Standard mode executes the current allowlist/independence steps. Break-glass mode requires exact action authorization and emits the schema-version-2 record. Do not skip CI/staging artifact selection or cryptographic verification in either mode.

- [ ] **Step 4: Add failing coordinated-deployment tests**

Tests must prove:

- the dispatcher inputs include mode/incident/reason and exact action confirmation;
- standard self-approval remains rejected;
- break-glass requires matching signed Stripe, staging Pages, production Pages, and approval authorization grants while each proof retains its own action and run identity;
- `PRODUCTION_RELEASE_ENABLED == true` and deployer membership remain mandatory;
- a signed `production-deploy` consumption receipt exists before archive, database, Edge, or Cloudflare mutation;
- every mutating job depends on receipt verification;
- all reusable workflows receive identical authorization and consumption identities;
- leases renew with schema 3 without changing either tuple;
- automatic rollback receives the same tuples and may continue after authorization expiry only when forward mutation started while authorization and lease were valid;
- direct Cloudflare deployment and standalone recovery have no break-glass input or validation route.

- [ ] **Step 5: Run deployment tests and confirm RED**

```powershell
npm run runtime -- node --test scripts/production-release-train.test.mjs scripts/github-free-production-release.test.mjs
npm run runtime -- npm test -- src/test/ciLiveSecurityWorkflow.test.ts src/test/directProductionDeployWorkflow.test.ts --maxWorkers=1 --reporter=verbose
```

Expected: failures for missing receipt dependencies, tuple propagation, and break-glass validation.

- [ ] **Step 6: Implement deploy authorization and receipt job**

At the start of `validate`, create `release-authorization.json`. Select and cryptographically verify signed Stripe, both Pages, and approval artifacts, validate each artifact against its own expected action/run context, then require cross-workflow grant equivalence with `validateReleaseAuthorizationGrant`. For standard mode, require standard evidence and existing separation. For break-glass, require the shared actor/SHA/incident/reason-hash/expiry grant and an unexpired `production-deploy` authorization.

Add a `consume-break-glass-authorization` job after `validate` and before `archive-production-source`. Standard mode writes a sentinel `{ "mode": "standard" }` output without a receipt. Break-glass performs the exact precheck/upload/bind/postcheck sequence and exposes:

```text
authorization_mode
authorization_sha256
consumption_artifact_id
consumption_artifact_digest
consumption_binding_artifact_id
consumption_payload_sha256
```

Every mutating job adds `consume-break-glass-authorization` to `needs` and requires its success.

- [ ] **Step 7: Propagate through leases and reusable workflows**

Update each `workflow_call` contract and caller. Each reusable workflow downloads the exact approval, authorization, receipt, and binding artifacts, verifies their HMAC binding and parent production run, validates the current lease, and checks authorization expiry before forward mutation.

New leases use:

```js
{
  schema_version: 3,
  ...existingLeaseFields,
  authorization,
  consumption
}
```

Database, Edge, Cloudflare, and aggregate attestations add `authorization_sha256` and `consumption_sha256`. Automatic rollback checks the forward mutation timestamp against authorization/lease expiry rather than requiring authorization still to be live after a failed mutation.

- [ ] **Step 8: Verify GREEN and commit**

```powershell
npm run runtime -- node --test scripts/production-release-train.test.mjs scripts/github-free-production-release.test.mjs
npm run runtime -- npm test -- src/test/ciLiveSecurityWorkflow.test.ts src/test/directProductionDeployWorkflow.test.ts --maxWorkers=1 --reporter=dot
npm run runtime -- npm run check:release-safety
npm run runtime -- npm run check:slsa-readiness
npm run runtime -- npm run lint
git add .github/workflows/approve-production-release.yml .github/workflows/deploy-production-release.yml .github/workflows/deploy-supabase-production-db.yml .github/workflows/deploy-edge-functions.yml .github/workflows/reusable-cloudflare-production-deploy.yml scripts/production-release-train.test.mjs scripts/github-free-production-release.test.mjs src/test/ciLiveSecurityWorkflow.test.ts src/test/directProductionDeployWorkflow.test.ts
git commit -m "feat: consume single-admin production authorization"
```

---

### Task 6: Harden cross-workflow contracts and operator documentation

**Files:**

- Modify: `src/test/productionProviderBindingWorkflow.test.ts`
- Modify: `scripts/check-slsa-readiness.mjs`
- Modify: `scripts/check-slsa-readiness.test.mjs`
- Modify: `docs/PRODUCTION_RELEASE_RUNBOOK.md`
- Modify: `docs/ENV_SETUP.md`
- Modify: `docs/compliance/SLSA_PROVENANCE.md`
- Modify: `docs/superpowers/plans/2026-08-25-production-performance-stabilization.md`

**Interfaces:**

- Consumes all workflow and evidence surfaces from Tasks 1-5.
- Produces executable security-contract coverage and the exact operational sequence for this incident.

- [ ] **Step 1: Add failing end-to-end contract tests**

Use parsed workflow documents and controlled evidence fixtures to prove all of these rejection cases:

```text
wrong actor
wrong triggering actor
wrong current-main/workflow/checkout SHA
wrong incident
changed reason hash
expired authorization
run attempt greater than 1
standard/break-glass evidence mixing
tampered approval authorization
missing Pages proof
existing consumption receipt
wrong receipt action or parent run
missing receipt binding
changed tuple during lease renewal
direct reusable workflow invocation
standalone recovery break-glass input
```

The tests exercise validators and parsed workflow dependencies; they must not merely search source text for a phrase.

- [ ] **Step 2: Run contract tests and confirm RED**

```powershell
npm run runtime -- npm test -- src/test/productionProviderBindingWorkflow.test.ts --maxWorkers=1 --reporter=verbose
npm run runtime -- node --test scripts/check-slsa-readiness.test.mjs
```

Expected: failures for at least the new authorization/receipt SLSA requirements.

- [ ] **Step 3: Extend readiness validation**

Require signed authorization and consumption hashes in break-glass production evidence, reject them from direct recovery, and keep standard provenance requirements unchanged. The readiness output identifies mode and incident but never reason plaintext.

- [ ] **Step 4: Document the exact operating sequence**

Document these repository variables and deletion order:

```text
PRODUCTION_BREAK_GLASS_ACTOR=krenios
PRODUCTION_BREAK_GLASS_RELEASE_SHA=the lowercase SHA resolved from remote main in Task 7
PRODUCTION_BREAK_GLASS_INCIDENT_ID=PERF-BOOTSTRAP-20260826-01
PRODUCTION_BREAK_GLASS_EXPIRES_AT=the fresh RFC 3339 UTC timestamp computed immediately before dispatch in Task 7
```

The runbook states the five action confirmations, reason-hash equality rule, receipt burn semantics, new-incident retry rule, exclusion of direct recovery, signed artifact names/retention, and mandatory deletion of all four variables after final proof. Update the performance plan so its Release A approval/deploy steps point to this temporary approved procedure while the normal path remains authoritative after cleanup.

- [ ] **Step 5: Verify GREEN and commit**

```powershell
npm run runtime -- npm test -- src/test/productionProviderBindingWorkflow.test.ts --maxWorkers=1 --reporter=dot
npm run runtime -- node --test scripts/check-slsa-readiness.test.mjs
npm run runtime -- npm run check:slsa-readiness
npm run runtime -- npm run check:release-safety
git add src/test/productionProviderBindingWorkflow.test.ts scripts/check-slsa-readiness.mjs scripts/check-slsa-readiness.test.mjs docs/PRODUCTION_RELEASE_RUNBOOK.md docs/ENV_SETUP.md docs/compliance/SLSA_PROVENANCE.md docs/superpowers/plans/2026-08-25-production-performance-stabilization.md
git commit -m "docs: govern single-admin release bootstrap"
```

---

### Task 7: Verify, merge, release, and remeasure

**Files:**

- Verify all files changed by Tasks 1-6.
- Update: `.superpowers/sdd/2026-08-25-production-performance-stabilization/progress.md`
- Update: `.superpowers/sdd/2026-08-25-production-performance-stabilization/task-1-report.md`
- Generated workflow and live-performance evidence remain in immutable GitHub artifacts, not committed source files.

**Interfaces:**

- Consumes a reviewed green branch, the provider secrets already configured, and the live critical-flow performance plan.
- Produces an exact merged `main` SHA, one cleaned-up break-glass release, live identity proof, before/after timings, and continuation decisions for performance Tasks 3-12.

- [ ] **Step 1: Run deterministic repository verification**

```powershell
npm run runtime -- node --test scripts/production-break-glass-validation.test.mjs scripts/production-break-glass-consumption.test.mjs scripts/production-release-validation.test.mjs scripts/stripe-live-readiness-workflow.test.mjs scripts/provision-cloudflare-pages-runtime.test.mjs scripts/production-release-train.test.mjs scripts/github-free-production-release.test.mjs scripts/check-slsa-readiness.test.mjs
npm run runtime -- npm test -- --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
npm run runtime -- npm run typecheck:functions
npm run runtime -- npm run test:deno
npm run runtime -- npm run lint
npm run runtime -- npm run build
npm run runtime -- npm run check:bundle-size
npm run runtime -- npm run lint:migrations
npm run runtime -- npm run check:release-safety
npm run runtime -- npm run check:slsa-readiness
npm run runtime -- npm run check:perf-proof
```

Require zero test failures, type errors, lint errors, build errors, release-safety errors, SLSA errors, or performance-proof contract errors.

- [ ] **Step 2: Complete task-scoped and whole-branch reviews**

Review every task diff for spec compliance and code quality, then review the complete range from `a995b1e78c0624215df4c619491e6e03665460f9` through branch HEAD. Resolve all Critical and Important findings and rerun the tests covering each fix.

- [ ] **Step 3: Push and merge through branch protection**

Push `codex/production-performance-stabilization`, wait for required checks, merge through the repository's normal protected path, and resolve the new full remote `main` SHA:

```powershell
$releaseSha = (git ls-remote origin refs/heads/main).Split("`t")[0]
if ($releaseSha -notmatch '^[0-9a-f]{40}$') { throw 'Remote main did not resolve to a full SHA.' }
```

Do not reuse any artifact produced for `a995b1e78c0624215df4c619491e6e03665460f9`.

- [ ] **Step 4: Configure the one-shot authorization**

Set `PRODUCTION_BREAK_GLASS_ACTOR=krenios`, `PRODUCTION_BREAK_GLASS_RELEASE_SHA=$releaseSha`, `PRODUCTION_BREAK_GLASS_INCIDENT_ID=PERF-BOOTSTRAP-20260826-01`, and a fresh UTC expiry no more than four hours away. Keep `STAGING_RELEASE_ENABLED=false` and `PRODUCTION_RELEASE_ENABLED=false` until both signed Pages proofs pass.

- [ ] **Step 5: Run provider readiness and Pages provisioning**

Dispatch attempt-1 workflows for Stripe, staging Pages, and production Pages with the same incident and exact reason. Require valid signed bindings and unique target-specific consumption receipts. After both Pages proofs pass, set `STAGING_RELEASE_ENABLED=true` and `PRODUCTION_RELEASE_ENABLED=true`.

- [ ] **Step 6: Stage, approve, and deploy the exact SHA**

Wait for exact-SHA CI, dispatch isolated staging, require its signed evidence and all performance/security/provider gates, then dispatch break-glass approval and coordinated deployment. Monitor database, Edge, Cloudflare, rollback readiness, and final aggregate. Never use direct Cloudflare recovery to continue a consumed incident.

- [ ] **Step 7: Verify live identity and remeasure every critical action**

```powershell
npm run runtime -- npm run release:verify-live-marker -- --base-url https://portal.maiprop.co --sha $releaseSha
npm run runtime -- npm run check:production-deploy -- --base-url https://portal.maiprop.co
npm run runtime -- npm run perf:live-critical -- --samples=5 --artifact-dir=artifacts/live-performance/release-a
npm run runtime -- npm run diagnose:public-listings-latency -- https://portal.maiprop.co --iterations=30 --timeout-ms=8000
```

Measure landing, explore/listings, sign-in, duplicate-account sign-up confirmation, dashboard, listing-wizard entry/steps, no-photo staging listing publication, property render, public publication lag, and sign-out. Report p50, p95, failures, cache states, request counts, deployed SHA, and before/after deltas.

- [ ] **Step 8: Remove temporary authorization and continue the performance plan**

Delete all four `PRODUCTION_BREAK_GLASS_*` variables immediately after final proof, record the steady-state release-enabled values, and verify a new break-glass dispatch fails. Update the performance ledger with workflow run IDs, attempts, artifact IDs/digests, deployed SHA, timing table, and surviving bottlenecks. Resume at Task 3 of `docs/superpowers/plans/2026-08-25-production-performance-stabilization.md`; do not implement a Release B optimization whose Release A measurement already passes.

---

## Stop conditions

- Stop before provider access when authorization validation fails.
- Stop before a Pages or production mutation when receipt precheck, upload, binding, or uniqueness verification fails.
- Stop before production when exact-SHA CI, Stripe, either Pages proof, staging, N-1 compatibility, SLSA, release safety, or approval validation fails.
- If a state-changing break-glass action fails after receipt upload, burn that action and configure a new incident before retrying.
- If `main` advances, abandon every old-SHA authorization and artifact.
- If Pages post-deploy health fails, allow only the coordinated automatic rollback bound to the same receipt and parent run.
- Never rewrite or delete an applied Supabase migration to recover a release.
