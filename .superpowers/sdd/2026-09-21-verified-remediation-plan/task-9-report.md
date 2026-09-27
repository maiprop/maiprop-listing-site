# Task 9 — verified cleanup and carry-forward repairs

Date: 27 September 2026. BASE `6fc37d3a146af8a5b39880414d56de71af927233`; implementation commit `baa3748a5e1abf2af8ae6d59249f0bade18f685f`. Sole writer after Task12a acceptance. No SQL edits, dependency changes, installs, provider calls, hosted operations, GitHub actions or deployment. Independent review remains required.

## Result and preserved functionality

- Removed orphan `src/lib/optimizeImage.ts` and its dedicated tests, and orphan `src/hooks/usePriceIndex.ts`. The latter no longer leaves static fallback values under the active ticker's cache key. Active image compression and MarketTicker remain unchanged. No measured speed improvement is claimed from these deletions.
- Removed only the three always-throwing `useRecordValuation`, `useRecordReport`, `useRecordPriorityAd` exports, unreachable invalidations and now-unused dependencies. All usage readers, purchased-credit arithmetic/runtime partition, prices and separate project-view accounting remain. Removed obsolete writer tests and the unused PropertyReportCard mock/assertion; report generation/error/lease behavior still has its real tests.
- Removed obsolete POI-derived `computeWalkScore`, its type/constants and eight computation tests. Kept walk-score label/colour helpers and ten tests, all active score presentation callers, and stored-score provenance tests. The ignored optional PropertyScoresSection prop is retained to avoid widening the cleanup.
- Removed `recordAiCall` debug-only shim and imports/calls from nine services: ai-search, smart-filters, ai-service-match, listing-ai-assist, pro-ai-tools, property-chat, property-pois, property-valuation and neighbourhood-report. Real authentication, atomic quota reservation and provider response paths remain. Removed the resulting unused valuation actor alias and stale accounting comments. Shared usage reader comments now describe reservation.
- Replaced five no-op literal inventory guards with the actual denied-quota return guard; regenerated the current public-function inventory. These static checks are NOT counted as behavior proof. New `aiQuotaHandlers.test.ts` executes seven actual handlers with actual `enforceAiQuota`/Supabase client, verified actors, auth bypass disabled, and local fetch interception. For each valid request it checks allowed/denied/unavailable reservation exactly once, exact actor/bucket arguments, paid-work order and denied/unavailable provider zero. Unexpected transport attempts are latched and fail. Existing real valuation and neighbourhood handler proofs cover the remaining two services.
- Retained AuctionBidHistory/useAuctionBidHistory and their tests. Their coordinate/radius nearby-sales panel is not equivalent to previous auction rounds in PastDealsTable; no supported replacement was proven. No endpoint or module was removed merely because its importer was absent.

Consumer proof: `task-9-preparation-current.md` and final `rg`/tracked-tree searches. Static imports, types, exports/barrels, dynamic import references and packaging were inspected. Package is private with no library entrypoint, index.html loads src/main.tsx, Vite has output chunk rules but no alternative input for deleted files; no import.meta.glob/require.context source discovery exists. Final scoped symbol search finds no removed runtime symbol references in src/functions/scripts. Historical docs/reports remain historical.

## Bounded reviewed repairs

| Finding | Repair and proof |
| --- | --- |
| Task5 chart fill | Fill closes at first/last observed x, not entire five-year axis. Recent-only and historical-only rendered SVG assertions fail against the original closure and pass after correction. Line/axis unchanged. |
| Task15 retained AI suggestions | Keep the existing unverified qualifier while retained suggestions refresh and after refresh failure. Success -> pending -> failure component test verifies both text and qualifier; existing subject-change stale-result test passes. |
| Task11 CI matcher | Test-only matcher recognizes supported npm commands with trailing arguments/multiline run blocks, ignores comments/similarly named scripts, counts exactly one performance invocation and preserves smoke ordering. No workflow modification. Two synthetic cases failed against old exact matching and passed afterward. |
| O5 component evidence | Related professional mock now supplies distinct projected four-field peers; benchmark Unavailable assertion scoped to the actual vs Market card, retaining no-fake-zero and reason assertions. The prior global ambiguous assertion was reproduced before fix. |
| O6 saved order | Each query client/actor mutation cohort retains original membership/full-view ordering. Failed removals insert using stable original ranks, preserving equal timestamps and unrelated new saves, with linear rank construction. Four real QueryClient cases cover both failure orders with/without another successful save; existing new/full hydration cancellation, all-failure overlap, actor switch and 20-heart request-count tests pass. Fetch keys/projection/counts unchanged, so no unchanged performance probe was repeated. |
| Artifact lint | Only `.superpowers/**` and `supabase/functions/coverage/**` added to ignores. ESLint API proves both ignored and current frontend/runtime Edge/test files still included. Default commit hook's full `eslint .` now passes. No coverage/runtime exclusions changed. |

The O6 original absent-membership assertion fix already existed at BASE and remains. Task5 expected-outage console polish remains nonblocking: its old test file was not edited. New quota tests capture/assert only their expected unavailable-reservation error and forward unexpected logs. No production logging changed.

## Verification and diagnostics

Final focused frontend consolidation: **15 files / 186 tests passed**. Final affected Edge suites: **11 files / 114 tests passed**, cached/frozen dependencies and network denied. Typecheck passed. Explicit changed-file lint passed; the normal code commit also ran the repository's full lint hook successfully. Inventory check and git diff whitespace check passed.

Commands (working directory is the auction-recovery worktree):

