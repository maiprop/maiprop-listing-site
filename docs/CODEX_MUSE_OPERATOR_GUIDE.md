# Codex / Muse Operator Guide

This repository contains bounded glue for the reviewed Codex / Muse controls.
The two implementation modules retain their reviewed hashes. The CLI test
fixture uses a directory junction on Windows to avoid requiring file-symlink privileges.
This guide covers prerequisites, the focused check command, and the operator CLI.

## Roles

- Native Muse worker remains `muse-spark-1.3-contributor`.
- Supervisor remains Codex.
- `scripts/codex-muse.mjs` and `scripts/run-codex-muse-checks.mjs` do not launch
  the worker and do not replace the external protected controller.
- Route outputs are planning input only.

## Prerequisites

- Node `20.19.5` per `.node-version`, satisfying the existing contract
  `>=20.19.0 <21`.
- Python 3.9+ is an explicit prerequisite for the blackbox parent checks.
  Use `python3` on Linux/macOS and `python` on Windows.
  There is no silent skip and no automatic install.
- No new dependencies, release controls, permissions, signing, approval,
  or deployment behavior were added by this change.
- Stack remains Vite / React / TypeScript / Supabase / Cloudflare.
  No migration is supplied or required.

## Check command

Run the portable focused suite from the repository root:

```sh
npm run check:codex-muse
```

What it does:

1. Resolves the project root from `scripts/run-codex-muse-checks.mjs`
   via `import.meta.url`.
2. Spawns `process.execPath` with `--test --test-concurrency=1` and exactly
   these seven suites, in this order:
   - `scripts/codex-muse-checks/routing-tests.mjs`
   - `scripts/codex-muse-checks/github-tests.mjs`
   - `scripts/codex-muse-checks/collector-tests.mjs`
   - `scripts/codex-muse-checks/adversarial-tests.mjs`
   - `scripts/codex-muse-checks/network-tests.mjs`
   - `scripts/codex-muse-checks/final-regressions-tests.mjs`
   - `scripts/codex-muse-checks/cli-tests.mjs`
3. Sets `CANDIDATE_WORKSPACE` to the resolved root with `cwd` set to root.
   No glob is used, and fixture modules are not passed as suites.
4. Inherits `stdout`/`stderr` and fails on spawn errors, signals, timeouts,
   or nonzero child status.
5. Uses a finite Node timeout of 70 seconds.
6. Only if Node succeeds, spawns Python with:
   `-B scripts/codex-muse-checks/blackbox.py ROOT process.execPath`,
   using `python` on Windows and `python3` elsewhere, with no shell.
7. Uses a finite Python timeout of 90 seconds, preserves the parent
   optimized-interpreter refusal, and propagates failures.

Expected evidence is seven Node suites totaling 118 tests, followed by seven
trusted-parent group markers from `blackbox.py`.

CI adds one unprivileged step in the existing `quality` job, after
`Check runtime` and before `Install dependencies`:

```yaml
- name: Check Codex/Muse controls
  run: npm run check:codex-muse
```

All other `ci.yml` bytes, permissions, conditions, required jobs, release
secrets, and candidate HMAC creation are unchanged.

## Operator CLI

Dependency-free Node 20 ESM CLI:

```sh
node scripts/codex-muse.mjs route TASK.json
node scripts/codex-muse.mjs check-reported-patch TASK.json CHANGES.json
node scripts/codex-muse.mjs observe-ci REQUEST.json
```

Exact arity is enforced. Unknown commands, unknown options such as `--force`,
missing arguments, and extra arguments fail closed. Sibling implementation
imports resolve from the script URL, so the CLI works from another cwd.

Bounded input handling:

- Reads at most limit + 1 bytes from a verified regular file descriptor.
- Limit is 1048576 bytes.
- Rejects symlinks, directories, non-regular files, missing files,
  malformed JSON, excessive nesting above 64, and duplicate decoded object
  keys including escaped spellings and nested duplicates.
- A separate key-aware token walk rejects duplicate decoded keys;
  `JSON.parse` alone is not relied upon for that check.
- No `eval`, no source mutation, no banners, no production claims.
- Parse errors use generic messages and never echo input content or credentials.

Result envelope:

- Success emits exactly one JSON result line on `stdout`.
- Failure emits exactly one JSON object on `stderr` with
  `production_ready: false` and nonzero exit; `stdout` is empty.

### 1. `route TASK.json`

Calls `routeTask` from the reviewed routing module.

### 2. `check-reported-patch TASK.json CHANGES.json`

Calls `assertPatchWithinTask` from the reviewed routing module.

This validates reported diff metadata only. It is not a Git snapshot,
approval, automatic permission, or proof of actual Git diff provenance.
Admitted patches remain `within_contract_pending_review` with review required
and `production_ready: false`.

### 3. `observe-ci REQUEST.json`

Awaits `collectMaiPropCiEvidence` using the module's existing default
read-only API adapter.

There are no new options, alternate hosts, endpoints, fake provider records,
and no CLI signing, dispatch, merge, or deploy commands.

## Minimal valid task example

```json
{
  "schema_version": 1,
  "task_id": "cli-01",
  "goal": "Fix wording",
  "allowed_paths": ["docs/guides/example.md"],
  "facts": {
    "kind": "mechanical",
    "root_cause_known": true,
    "contract_complete": true,
    "security_sensitive": false,
    "schema_change": false,
    "public_api_change": false,
    "new_dependency": false,
    "production_change": false,
    "uncertainty": 0
  },
  "limits": {
    "max_files": 3,
    "max_added_lines": 100,
    "max_deleted_lines": 100,
    "max_corrections": 1
  }
}
```

Example reported-patch metadata file:

```json
[
  {
    "path": "docs/guides/example.md",
    "added_lines": 2,
    "deleted_lines": 1
  }
]
```

## Read-only GitHub request fields

`observe-ci` accepts only the reviewed request contract. All sixteen fields
are required with exact keys:

- `artifact_digest`
- `artifact_id`
- `base_sha`
- `candidate_sha256`
- `commit_sha`
- `contract_sha256`
- `expires_at`
- `issued_at`
- `nonce`
- `review_sha256`
- `run_attempt`
- `run_id`
- `schema_version`
- `task_id`
- `tree_sha`
- `workflow_blob_sha`

The digest and SHA fields must come from the reviewed contract and current
source, tree, workflow, run, and artifact metadata. Do not use convenient
guesses, placeholders, or locally invented values. The examples in this guide
do not include credentials, private keys, tokens, or signatures.

Observed results are metadata only. CI observations carry
`source_binding_verified: false`, `signature_verified: false`,
`hmac_verified_locally: false`, `mutation_authorized: false`, and
`production_ready: false`. They are not a CI authorization substitute,
merge or deployment approval, artifact-use approval, or proof of signatures,
source binding, or production readiness.

## Ownership and production gates

- Ownership is user-selected `krenios` single-owner mode.
- The existing five CI checks remain required.
- There is no second-human pull-request review gate and no bypass actors.
- Self-approval is not claimed.
- Both framework signer principal labels may be `krenios`, with distinct
  CI and review `ssh-ed25519` role-key fingerprints still needing real
  enrollment.
- Existing MaiProp production producer, approver, HMAC, and lease gates
  remain unchanged.
- No production approval or deployment is supplied by these scripts.

Full application correctness, full CI for this commit, and production
readiness require actual evidence; route and observation outputs alone do not
establish them.
