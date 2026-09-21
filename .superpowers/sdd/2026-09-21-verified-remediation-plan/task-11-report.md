# Task 11 report — remove proven duplicate CI work

## Outcome

Changed only the CI command ownership that the completed cost audit proved redundant:

- Removed the `quality` job's standalone `npm test` pass. The retained `npm run test:coverage` command invokes the same Vitest suite with coverage and enforces the existing coverage thresholds. The separate `npm run test:catalogue-hotfix` gate remains because those contracts are excluded from the Vitest suite.
- Removed the `e2e` job's standalone `npm run build` step. The retained `npm run test:perf` command builds the app before its performance specifications, and the later placeholder smoke/auth Playwright gate consumes that resulting build.
- Kept the existing 4 GB `NODE_OPTIONS` setting and its rationale on the retained coverage step.

No staging or production workflow changed. Artifact creation and integrity, provenance, permissions, release safety, coverage thresholds, catalogue contracts, performance tests, and smoke/auth tests remain in place.

## Contract coverage

Added `src/test/ciCostWorkflow.test.ts` to verify meaningful command ownership across the workflow, package scripts, and their command runners:

- coverage is the single full Vitest owner in `quality`, while the excluded catalogue contract gate remains;
- the performance runner is the single E2E build owner, and it runs before the smoke/auth consumer.

The contract was observed RED before the workflow edit:

- the quality assertion found one standalone `npm test` command;
- the E2E assertion found one standalone `npm run build` command.

After the workflow edit, the focused contract passed.

## Verification

Final focused command:

```text
node scripts/project-runtime.mjs -- node node_modules/vitest/vitest.mjs run src/test/ciCostWorkflow.test.ts src/test/ciLiveSecurityWorkflow.test.ts src/test/supabaseIndexStatsWorkflow.test.ts scripts/run-performance-tests.test.mjs
```

Result: 4 test files passed, 25 tests passed, 0 failed.

Also checked the patch with `git diff --check`. Per the task boundary, no full Vitest run, coverage run, build, install, workflow dispatch, push, or provider/production operation was performed.

## Estimated effect

The completed audit estimates that these removals avoid **11.97 runner minutes per qualifying future CI run**: 11.25 minutes from the duplicate Vitest pass and 0.72 minute from the overwritten initial E2E build. This is an estimate from prior job durations, not measured post-change spend. No actual saving exists until future runs use this workflow.
