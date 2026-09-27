# Task 13 E0 focused follow-up report — 27 September 2026

Base: `3f1ee569ccdf7384ec0501a3b7657cd9dddbee0f`. Scope: the E0 attribution and inventory guards plus the Task 9 quota fixture assertion propagation. No historical coverage artifact, runtime Edge handler, import map, schema, or denominator rule was changed.

## Result

- `run-deno-edge-coverage.mjs` now derives the retained relocated identities from the import-map scopes and requires those exact normalized `SF:` identities in **behavioral** LCOV before merging inventory. The existing merge still includes every runtime manifest path, including zero-hit files, in the denominator. The guard checks identity presence, not a positive hit on every runtime file.
- The generated inventory harness records whether its import `catch` ran separately from the caught value. It rejects `throw undefined` and a rejected top-level await with `undefined`. Environment, fetch, timers, and `Deno.serve` still restore in `finally`; the attempted-transport latch still takes precedence.
- The quota handler fixture captures each reservation request payload inside mocked fetch and compares the complete array after the real handler finishes. This prevents the unavailable 503 path from swallowing a failed actor/bucket assertion through the SDK. The seven handler cases, auth/quota/provider order, and denied/unavailable provider-zero assertions remain.

## Executed failure and success proof

The new source-attribution test runs actual installed Deno test/coverage subprocesses with `--no-config --cached-only --frozen --deny-net`. Inventory imports `example/index.ts`, byte-identical `copied/index.ts`, and `unhit/index.ts`. Wrong behavior invokes only `copied/index.ts`. Official behavioral LCOV contains copied `SF:` and lacks original `SF:`; inventory contains original. Merging the wrong behavior with inventory still produces an original record, demonstrating why the former merged-set check was insufficient. The new behavioral guard rejects it, naming `supabase/functions/example/index.ts`. Correct behavior invokes the original and passes. Its merged result retains copied and unhit at zero and counts all three in `found`. A file-URL `SF:` with a zero line count also passes the identity guard after normalization.

The generated-harness test executes safe, synchronous `throw undefined`, and top-level `await Promise.reject(undefined)` modules. The two undefined imports exit nonzero; wrappers catch the rejection value as exactly `undefined` and verify fetch, timers, `Deno.serve`, and environment get/set/delete restoration. Safe import exits zero. A caught fetch followed by `throw undefined` reports `inventory transport attempted: fetch`, preserving transport precedence. The preexisting caught-fetch fixture also passes.

For the quota proof, the unavailable-case expected bucket was temporarily set to `deliberately-wrong-bucket` after moving the assertion outside fetch. This command exited 1 with **0 passed, 7 failed, 14 filtered out**; all seven failures showed the actual service bucket against the deliberately wrong expected bucket at `aiQuotaHandlers.test.ts:69`, rather than an accepted 503. The expected bucket was restored to `entry.name`; the full 21-case file then passed.

Commands and results from the checkout root:

```text
node scripts/project-runtime.mjs -- node --test --test-name-pattern="relocated|undefined" scripts/deno-edge-coverage.test.mjs
  RED, exit 1: both focused cases failed with Missing expected exception before their guards were implemented.
node scripts/project-runtime.mjs -- node --test --test-name-pattern="relocated|undefined|inventory harness" scripts/deno-edge-coverage.test.mjs
  GREEN after fixture-output adjustment, exit 0: 3 passed, 9 skipped.
& 'C:/Users/K R/.deno/bin/deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --config=supabase/functions/deno.json --import-map=supabase/functions/coverage-import-map.json --filter='unavailable quota reserves' supabase/functions/_shared/aiQuotaHandlers.test.ts
  Intentional wrong-bucket RED, exit 1: 0 passed, 7 failed, 14 filtered out; each failure was the post-handler payload mismatch.
& 'C:/Users/K R/.deno/bin/deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --config=supabase/functions/deno.json --import-map=supabase/functions/coverage-import-map.json supabase/functions/_shared/aiQuotaHandlers.test.ts
  GREEN, exit 0: 21 passed, 0 failed.
node scripts/project-runtime.mjs -- node --test scripts/deno-edge-coverage.test.mjs
  Final GREEN, exit 0: 12 passed, 0 failed.
node scripts/project-runtime.mjs -- node node_modules/eslint/bin/eslint.js --no-ignore scripts/deno-edge-coverage-lib.mjs scripts/run-deno-edge-coverage.mjs scripts/deno-edge-coverage.test.mjs
  exit 0.
node scripts/project-runtime.mjs -- node --check scripts/deno-edge-coverage-lib.mjs
node scripts/project-runtime.mjs -- node --check scripts/run-deno-edge-coverage.mjs
node scripts/project-runtime.mjs -- node --check scripts/deno-edge-coverage.test.mjs
  each exit 0.
git diff --check
  exit 0; Git printed only the checkout's LF-to-CRLF warning for aiQuotaHandlers.test.ts.
```

The actual generated Deno fixture subprocesses used the installed `C:/Users/K R/.deno/bin/deno.exe` with unique temporary paths: `test --no-config --cached-only --frozen --deny-net --coverage=<name>-raw --coverage-raw-data-only <name>.test.ts`, then `coverage --lcov --include=.*supabase[/\\]functions[/\\].*index\.ts$ --output=<name>.lcov <name>-raw`; inventory harness fixtures additionally used `--allow-env --allow-read` and `--deny-net`. Temporary roots were removed by the test helper after assertion.

Two setup failures were corrected before the final evidence: the first focused invocation had the new import in the wrong Node import block and exited on module loading; after correction, the intended RED cases executed. The first post-fix undefined assertion expected a Deno error phrase that this installed Deno reports only as `error: Test failed`; the fixture was changed to check nonzero test failure plus wrapper proof of the exact caught `undefined`, and then passed. Neither setup failure was treated as successful RED proof. The final test file was rerun after its last assertion edit.

The first commit command used a nonconventional subject and failed the repository's commit-message hook after its automatic `eslint .` hook passed. The corrected `fix:` subject committed successfully; the same automatic `eslint .` hook passed again. No full test suite, build, or coverage collection was started by these hooks.

## Retained source identities

These are the 20 original `SF:` paths derived from retained import-map scopes and now required in behavioral LCOV:

```text
supabase/functions/admin-broadcast-notification/index.ts
supabase/functions/admin-content-report-action/index.ts
supabase/functions/admin-featured-listing-action/index.ts
supabase/functions/admin-firesale-action/index.ts
supabase/functions/admin-review-invitation/index.ts
supabase/functions/agent-data-input/index.ts
supabase/functions/ai-quota-status/index.ts
supabase/functions/begin-role-switch/index.ts
supabase/functions/complete-onboarding-role/index.ts
supabase/functions/create-new-building-listing/index.ts
supabase/functions/invitation-notify/index.ts
supabase/functions/open-house-capacity/index.ts
supabase/functions/open-house-registration/index.ts
supabase/functions/owner-pro-status/index.ts
supabase/functions/process-storage-cleanup/index.ts
supabase/functions/project-management/index.ts
supabase/functions/project-unit-prices/index.ts
supabase/functions/save-professional-onboarding/index.ts
supabase/functions/submit-firesale-interest/index.ts
supabase/functions/submit-firesale-request/index.ts
```

The historical 986-case baseline was not rerun or relabeled. Current whole-project coverage floors and release readiness require the later final collection and remain unclaimed here.
