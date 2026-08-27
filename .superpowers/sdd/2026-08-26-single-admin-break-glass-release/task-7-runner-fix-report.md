# Task 7 Runner Fix Report

## Outcome

`scripts/production-release-validation.test.mjs` now registers the same 39-test suite safely under both Vitest and direct `node --test`. No production code, package configuration, or existing test body changed.

## TDD Evidence

The direct Node command reproduced the reported RED before the edit:

- Command: `npm run runtime -- node --test scripts/production-release-validation.test.mjs`
- Result: 0 passed, 1 failed, exit 1
- Failure: eager Vitest registration reached `@vitest/runner` without a Vitest runner and threw `TypeError: Cannot read properties of undefined (reading 'config')`
- Elapsed: 0.954 seconds

The minimal fix replaces the eager Vitest import with the established lazy dual-runner registration pattern. Vitest globals are selected only when `describe`, `it`, and `expect` are all functions. Otherwise, the file lazily imports `node:test` and supplies strict Node assertion adapters for only the matcher shapes already used by this suite.

## Preservation And Runner Self-Review

- Test cases before/after: 39 / 39
- Lines containing `expect(` before/after: 130 / 130
- Existing `describe` and `it` bodies changed: 0
- Direct Vitest imports remaining: 0
- Suites duplicated: 0
- Vitest path: uses the native global `describe`, `it`, and `expect`
- Node path: uses lazy `node:test` registration and the local strict assertion adapter
- Mixed/partial global path: fails over to Node because runner selection requires all three Vitest globals
- Node matcher adapter covers exactly the suite's existing matcher surface: `toBe`, `not.toBe`, `toBeTypeOf`, `toContain`, `toEqual`, `toMatch`, `toMatchObject`, and `toThrow`

## Green Verification

| Check | Result | Elapsed |
| --- | --- | ---: |
| Direct target under `node --test` | 39 passed, 0 failed, exit 0 | 1.303 s |
| Target under normal Vitest | 39 passed, 0 failed, exit 0 | 3.864 s |
| Exact Task 7 eight-file Node command | 119 passed, 0 failed, exit 0 | 4.440 s |
| Repository lint | exit 0, no lint errors | 15.786 s |
| `git diff --check` | exit 0 | n/a |

The eight-file aggregate previously represented this target as one failed file after 80 passing tests. It now executes all 39 target subtests, producing 119 passing tests and zero failures.

## Scope And Concerns

Changed files are limited to the verification harness and this requested report. The Node expectation adapter is intentionally local and narrow; adding a new matcher to this test file in the future requires adding its strict Node equivalent. No current correctness or release-blocking concern remains.

Commit subject: `test: support production validation under node runner`
