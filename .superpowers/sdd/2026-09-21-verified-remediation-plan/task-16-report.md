# Task 16 implementation report — negotiated valuation evidence

Date: 2026-09-23

Base: `24ef68ff4310ac0794b7ea636011ac09356c1fa1`

Branch: `codex/project-remediation-20260921`

## Outcome

The property valuation route now has an explicit `responseVersion: 2` contract. A successful response is a fixed nullable envelope with service-owned source, basis and unit metadata. Asking prices remain request context and are never substituted for missing evidence. The service preserves an explicit OS sale prediction, an unknown-period OS lease observation and an OS auction-model prediction with their restricted meanings. An explicit model estimate remains labelled as unverified. When neither provider supplies a supported value or useful analysis, the route returns handled `503 valuation_unavailable`.

All five active request paths send version 2 through the frontend request schema: `PropertyValuation`, `CompareAIReports`, `usePropertyAIInsights`, `NewBuildDetail` and `FiresaleQuickSaleForm`. The shared parser rejects legacy objects, strings masquerading as numbers, inconsistent provenance and unsupported versions. It keeps true numeric zero where the field admits zero. Amount, source, basis, unit and matching range are selected together.

The old static Greece 2026 tables, type/default valuation generators, asking-price substitution, generated ranges, forced legal/tax/liquidity/confidence/yield values and legacy primary-estimate fallback helper were removed. The model prompt now permits nulls and prohibits unsupported benchmarks, named comparables, document findings, fixed adjustments and assumed tax/financial values.

## OS and model semantics

- The OS request is skipped unless latitude, longitude, positive square metres, construction year in 1900–2100 and floor are present. Explicit floor zero is retained. An unknown category is omitted rather than changed to `RESIDENCE`.
- `propertyPredictedPrice` can supply a sale market-model value or a separately labelled auction-model quantity. It is not automatically a clean-title value, bid or execution value.
- `propertyPredictedLeasePrice` is retained only in `providerPrediction` with `unit: null`; the captured provider contract does not establish its period.
- A model-supplied auction clean-market counterfactual uses the existing `auctionAdjustedValue` key, is labelled `ai_estimate`, and the UI states its clear-title assumption and lack of document verification. It is displayed separately from an OS auction-model quantity.
- Asking comparison uses `(asking - supported anchor) / supported anchor * 100`: positive is overpriced, negative is underpriced and the inclusive `[-5, 5]` interval is fair.
- No OS `annualYieldPrc` value is exposed because the captured schema gives no unit semantics.

The external schema evidence used by the binding brief remains `os-openapi-20260923.json`, retrieved by the controller from the OS OpenAPI source on 2026-09-23 with SHA-256 `8A533E26D53668EA546207EAB0EF6A92A2B05EC8B3EB154044926703F7FD034D`. This task made no live provider request.

## Compatibility and Quick Sale

Authenticated unversioned valuation requests receive handled `503 valuation_unavailable` before quota reservation, OS work or model work. Unsupported explicit versions fail validation with 400. Current source callers all request version 2. This is a coordinated service-and-website contract change; an old cached website remains temporarily unable to request a valuation.

The exact seven-file old Quick Sale source is preserved at `task-16-legacy-quicksale-snapshot-24ef68ff/manifest.json`, source commit `24ef68ff4310ac0794b7ea636011ac09356c1fa1`, manifest SHA-256 `741BF14168F83F785BA3045C3D00C76DF1C340A07CDB077DA878F9B77435251A`. It is source identity, not an executed compatibility result. The old client could generate and retain its own numeric estimate after a service 503; therefore safe behavior requires the matched website cutover and cannot be claimed from the legacy gate alone.

The current Quick Sale flow no longer seeds type benchmarks, uses asking price as an estimate, multiplies a remote value by `.95`, generates a submit fallback, claims 94% confidence or seven-day validity, or reconstructs a market amount by dividing by `.95`. It stores the selected supported v2 value unchanged, or explicit null. The frontend and handler schemas admit null while preserving finite nonnegative legacy numeric inputs, including zero. Seller/authenticated actor enforcement, asking price, publication rules, image rollback and the admin-reviewed final-offer workflow are unchanged. The two admin renderers show `Unavailable` for an absent estimate.

The binding local storage proof is `task-16-null-storage-proof.md`; it established null and legacy numeric persistence without a migration. No database or customer row was touched in this implementation.

## Caller identity and rendering

