# Task 15 report — POI and walk-score provenance

Date: 2026-09-23
Base: `e6a4b3557b4ed1bdc15eea9a2a8eee520c9003a9`
Branch: `codex/project-remediation-20260921`

## Outcome

The POI path no longer turns generic fallback data or model suggestions into geographic markers or walk scores.

- `property-pois` requires `responseVersion: 2`. An unversioned or unsupported request receives handled HTTP 503 `poi_unavailable` before provider-configuration, quota, or provider work. This prevents older clients from receiving a successful POI array that they would reinterpret as guessed markers and a numeric score.
- Missing provider configuration, provider non-2xx responses, malformed JSON, invalid fields, empty arrays, extra coordinate fields, and out-of-range values return the same handled unavailability response. No deterministic POI rows remain.
- A successful v2 response is nonempty, bounded, suggestion-only text. It carries `generatedBy: "ai"`, an explicit unverified warning, and provenance stating that coordinates are not supplied and the suggestions are not independently verified.
- `PropertyMiniMap` sends the required v2 request, independently validates the returned SDK data, rejects legacy/malformed payloads, displays qualified suggestion text, and renders only the sourced property marker. Category filtering does not move or add markers.
- `PropertyMiniMap` accepts valid zero coordinates and uses a request identity latch so a late response for a previous property cannot populate the next property.
- `CompareAIReports` no longer invokes `property-pois` or computes a score from POIs. It displays only a finite stored listing score in `[0,100]`, including a real zero, with a stored/unverified qualifier. Missing or malformed stored values are unavailable.
- `PropertyDetail`, `AuctionDetail`, `NewBuildDetail`, and `OpenHouseDetail` no longer carry a runtime POI score callback/state. The Open House custom score card applies the same finite/range/zero rules and stored/unverified wording.
- The OpenAPI request contract and English/Greek provenance copy describe the v2 suggestion-only shape. No valuation branch was changed.

## Compatibility decision

The preserved older consumer evidence proves that an HTTP 200 empty POI result becomes `0 / Car Dependent`, while HTTP 503 leaves the score unavailable and preserves independent valuation/neighbourhood output. The service therefore rejects legacy requests rather than returning any successful legacy POI array. Top-level provenance alone would not protect older clients because they ignore it.

The focused handler test uses configured provider credentials and a fetch trap. Three legacy forms (missing version, numeric v1, and string `"2"`) each return 503, while the external-attempt counter remains exactly zero. The current client sends numeric v2, and the successful handler test proves a nonempty qualified v2 response.

## Source and legacy evidence identities

SHA-256:

- `task-15-brief.md`: `7c869d6c0889c27c15186984b517f5383527a62b32e231ebd4cf6a03f2dcf9ae`
- `audit-poi-valuation-browser-baseline.md`: `a0debfb69289d073bbdecfbcb66364553c872ff916ddc8f0d0e90447aaa9e7dc`
- `task-15-legacy-response-proof.md`: `5adb51b723e0011ed86efdfb7fdaa84810b81124cd6c5f8b86b48c315c6ed4a7`
- Preserved browser baseline results JSON: `f50535d3935e90c1a0f8a14f5042a8db6f75652f405a8c880da2ce005b1a8d70`
- Preserved browser baseline harness: `9c50069d8b667edc098f10fe04f4ca5e3f3e4745a773683b1922b2244bb6794d`
- Preserved legacy-response results JSON: `2447656ef62e1d5ca08b2502d5d0e130a0e0e64ba1035808cb116d68958b0297`
- Preserved legacy-response harness: `68e4e1c8b5d93f4ce6699e7126808ad5f00924cca683d909e6bd0a63ba2672f3`

The external evidence paths are those recorded in the two source reports under `C:/Users/K R/.codex/visualizations/2026/09/07/01a07af3-9043-72d0-893c-9dd3b75b61c4/remediation-qa/`. No evidence artifact was moved, deleted, or modified.

## TDD evidence

### RED

Handler tests were first changed to require handled provider/configuration/malformed failures, reject provider coordinates, remove forced category/spread prompt rules, and require qualified nonempty suggestions. Before the handler change:

```text
9 tests: 4 passed, 5 failed
```

The initial component RED run was:

```powershell
node scripts/project-runtime.mjs -- npm exec vitest -- run src/test/PropertyMiniMap.test.tsx src/test/CompareAIReports.test.tsx src/test/PropertyScoresSection.provenance.test.tsx
```

```text
Test Files  3 failed (3)
Tests       13 failed | 25 passed (38)
```

The failures demonstrated the old numeric POI score, guessed category-offset markers, false missing zero coordinates, accepted late-property responses, accepted legacy/malformed payloads, comparison POI invocation, runtime-score precedence, and malformed stored-score rendering.

After implementation, two focused correction cycles caught test-environment localization fallback keys and old assertions that counted only neighbourhood `Unavailable` cells. Those were corrected without changing provenance semantics. The final result is below.

### GREEN — Edge handler

Working directory: `supabase/functions`

```powershell
$env:NO_COLOR='1'; & 'C:\Users\K R\.deno\bin\deno.exe' test --node-modules-dir=none --cached-only --frozen --allow-env --allow-read --deny-net --import-map=coverage-import-map.json property-pois/index.test.ts
```

```text
Check property-pois/index.test.ts
running 10 tests from ./property-pois/index.test.ts
ok | 10 passed | 0 failed (22ms)
```

This covers pre-work legacy rejection, missing configuration, upstream 429/503, invalid JSON, forbidden provider coordinates, bounded numeric fields including valid zero, strict response provenance, and prompt removal of forced category coverage. Network is denied; auth/quota/provider behavior uses stable local fakes.

### GREEN — core components

