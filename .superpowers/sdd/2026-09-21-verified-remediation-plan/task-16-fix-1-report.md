# Task 16 fix round 1 — valuation provenance and identity repair

Date: 2026-09-23

Fix base: `8e942877a7eeae674dd5b3534cc65e3feb50ed66`

Branch: `codex/project-remediation-20260921`

Review authority: `task-16-review.md`, Important I1–I4

## Outcome

The four review findings are repaired without adding a provider, changing quota policy, reconstructing defaults, or altering database behavior. The handler now uses one canonical transaction for its prompt and response. Compact consumers retain the supported v2 report and selected amount metadata. Quota, loading, errors and post-request work are generation-bound. Original-handler tests disable the auth bypass and exercise ordered authentication, reservation and provider transport.

## I1 — canonical transaction and unknown-period lease context

The prompt now derives its transaction with the same `normalizeTransaction` function as the response. `{ listingType: "open_house", openHouseTransactionType: "rent" }` therefore requests monthly rent and returns `transaction: "rent"`, `valueUnit: "EUR/month"` and `estimateBasis: "monthly_rent"` consistently.

`propertyPredictedLeasePrice` is passed to the model as an object with `unit: null` and an explicit unavailable-period limitation. The rental instructions prohibit using that observation as monthly rent or as a monthly valuation anchor. A distinct explicit model monthly estimate remains allowed when supported by supplied attributes or evidence with known units. Asking rent remains comparison context.

RED: the original-handler prompt capture showed `Transaction: open_house`, sale-value output instructions, and the raw lease number as primary evidence. The focused run was `13 passed | 4 failed`; the two I1 failures matched those contradictions. GREEN: both prompt captures pass in the final 20-case handler run, including an OS `1800` unknown-period observation and a separate AI `1700 EUR/month` estimate.

## I2 — useful partials and auction meaning in compact consumers

`usePropertyAIInsights` and `NewBuildDetail` now retain the parsed v2 report alongside the selected numeric fields; New Build also retains supported density. `PropertyAIInsightsSection` and `CompareAIReports` render summary, factors, concerns, renovation potential, highest-best-use, legal and tax context. A text-only result remains visible when no amount exists. `PropertyValuation` now exposes `taxSummary` in its expanded evidence section, so tax-only success is not silent.

The compact renderers use the selected primary unit, basis and matching range. Auction AI output is labelled as an unverified clean-market estimate with a clear-title assumption, while the OS auction-model quantity is shown separately and is not called a clean-market value, bid or execution value. An OS lease observation is shown without `/mo` and says its period is unavailable.

RED: the focused frontend run was `20 passed | 10 failed`; consumer cases could not find factors, renovation/tax text, the second OS auction quantity, clean-title qualification, selected range, or unknown-period lease wording. GREEN: the corrected four-file frontend run is `57 passed | 0 failed`, including factors-only/renovation-only New Build and comparison paths, unknown-period lease, and combined OS-auction/AI-clean output.

## I3 — stale quota, rejection and finally protection

`refreshAiInsightsQuota` accepts the caller's generation and mutates quota/loading state only while that generation is current. Identity changes also clear quota loading. Precheck and post-result refreshes carry that generation. Rejected valuation calls return without toast, quota refresh or state mutation after the actor/property changes. New Build applies the same generation check before its catch feedback; its existing guarded finally remains the only path that clears loading and refreshes quota.

RED: a delayed exhausted A quota overwrote B's allowed quota, and a rejected A valuation toasted after B had a successful result. GREEN: both hook reproductions preserve B's quota/result/loading and dispatch exactly one valuation after the stale quota read. The New Build A-reject/B-success reproduction preserves B's `510000` result and displays no old error.

No already-dispatched provider call is cancelled or refunded. The change only prevents old continuations from affecting the new subject.

## I4 — real reservation proof and restored supported regressions

The property handler fixture sets `MAIPROP_EDGE_TEST_AUTH_BYPASS=false`. A stable fake-fetch dispatcher lets the real cached Supabase client keep production-like client reuse while each test selects a synthetic account/transport. Successful admission records `auth -> quota` before providers. Denied quota returns 429 after exactly one reservation with zero OS/model calls. Failed reservation returns controlled 503 after one attempt with no retry or provider call. The existing attempt policy remains unchanged.

The v2 suite restores:

- strict request boundaries for unknown keys, overlong city/title, nonfinite price input, unrealistic price/size and construction year, all before auth/quota;
- OS warm-token reuse: two admitted handler requests, two reservations and two valuations use one OS authentication call;
- new-build `gpt-5.4`, `medium` reasoning and supplied title/energy/parking/pool context.