```powershell
node scripts/project-runtime.mjs -- node node_modules/vitest/vitest.mjs run src/test/NeighbourhoodReport.test.tsx src/test/PropertyMiniMap.test.tsx src/test/useFavorites.test.tsx src/test/components.test.tsx src/test/ProfessionalProfile.branchCoverage.test.tsx src/test/useUsageAddons.test.tsx src/test/PropertyReportCard.test.tsx src/test/walkScore.test.ts src/test/PropertyScoresSection.provenance.test.tsx src/test/pricingEntitlementContract.test.ts src/test/strictPriorityBusinessFlowProof.test.ts src/test/criticalBusinessInvariants.test.ts src/test/criticalWorkflowProof.test.ts src/test/ciCostWorkflow.test.ts src/test/aiQuotaReservationOrder.test.ts
& 'C:/Users/K R/.deno/bin/deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --config=supabase/functions/deno.json --import-map=supabase/functions/coverage-import-map.json supabase/functions/_shared/aiQuotaHandlers.test.ts supabase/functions/_shared/aiUsage.test.ts supabase/functions/ai-search/index.test.ts supabase/functions/smart-filters/index.test.ts supabase/functions/ai-service-match/index.test.ts supabase/functions/listing-ai-assist/index.test.ts supabase/functions/pro-ai-tools/index.test.ts supabase/functions/property-chat/index.test.ts supabase/functions/property-pois/index.test.ts supabase/functions/property-valuation/index.test.ts supabase/functions/neighbourhood-report/index.test.ts
node scripts/project-runtime.mjs -- node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node scripts/project-runtime.mjs -- node scripts/public-function-inventory.cjs --check
node scripts/project-runtime.mjs -- node scripts/public-function-inventory.cjs --out docs/public-edge-function-inventory.json
node scripts/project-runtime.mjs -- node .superpowers/sdd/2026-09-21-verified-remediation-plan/task9-lint-boundary.mjs
git diff --check
```

Scoped lint invoked installed `node_modules/eslint/bin/eslint.js` on every changed TS/TSX path (full path list in `task9-lint.log` invocation from tool history; final changed subset repeated after small follow-ups). Code commit used normal hooks, invoking `node scripts/project-runtime.mjs -- npm run lint`; log `task9-code-commit.log` proves repository lint success. No build/full coverage/full browser suite was requested or run.

Raw evidence in this SDD directory:
- `task9-behavior-red.log`: initial six failures; recent-only chart fixture initially lacked sourced current private-sales evidence, so that one initial failure was a fixture issue, not accepted RED proof.
- `task9-chart-corrected-red.log`: corrected fixture, both tests intentionally fail against original closure. Finally restores candidate source. Final frontend run proves both GREEN.
- `task9-ci-red.log`: two synthetic matcher RED failures.
- `task9-quota-before-removal.log`: 21/21 preservation checks before shim removal; `task9-quota-after.log`: 66/66 after removal; `task9-edge-final.log`: 114/114 all affected suites.
- `task9-frontend-final.log`: 186/186 and explicit exit=0. `task9-typecheck-final.log`, `task9-lint-final.log`: no diagnostics. `task9-lint-boundary.json`: inclusion/exclusion observations.
- Intermediate `task9-frontend-green.log` exposed one obsolete removed mock assertion; fixed. `task9-contract-green.log`/`task9-repaired-green.log` exposed stale existing literal anchors in already-touched guards: Pricing billing-mode expression now split across a local variable, PropertyValuation v2 test name, and parameterized Open House capacity rejection test name. Corrected to inspected current source/test assertions; no billing/Open House runtime change. `task9-guards-final.log` 18/18. These were test-maintenance failures, not demonstrated production defects.
- Initial quota fixture compilation needed a RequestInit body narrowing; first execution then exposed a wrong expected log-message spelling, corrected before 21/21 baseline. No production fix was made for these fixture errors.

Supabase guidance: inspected local skill and current official unit-test guide (https://supabase.com/docs/guides/functions/unit-test), which describes full-handler tests mocking HTTP boundaries. Changelog markdown fetch was unsupported and HTML fallback timed out; no Supabase API/schema/config semantics changed or dependency update was inferred. Frozen installed APIs were exercised locally.

## Denominator and schema boundaries

`task9-denominator-scope.json` records source/test scope, not coverage: two deleted frontend runtime files (90 physical source lines at BASE), removal of one orphan computation and three unreachable mutation exports, removal of one Edge shim plus callsites. Dedicated obsolete test definitions removed: 12 image-helper + 8 computation + 1 grouped writer test = **21**. Presentation/readers keep their tests; 21 new actual-handler quota cases plus targeted regressions are added. Current Edge runtime manifest still contains **137 runtime files**; new behavioral suite is correctly classified as a test. No runtime inventory or coverage floor was relaxed. Executable line/statement denominators and >=80% claims require the later fresh final coverage runs; no historical percentage is recomputed by subtracting these lines.

`docs/effective-schema-remediation-map.md` is explicitly a selected inspected-source lineage map. Existing DDL trace preparation/four-event rollback fixture does not equal a full effective schema. Final D0 owns fresh ordered replay, actual create/replace/alter/drop events joined to final catalogue/ACL/policy/trigger metadata, exact source/bootstrap/migration identities and supported-upgrade equivalence. All migrations retained; no source-only map justifies squashing/deletion or readiness=true.

Task10 documentation references to reconcile: FEATURE_WIRING_COMPLETE.md obsolete writers, EDGE_FUNCTION_AUTH_RATIONALE.md no-op accounting references, architecture.html actual comparable-sales purpose, and audit-coverage-inventory.json through its normal fresh-generation workflow. Plans and prior reports remain historical evidence.

Self-review: checked full scoped diff, confirmed only intended deletions, retained module pair/score helpers/readers, quota bypass disabled in new suite, exact artifact boundary, no migration/lockfile/provider/GitHub changes, and clean default lint. Final whole-project coverage, full replay/effective schema, acceptance and release gates remain open.