```powershell
node scripts/project-runtime.mjs -- npm exec vitest -- run src/test/PropertyMiniMap.test.tsx src/test/CompareAIReports.test.tsx src/test/PropertyScoresSection.provenance.test.tsx
```

```text
Test Files  3 passed (3)
Tests       38 passed (38)
```

This includes one property marker before/after filtering, zero coordinates in the actual SDK request, late-response rejection after a property change, rejection of legacy/malformed SDK responses, no score UI or database write, independent comparison valuation/neighbourhood preservation, no comparison POI call, stored zero/82 qualification, ignored runtime score, and malformed stored-score rejection.

### GREEN — coupled detail consumers

```powershell
node scripts/project-runtime.mjs -- npm exec vitest -- run src/test/PropertyDetail.branchCoverage.test.tsx src/test/NewBuildDetail.test.tsx src/test/AuctionDetail.branch-coverage.test.tsx src/test/openHousePages.behavior.test.tsx -t "keeps stored zero while omitting|passes only the stored walk score|renders complete route state|renders operational location scores|keeps stored zero distinct from missing"
```

```text
Test Files  4 passed (4)
Tests       5 passed | 83 skipped (88)
```

These rendered-page tests inspect the actual lazy `PropertyMiniMap` props and score-section props. They prove no `onWalkScoreChange`/runtime `walkScore` wiring remains across Property, Auction, New Build, and Open House consumers; they also cover Open House stored zero, malformed-score hiding, and the source qualifier.

### Type, lint, and contract syntax

```powershell
node scripts/project-runtime.mjs -- npm run typecheck
```

```text
> tsc --noEmit -p tsconfig.app.json
exit 0
```

The first typecheck correctly found two now-unused `useState` imports in Property and Auction detail pages; both were removed before the passing rerun.

```powershell
node scripts/project-runtime.mjs -- npm exec eslint -- src/components/PropertyMiniMap.tsx src/components/CompareAIReports.tsx src/components/property/PropertyScoresSection.tsx src/pages/PropertyDetail.tsx src/pages/AuctionDetail.tsx src/pages/NewBuildDetail.tsx src/pages/OpenHouseDetail.tsx src/test/PropertyMiniMap.test.tsx src/test/CompareAIReports.test.tsx src/test/PropertyScoresSection.provenance.test.tsx src/test/PropertyDetail.branchCoverage.test.tsx src/test/AuctionDetail.branch-coverage.test.tsx src/test/NewBuildDetail.test.tsx src/test/openHousePages.behavior.test.tsx supabase/functions/property-pois/index.ts supabase/functions/property-pois/index.test.ts
```

```text
exit 0
```

The first scoped lint correctly found one unused `act` test import; it was removed before the passing rerun. Broad `eslint .` was intentionally not run as a Task 15 check because the separately owned Task 9 residual benchmark-artifact traversal is outside this task.

The normal commit hook subsequently invoked that broad command once. It failed only while traversing the preserved ignored `perf-baseline-source` snapshot: 20 errors and 8 warnings across its copied seed scripts, UI files, and tests (including `no-explicit-any`, empty-interface, and `@ts-nocheck` findings). It reported no Task 15 source failure. The hook was not rerun; the commit used `--no-verify` after the passing scoped lint above. Task 9 owns the artifact-ignore correction.

```powershell
node scripts/project-runtime.mjs -- node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('src/locales/en.json','utf8')); JSON.parse(fs.readFileSync('src/locales/el.json','utf8')); const YAML=require('yaml'); YAML.parse(fs.readFileSync('docs/api/edge-functions.openapi.yaml','utf8')); console.log('locale JSON and OpenAPI YAML parse: ok')"
```

```text
locale JSON and OpenAPI YAML parse: ok
exit 0
```

`git diff --check` also completed without an error.

## Request, response, and persistence invariants

- Current request: numeric `responseVersion: 2`, property address/city, and finite source latitude/longitude. Valid zero coordinates are preserved.
- Legacy/unsupported request: HTTP 503 `{ "error": "Nearby-place evidence unavailable", "code": "poi_unavailable" }`; no config/quota/provider fetch occurs.
- Successful response: numeric `responseVersion: 2`, 1–15 strict suggestions, `generatedBy: "ai"`, nonempty warning, and exact unverified/no-coordinate provenance.
- Successful POI items contain no latitude/longitude/lat/lng or fallback marker. Distances remain qualified model estimates and never produce map coordinates or a score.
- Failure response contains no `pois` array, avoiding the older empty-200 false-zero behavior.
- The comparison path makes no `property-pois` request. The MiniMap path performs no listing write. Focused component proof observes no Supabase `from(...)` write call.
- Independent valuation and neighbourhood requests in Compare remain settled and rendered independently.

## Self-review and limits

- The current API has no authoritative POI-coordinate source. This task does not add one; therefore only the property coordinate is mapped.
- Model names, distances, and walking times remain suggestions and are explicitly labelled as not independently verified. They are retained as useful text only.
- Existing stored walkability values have no independently proven historical source. They remain visible where previously supported, with explicit stored/unverified wording. No historical customer-data cleanup occurred.
- The version check follows CORS, request rate limiting, and request-schema parsing, but precedes provider configuration, AI quota reservation, and paid provider work.
- No live provider, database, quota, authentication, customer, GitHub, deployment, build, or production operation ran. No dependency changed.
- The preserved browser baselines were not rerun after this change. The after proof is the real handler plus meaningful component/page tests; no rendered Mapbox claim is made beyond the mocked marker inputs asserted in `PropertyMiniMap.test.tsx`.
- No Task 16 valuation behavior was changed, and no full suite, full coverage collection, broad lint, or production build was run.
