# Task 16 fix round 2 — compact valuation density

Date: 2026-09-23

Fix base: `9fda2957556233e6c86db9d17be8a0b72abc85ed`

Branch: `codex/project-remediation-20260921`

Review authority: `task-16-rereview-1.md`, residual Important I2 and Minor N1 only

## Outcome

Compact sale/new-build valuation content and comparison reports now expose the nullable density already returned by the v2 response. An available value retains the response unit, the density field's derived evidence source, and the selected primary valuation basis. A missing value renders `Valuation density: Unavailable`. The renderers do not derive density from asking price, the selected valuation, or the separate OS auction quantity.

The existing rental density card is unchanged. Comparison formats a rental response density as `EUR/m²/month`; compact rental continues its existing localized `/m²/{month}` presentation without a duplicate report line.

The New Build stale-rejection regression now drains the old promise and observes controls that are sensitive to an old quota error. An old actor's `monthly_limit_reached` rejection cannot replace the current actor's refresh control with the add-on link.

## Residual I2 — supported density

`PropertyAIInsightsSection` reads `report.pricePerSqmEstimate`, `report.valueUnit`, `report.evidence.fields.pricePerSqmEstimate`, and the basis from `selectPrimaryValuation(report)`. It renders this line for the shared sale/new-build report path and retains explicit unavailable output when the nullable field is absent.

`CompareAIReports` uses the same returned v2 fields. Its density line is independent from listing asking price and from `providerPrediction`, so an auction-model observation cannot be relabelled or divided into the displayed density.

Rendered tests cover:

- compact New Build `5250 EUR/m²`, `derived_ai`, `market_value`;
- the actual `NewBuildDetail` projection of that report;
- comparison `5250 EUR/m²`, `derived_ai`, `market_value`;
- comparison `20 EUR/m²/month`, `derived_ai`, `monthly_rent`;
- null compact and comparison density as unavailable;
- the pre-existing rental density behavior remains in the focused file.

## Minor N1 — guard-sensitive stale rejection proof

The A-request/B-actor case now marks A settled in the rejected promise's `finally`, waits for that marker, and checks the visible AI controls after B's successful `510000` result. The old rejection is `monthly_limit_reached`, which would set quota-exhausted state and swap `Refresh AI insights` for `Buy AI add-on` if the generation guard did not work.

A scoped mutation check temporarily removed only the catch-generation guard in `NewBuildDetail.tsx`. The strengthened test failed after the old promise settled because `Refresh AI insights` was absent and `Buy AI add-on` was present. The guard was restored, `git diff --exit-code -- src/pages/NewBuildDetail.tsx` confirmed the production page matched the fix base, and the same targeted test passed. No mutation was retained.

## Verification

All commands ran from the repository root through the frozen project runtime where applicable.

### RED — density renderers

```powershell
npm run runtime -- npm exec vitest -- run src/test/CompareAIReports.test.tsx src/test/rentalAiValuationLabels.test.tsx src/test/NewBuildDetail.test.tsx
```

Before the renderer change: `3` files failed, `5` tests failed and `42` passed. The failures were the new compact/comparison available and unavailable density assertions. The strengthened stale-rejection assertion already passed with the generation guard present.

### GREEN — focused frontend

```powershell
npm run runtime -- npm exec vitest -- run src/test/CompareAIReports.test.tsx src/test/rentalAiValuationLabels.test.tsx src/test/NewBuildDetail.test.tsx
```

Result: `3` files passed, `48` tests passed, `0` failed. One intermediate run reached `46 passed | 1 failed` before the final monthly-unit case was added because the existing `/OS model prediction/` matcher matched both the primary source and new density provenance. Narrowing that assertion to the complete existing primary-source line resolved the test ambiguity without changing runtime output.

### RED/GREEN — N1 mutation sensitivity

With only the catch-generation guard temporarily removed:

```powershell
npm run runtime -- npm exec vitest -- run src/test/NewBuildDetail.test.tsx -t "ignores an old actor's rejected valuation after the new actor has a result"
```

Result: `1` failed, `26` skipped. The settled old monthly-limit continuation removed the expected `Refresh AI insights` button and exposed `Buy AI add-on`.

After restoring the guard and confirming the production page had no diff, the identical command passed: `1` passed, `26` skipped.

### Type check

```powershell
npm run runtime -- npm run typecheck
```

Result: exit 0; `tsc --noEmit -p tsconfig.app.json` reported no errors.

### Scoped lint

```powershell
npm run runtime -- npm exec eslint -- src/components/property/PropertyAIInsightsSection.tsx src/components/CompareAIReports.tsx src/test/rentalAiValuationLabels.test.tsx src/test/CompareAIReports.test.tsx src/test/NewBuildDetail.test.tsx
```

Result: exit 0; no findings.

`git diff --check` passed. The repository-wide `eslint .` commit hook was not rerun because its known residual benchmark-artifact traversal remains Task 9 scope. The scoped lint covers every changed application and test file in this repair.

## Compatibility, privacy, self-review and limits

The v2 request and response schemas, service logic, provider behavior, quota policy, persistence, and legacy negotiation are unchanged. Numeric zero/null parsing and the primary-selection policy are unchanged. Density is rendered only from the already parsed response; this repair makes no estimate or fallback.

No new customer field reaches the browser or model. Test actors, values and failures are synthetic. No Deno handler run was needed because no service, schema, request, quota or provider code changed. No external provider or database call, install, build, full suite, coverage collection, deployment, GitHub operation or snapshot mutation occurred.

This is focused source and component evidence. It does not establish deployed compatibility, whole-repository lint, full coverage floors, browser-after behavior or release artifact equality. The independent scoped rereview and density browser gate remain the next checks.