The corrected disposition in `task-16-report.md` distinguishes these restored supported tests from assertions intentionally retired with fabricated defaults.

## Verification

All commands ran from the repository root through the frozen project runtime. No external provider or database transport escaped the stable test fakes.

### RED — original handler

```powershell
npm run runtime -- node scripts/run-deno-tests.mjs property-valuation/index.test.ts
```

Result before production repair: `13 passed | 4 failed`. I1 prompt captures failed as expected. Initial real-reservation fixtures also exposed that a Supabase client retains its fetch implementation; the fixture was corrected to use one stable dispatcher rather than changing production caching.

### RED — compact consumers and stale work

```powershell
npm run runtime -- npm exec vitest -- run src/test/usePropertyAIInsights.test.tsx src/test/CompareAIReports.test.tsx src/test/rentalAiValuationLabels.test.tsx
```

Result before production repair: `20 passed | 10 failed`. Failures were the missing carried report/rendering and the two stale actor reproductions. After implementation, the same run reached `27 passed | 3 failed`; those three were assertion matchers crossing nested `<strong>` text, not missing behavior. Tightened semantic assertions then passed.

### GREEN — original handler

Command, from `supabase/functions`:

```powershell
$deno = if ($env:MAIPROP_DENO) { $env:MAIPROP_DENO } else { Join-Path $env:USERPROFILE '.deno/bin/deno.exe' }; & $deno test --node-modules-dir=none --frozen --cached-only --deny-net --allow-env --allow-read --allow-write --import-map=coverage-import-map.json property-valuation/index.test.ts
```

Result: `20 passed | 0 failed` in 53 ms. The final proof used the original handler source, frozen lock/import map, cached dependencies and denied external network.

Final source identities: `supabase/functions/property-valuation/index.ts` SHA-256 `E1E74A16F63854949546ACBD415424CBBA8A4C1DAEB3E08394AFE33FE4EAEBBE`; `supabase/functions/property-valuation/index.test.ts` SHA-256 `8075C361AC2D9A34B7EF4417C6D760CD49505A161FE160E8E805F0FB79DABD19`; shared fixture `src/test/valuationV2Fixture.ts` SHA-256 `6A2F4764EE0F7D70AD2E394DCB02416D343F3CBF45343E65DAE10040E8D6FDED` (unchanged in this fix).

### GREEN — focused frontend

```powershell
npm run runtime -- npm exec vitest -- run src/test/usePropertyAIInsights.test.tsx src/test/CompareAIReports.test.tsx src/test/rentalAiValuationLabels.test.tsx src/test/NewBuildDetail.test.tsx
```

Result: `4` files passed, `57` tests passed, `0` failed.

### Type check

```powershell
npm run runtime -- npm run typecheck
```

Result: exit 0; `tsc --noEmit -p tsconfig.app.json` reported no errors.

### Scoped lint

```powershell
npm run runtime -- npm exec eslint -- src/hooks/usePropertyAIInsights.ts src/components/property/PropertyAIInsightsSection.tsx src/components/CompareAIReports.tsx src/components/PropertyValuation.tsx src/pages/NewBuildDetail.tsx src/test/usePropertyAIInsights.test.tsx src/test/CompareAIReports.test.tsx src/test/rentalAiValuationLabels.test.tsx src/test/NewBuildDetail.test.tsx
```

Result: exit 0; no findings.

`git diff --check` passed. The repository-wide `eslint .` hook was not rerun because its known residual benchmark traversal remains Task 9 scope. The scoped lint covers every changed frontend source/test file; Deno's test command type-checked the original handler and handler test.

## Compatibility, privacy and limits

The v2 response shape is unchanged. Existing current callers continue to negotiate `responseVersion: 2`; unversioned legacy callers remain handled before quota/provider work. Added report fields were already in v2 and are now retained rather than reconstructed. Numeric zero and null semantics are unchanged.

The browser receives only the controlled v2 envelope or controlled error. The prompt includes no new customer fields. Test users, tokens, endpoints and provider values are synthetic. No provider call, customer row, database write, deployment, GitHub operation, dependency installation, build, full suite or coverage collection occurred.

This is focused source evidence. It does not establish deployed compatibility, full coverage floors, browser-after behavior, or release artifact equality. The old Quick Sale website still requires the matched cutover recorded in the main Task 16 report. Independent scoped rereview remains the next gate.