Property, actor and Quick Sale form-subject changes increment a request generation before state is cleared. A response is checked again after quota reads and after the provider call, so an old A response cannot populate B or a different actor. An already dispatched paid request is not claimed to be cancelled.

Partial v2 reports remain useful without a primary amount. The renderers preserve supported density, key factors, red flags, renovation potential, highest-best-use text and the separate OS auction-model quantity. New-build analysis explicitly says that project price and size aggregates may come from different available unit sets and that no selected unit was appraised. Open-house rental requests retain their explicit transaction subtype and asking-rent inputs.

## RED evidence and test disposition

Development started with focused failing cases:

- The new shared v2 parser/selector tests failed because `parseValuationResponseV2` and the v2 contract did not exist (3 failures).
- Quick Sale model/submission/rendering cases failed because a remote `300001` value was transformed to `285001`, missing evidence became a local `139840` estimate, and the UI lacked the required `Market estimate` / `Unavailable` behavior (4 failures).
- The first v2 edge run was 14 passing / 6 failing. The failures exposed test-bypass counter observability, a missing request destructure and malformed provider-envelope handling. The final real handler harness covers the corrected paths.
- Running the old valuation-focused frontend files against the new contract produced 29 failures because their fixtures asserted the intentionally removed sparse-response reconstruction and numeric defaults. Those tests were not accepted as new behavior.

Supported tests were adapted rather than discarded:

- Task 5 comparison protections cover valid partial safety, missing/unknown noise, malformed/non-finite scores and the v2 neighbourhood request.
- Task 15 protections cover finite stored scores, true zero, out-of-range rejection, explicit stored/unverified wording and zero `property-pois` calls.
- Anonymous and signed-in Free access, deferred initial quota lookup, quota-denied zero valuation call, request identity/coordinates/ownership fields, provider feedback, explicit refresh and expand/collapse controls remain covered.
- A-request / switch-to-B / resolve-A and actor-change reproductions use real component/hook state. Quick Sale also changes the form subject before resolving the old estimate.
- OS-only sale, lease partial, auction basis, OS plus AI clean-market, model-only estimate, analysis-only partial, malformed/auth-looking provider failure, authentication denial, invalid/legacy versions, rental asking conflict and nullable submit persistence use the actual Deno handlers with faked transports and denied external network.

Tests intentionally retired or inverted cover removed behavior: legacy snake-case valuation normalization, asking-price fallback, sparse-success `at_market`/zero defaults, generated ±10% ranges, heuristic rental yield, fixed score/legal/tax defaults, deterministic service fallback estimates and Quick Sale `.95`/94%/seven-day/local benchmark assertions. The initial patch also removed still-supported request-boundary, OS warm-token and new-build model/reasoning assertions; that was an overstatement in this report. Task 16 fix round 1 restores those protections against the v2 handler without restoring unsupported defaults. See `task-16-fix-1-report.md`.

## Fix-round correction

Independent review found that the initial implementation did not yet prove or fully implement several claims above. Fix round 1 makes the prompt transaction canonical for open-house rentals, prevents an unknown-period OS lease observation from serving as a monthly model anchor, carries the complete supported partial report through compact consumers, exposes tax-only analysis, and generation-binds quota/error/finally work. It also replaces the handler fixture's auth bypass with actual fake auth and quota transport and proves one ordered reservation per admitted attempt. The original `13` property-handler count and `98` frontend count remain historical evidence for commit `8e942877`; the current focused results and the exact corrected scope are recorded in `task-16-fix-1-report.md` and supersede those counts for the repaired files.

## Final focused verification

### Actual edge handlers

Command, from `supabase/functions`:

```powershell
$deno = if ($env:MAIPROP_DENO) { $env:MAIPROP_DENO } else { Join-Path $env:USERPROFILE '.deno/bin/deno.exe' }; & $deno test --node-modules-dir=none --frozen --cached-only --deny-net --allow-env --allow-read --allow-write --import-map=coverage-import-map.json property-valuation/index.test.ts submit-firesale-request/index.test.ts
```

Result: `20 passed | 0 failed` in 234 ms (`13` property-valuation plus `7` submit-firesale-request). External network was denied; the scoped handler harness supplied stable auth/quota/provider transports. Relevant fixture identities after the run: `property-valuation/index.test.ts` SHA-256 `B8F379DA72244005E72610026EFAA38B67C8F6465CB88A001BC7ABA3C4711A7E`; shared frontend fixture `src/test/valuationV2Fixture.ts` SHA-256 `6A2F4764EE0F7D70AD2E394DCB02416D343F3CBF45343E65DAE10040E8D6FDED`.

