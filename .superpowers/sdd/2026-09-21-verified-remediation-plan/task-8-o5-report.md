# Task 8 O5: bounded similar-professional query and license wording

## Scope and source identity

Task 18's accepted runtime work (`7d290881`) and test/report repair (`2ec0220cb`) preceded this task. O5 began from clean parent `da048db9f2465858ec21048fd941e326a13eafd4`. The exact committed implementation measured below is `4ed2fb87e2bbe1f70461807e0ebf757db3618aec`; the worktree was clean before the after probe. The earlier 2026-09-21 baseline is immutable and predates intervening remediation commits.

The saved original probe was copied byte-identically to ignored `overfetch-probe-original-o5.mjs` before adaptation: 7,379 bytes, SHA-256 `6aad7dbe7ac5c4bd36d8dcbf40c91c7d1f6974ee8ec0559f5c407f44011b4c46`. Its saved `overfetch-probe-results.json` remains unchanged at SHA-256 `7a72da0d8c92253d20639209ca5418f8318f30e08c4346d24e7064e52dbc9d97`. The saved baseline actual hook source hash is `fe7c12d618bd4e2330b16d2da48e7dabe3ddda6b51fdf8fb07273eb26b8bf780`. The after hook hash is `3d7ccb700975bea5a9943653e0af19749243d8886d84f04e04ed70451d04d6b8`; the after profile component hash is `cd6ea18572b05d3807a91c358665330481583afb4aaa45d0cbc0ab8eae5c0295`.

The public related query is keyed by current category and profile ID, disabled until both are loaded, and uses `public_professionals` with exactly `id, display_name, avatar_url, city`. It filters to the same category, excludes the current ID, orders by subscription tier descending/nulls last, rating descending/nulls last, then ID ascending, and caps at three. The profile no longer starts the broad directory query. It renders peers, pending, error, and true empty states separately. Public access, the three-peer limit for every visitor, and profile contact, booking, review, and independent identity-verification behavior remain intact. No incomplete directory cache seed or new entitlement window was added. A supplied license number now appears as **License number provided** with the number; `verified: false` still says **Pending Verification** and cannot display the former **Licensed Professional** claim.

## Actual-source controlled measurement

The ignored adapted O5-only probe is SHA-256 `fbdbb895f9d8215baffe03d2e91eea6391cf0bcf1e8d28b092d1a52d5f6eb75b`. The unique after result is `task-8-o5-after-4ed2fb87-attempt-1.json`, SHA-256 `e5dce218a042352d290e350c478af103641fbf27442804c7129e7259c625655f`. The probe ran under Node `v20.20.2`, TypeScript `5.8.3`, React Query `5.101.2`, with actual TypeScript-transpiled hook query functions, the installed QueryClient, unchanged 0/100/1,000 fixture generator, 15 ms fake transport per request, and zero external requests, unexpected imports, or mutations. It verified the committed projection, filters, orders, cap, disabled-before-profile behavior, and two actual requests. Source hashes also recorded: query cache policy `69f3595c1c788ae98322af242fe97c020542983537df1f754bc18b9196b69722`, `package.json` `ee619f98b5a05d4e9d9de2b6c72e2c5378495a379038fcef44612c91de2b5154`, and frozen `package-lock.json` `e6479d80e1f3f45d84831e22d6573e260d0bbfde04f59ca1fde9f50dce12cefc`.

| Additional profiles | Baseline detail + broad bytes | After detail + related bytes | Total reduction | Requests before/after | Related rows |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 1,095 + 1,097 = 2,192 | 1,095 + 2 = 1,097 | 1,095 | 2 / 2 | 0 |
| 100 | 1,095 + 110,390 = 111,485 | 1,095 + 394 = 1,489 | 109,996 | 2 / 2 | 3 |
| 1,000 | 1,095 + 1,097,919 = 1,099,014 | 1,095 + 403 = 1,498 | 1,097,516 | 2 / 2 | 3 |

The after related bytes are actual serialization, including `403` rather than the saved `385`-byte modeled alternative at 1,000 profiles because stable ID ordering chooses different fixture IDs. The response width and three-row cap keep bytes bounded across these fixtures.

| Additional profiles | After detail duration | Category available to related settlement | Detail start to panel settlement | Baseline parallel wall time |
| ---: | ---: | ---: | ---: | ---: |
| 0 | 28.17 ms | 15.46 ms | 45.21 ms | 30.86 ms |
| 100 | 17.94 ms | 16.46 ms | 34.69 ms | 23.09 ms |
| 1,000 | 16.57 ms | 30.84 ms | 47.80 ms | 32.25 ms |

The baseline broad request began independently of the detail request. The new related request waits for the category and adds a dependent round trip; 1,000-row fake sorting also affects the measured after duration. Raw Windows scheduling differences are not production latency or a faster-panel claim. This probe does not measure browser rendering, hosted traffic, HTTP overhead, compression, cache hit rates, or production row counts.

## Verification and review

- Hook tests first failed because `useRelatedProfessionals` was absent; profile tests first failed because the old component still called `useProfessionals`. After implementation, the four relevant test files passed together: **122 tests** (`useProfessionals`, `ProfessionalProfile.branchCoverage`, `pages.smoke`, `pricing-dashboard-auction-specific`). These cover disabled loading, query shape and key change, success/empty/error, profile rendering, and unverified self-supplied license wording.
- `npm run typecheck` passed; direct ESLint on the six changed source/test files passed; `git diff --check` passed. The repository-wide lint script scanned ignored saved audit sources and failed on 20 errors there; its output included no O5-file errors. No full suite or build was run.
- An exploratory five-file test run passed four files but found one out-of-scope failure in `src/test/components.test.tsx:494`: `PropertyAIInsightsSection > does not show a fake 0% vs-market value when the benchmark is unavailable` uses `getByText(/Unavailable/i)` where the rendered view has multiple matches. The same single case failed when rerun without any O5 change to that file; its exact output is retained in ignored `task-8-o5-unrelated-components-attempt-1.log`. This is an unchanged-source ambiguity, not evidence of an O5 regression or proof that it failed on the base commit. The unrelated test was not edited.
- Self-review checked that the existing broad `useProfessionals` export and other profile actions remain, the new key is public and scoped, no management fields enter the related response, the three-peer public rule remains, and pending/error cannot be mistaken for no peers.

Implementation commit: `4ed2fb87e2bbe1f70461807e0ebf757db3618aec`. This report is a follow-up evidence commit. Raw probe files and logs remain ignored and inspectable locally; the baseline results and O6 rows were not overwritten.
