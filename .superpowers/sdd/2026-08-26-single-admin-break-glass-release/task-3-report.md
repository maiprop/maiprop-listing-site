# Task 3 report — immutable one-shot consumption receipts

Status: COMPLETE

## Scope delivered

- Added `scripts/production-break-glass-consumption.mjs` with the four required exports: `consumptionArtifactName`, `createConsumptionReceipt`, `validateConsumptionReceipt`, and `consumptionTuple`.
- Added strict state-changing action, exact payload, nested authorization, trusted run, timestamp, expiry, nonce, artifact identity, and eight-field tuple validation.
- Added `create`, `verify`, and the Task 4 plan's `name` CLI commands. The CLI uses trusted GitHub workflow environment context, creates a cryptographic 32-byte nonce, and never reads or emits the plaintext reason.
- Kept GitHub artifact API lookup, upload, binding, and replay precheck/postcheck behavior out of this module for Task 4.
- Left `package.json` unchanged because the plan's workflows invoke the module directly and no additional package script is required.

## TDD evidence

### Initial RED

Command:

```powershell
npm run runtime -- node --test scripts/production-break-glass-consumption.test.mjs
```

Result: exit 1. Node reported `ERR_MODULE_NOT_FOUND` for `scripts/production-break-glass-consumption.mjs`, the intended missing production behavior.

### Artifact-binding integration RED

After self-review aligned tuple inputs with the existing release binding verifier's `artifactId` and `artifactDigest` result shape:

```powershell
npm run runtime -- node --test --test-name-pattern "returns the exact eight-field immutable consumption tuple" scripts/production-break-glass-consumption.test.mjs
```

Result: exit 1 with `payload artifact has unsupported or missing fields`, proving the old tuple boundary rejected the established binding result shape before it was corrected.

### Exact lowercase identity mutation check

Temporarily removing exact normalized-authorization comparison caused the nested authorization test to fail on uppercase actor `KRENIOS` with `Missing expected exception`. Restoring the check returned the focused test to GREEN. This proves receipt validation does not inherit Task 1's input normalization as permission to accept a non-exact persisted actor.

### GREEN

```powershell
npm run runtime -- node --test scripts/production-break-glass-consumption.test.mjs
```

Result: 12 tests passed, 0 failed.

```powershell
npm run runtime -- node --test scripts/production-break-glass-consumption.test.mjs scripts/production-break-glass-validation.test.mjs
```

Result: 29 tests passed, 0 failed.

```powershell
npm run runtime -- npm run lint
```

Result: exit 0 with no lint errors.

## Security and contract review

- Receipt, authorization, artifact-name inputs, artifact identities, tuple inputs, and expected validation context reject missing and extra keys.
- Only `pages-staging`, `pages-production`, and `production-deploy` can be consumed.
- Authorization action, actor, SHA, incident, reason hash, expiry, run ID, and attempt are centrally revalidated and required to retain exact normalized values.
- `consumed_at` is strict RFC 3339 UTC, cannot be future-dated against supplied trusted time, and must be strictly earlier than authorization expiry; equality fails.
- Historical receipt verification requires explicit `allowHistoricalExpiry: true`; receipt creation never enables it.
- Tuple IDs are positive integer strings, hashes are exact lowercase hexadecimal, and the output has exactly the required eight fields.
- CLI failures exit nonzero before producing a receipt on invalid trusted context, and tests prove plaintext reason is absent from output and evidence.

## Concerns

None within Task 3 scope. One-shot repository replay enforcement still intentionally depends on Task 4's exact-name API precheck, immutable upload/binding, and post-upload uniqueness check.