### Focused frontend and contract tests

```powershell
node scripts/project-runtime.mjs -- npm test -- --run src/test/valuationResult.test.ts src/test/PropertyValuation.test.tsx src/test/CompareAIReports.test.tsx src/test/usePropertyAIInsights.test.tsx src/test/NewBuildDetail.test.tsx src/test/FiresaleQuickSaleForm.test.tsx src/test/FiresaleQuickSaleForm.model.test.ts src/test/FiresaleQuickSaleSubmission.test.ts src/test/QuickSaleSubmittedView.test.tsx src/test/mutationSchemas.test.ts src/test/rentalAiValuationLabels.test.tsx
```

Result: `11` files passed, `98` tests passed, `0` failed.

### Type check

```powershell
node scripts/project-runtime.mjs -- npm run typecheck
```

Result: exit 0; `tsc --noEmit -p tsconfig.app.json` reported no errors.

### Scoped lint

```powershell
node scripts/project-runtime.mjs -- npm exec -- eslint src/components/CompareAIReports.tsx src/components/PropertyValuation.tsx src/components/admin/FiresaleComponents.tsx src/components/firesale/FiresaleQuickSaleForm.tsx src/components/firesale/QuickSaleFormView.tsx src/components/firesale/QuickSaleSubmittedView.tsx src/components/firesale/quickSaleFormModel.ts src/components/firesale/quickSaleSubmission.ts src/components/property/PropertyAIInsightsSection.tsx src/hooks/usePropertyAIInsights.ts src/lib/mutationSchemas.ts src/lib/valuationResult.ts src/pages/NewBuildDetail.tsx src/pages/OpenHouseDetail.tsx src/test/CompareAIReports.test.tsx src/test/FiresaleQuickSaleForm.test.tsx src/test/FiresaleQuickSaleForm.model.test.ts src/test/FiresaleQuickSaleSubmission.test.ts src/test/NewBuildDetail.test.tsx src/test/PropertyValuation.test.tsx src/test/QuickSaleSubmittedView.test.tsx src/test/mutationSchemas.test.ts src/test/rentalAiValuationLabels.test.tsx src/test/usePropertyAIInsights.test.tsx src/test/valuationResult.test.ts src/test/valuationV2Fixture.ts supabase/functions/property-valuation/index.test.ts supabase/functions/property-valuation/index.ts supabase/functions/submit-firesale-request/index.test.ts supabase/functions/submit-firesale-request/index.ts
```

Result: exit 0; no findings.

`git diff --check` also passed. No build, broad suite, full coverage collection, provider request, database write, install, deploy or GitHub operation was run. The known repository-wide `eslint .` artifact traversal remains Task 9 scope, so the broad commit hook was not used and no broad lint claim is made.

## Privacy, quota and error behavior

The browser receives only the controlled v2 envelope or controlled error. Raw provider payloads, endpoint URLs, auth-looking upstream text and OS diagnostics are not exposed. Existing bounded internal provider-error logging remains operational; this report contains no credentials or customer data.

The existing attempt policy is preserved: valid v2 work reserves before OS/model calls and `recordAiCall` does not create a second reservation in the covered harness. Authentication/quota denial performs no provider work. Invalid versions perform no authentication, reservation or provider work. Authenticated legacy requests authenticate only, then return handled unavailable with zero quota/provider work. Provider failure after reservation is still an attempted call under the existing policy; there is no new refund behavior.

## Self-review and limitations

- Reviewed every changed active caller and the Quick Sale submission/rendering path for Number/null coercion, asking substitution, stale state, source/basis/unit separation and true zero handling.
- Confirmed the Task 5 neighbourhood and Task 15 POI branches remain independent in `CompareAIReports`; valuation failure does not clear supported neighbourhood or stored-score evidence.
- Confirmed the old unsupported tables/generators and active legacy fallback helper names no longer exist in the scoped runtime sources.
- The OS lease period, `annualYieldPrc` unit and stronger auction clean-versus-bid semantics remain unproved. The implementation deliberately leaves those meanings unavailable or narrowly labelled.
- Existing stored numeric estimates do not gain provenance retroactively. No row rewrite was attempted.
- Safe Quick Sale behavior requires the matched website release; the preserved old cached UI can still synthesize values independently.
- This is focused local evidence only. It makes no full-suite, full-coverage, production, provider, deployment or release-acceptance claim. Independent code review and browser-after proof remain separate controller gates.
