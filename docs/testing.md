# Testing Strategy

## Test tooling

| Tool | Purpose | Command |
|------|---------|---------|
| **Vitest** | Unit + component tests (jsdom) | `npm test` |
| **@vitest/coverage-v8** | V8-based coverage reports | `npm run test:coverage` |
| **Playwright** | E2E browser tests | `npm run test:e2e` |
| **Deno test** | Edge-function tests | `npm run test:deno` |

## Current coverage baseline (2026-05-16)

| Metric | Current | Threshold | Target Q3 | Target Q4 |
|--------|---------|-----------|-----------|-----------|
| Lines       | 66.51% | 63% | 70% | 80% |
| Statements  | 66.51% | 63% | 70% | 80% |
| Functions   | 44.49% | 43% | 50% | 60% |
| Branches    | 60.90% | 60% | 65% | 75% |

> **Threshold = floor.** The numbers in `vitest.config.ts` MUST match this
> table. Whenever a PR adds meaningful coverage to one of the P0 priority
> targets below, raise the threshold in the same PR by an equivalent
> margin (e.g. lines 10 → 12 if the PR genuinely lifts measured lines from
> 11.88% to 14%). This makes the floor ratchet upward and prevents silent
> regression.

## Priority coverage gaps

The project no longer accepts audited runtime source files at **0% line
coverage**; `npm run test:audit-coverage` enforces that using
`coverage/coverage-summary.json` plus `docs/audit-coverage-inventory.json`.
This is still not a claim that every line/function has been exercised. It proves
that coverage was measured, that every audited runtime file has at least one
executed line, and that remaining low-coverage files are visible in the
inventory for prioritization.

The audit inventory is a coverage floor, not mathematical line/function proof.
"Top-grade" for this product means every revenue, trust, role, and data-mutation
path below has explicit happy-path, denial-path, and regression tests even when
the global coverage percentages are already above threshold.

Ranked by business impact:

### Current P0 contract

- Checkout and webhook entitlement mapping: plan key, audience, Stripe product
  ID, role mismatch denial, invite-only denial, and subscription cancellation.
- Role switching and onboarding: buyer/seller/agent/developer/professional
  self-service, investor/institutional denial, in-progress sentinel recovery,
  and route redirect behavior.
- Open-house registration and offer flow: contact/ID consent, slot capacity,
  owner approval, proof-of-funds controls, direct insert/update denial, and
  concurrent capacity races.
- Firesale submission and investor reservation: KAEK/format validation,
  proof upload policy, active subscription requirement, and duplicate
  reservation races.
- Professional directory monetization: free users see contact details only;
  Pro-only actions are denied and tested at UI and server/data boundaries.
- AI quota and parsing: signed-in access, free cap of 5 where applicable,
  provider quota failure, invalid JSON fallback, and no paid provider call when
  quota reservation fails.

### P0 — Revenue / trust paths
- `src/pages/PropertyDetail.tsx` (has partial coverage — extend)
- `src/pages/Messages.tsx`
- `src/pages/Dashboard.tsx`
- `src/pages/Pricing.tsx`
- `src/pages/Signup.tsx` / `src/pages/Login.tsx`
- `src/pages/Onboarding.tsx`

### P1 — Detail pages
- `src/pages/NewBuildDetail.tsx`
- `src/pages/OpenHouseDetail.tsx`
- `src/pages/ProjectDetail.tsx`
- `src/pages/ProfessionalProfile.tsx`

### P2 — Dashboard tabs
- `src/pages/dashboard/*Tab.tsx`: keep smoke coverage, then add behavior tests
  for write actions, empty/error states, and role-specific visibility. Do not
  treat smoke coverage as proof that a tab's business workflow is safe.

## Large-file decomposition roadmap

Smaller files are cheaper to test, so this list moves in lockstep with the
coverage roadmap above. Files are ranked by source-bytes (excluding
`src/components/ui/` and data dumps). Threshold: >30 kB raw is a
candidate. Worked example: `src/pages/dashboard/MyListingsSection.tsx`
was extracted from `Dashboard.tsx` in this cycle, taking it from
57.7 kB → 50.5 kB. Follow that pattern.

| File | Size (kB) | Suggested extraction |
|------|-----------|----------------------|
| `src/pages/Listings.tsx`              | 45.4 | filter rail, results grid, map toggle |
| `src/pages/OpenHouseDetail.tsx`       | 41.9 | registration dialog state, offers panel |
| `src/pages/Auctions.tsx`              | 39.9 | auction filters, listings strip |
| `src/pages/AdminPricing.tsx`          | 38.1 | per-tier editor, plan diff modal |
| `src/pages/ProjectDetail.tsx`         | 38.0 | unit grid, media carousel, lead form |
| `src/pages/CreateNewBuildingListing.tsx` | 37.4 | unit picker, media uploader |
| `src/pages/NewBuildDetail.tsx`        | 35.9 | gallery, unit selector, lead form |
| `src/pages/Pricing.tsx`               | 34.6 | audience tab content |
| `src/pages/PropertyDetail.tsx`        | 32.1 | sidebar agent card, similar listings |
| `src/pages/ProfessionalProfile.tsx`   | 30.8 | review list, booking section |

Extraction recipe (mirrors `MyListingsSection`):

1. Identify a self-contained tab/region with a clear data boundary.
2. Move the related hooks (`use*`), local state, and helpers *into* the
   new component — React Query dedupes by key, so the parent can keep
   reading the same data without an extra request.
3. Pass only what the parent already derives for routing or guards
   (e.g. `bioType`, `role`).
4. Replace `window.confirm` with `ConfirmDialog` while you're there.
5. Add a smoke test (renders without throwing) before the extraction
   PR, so coverage is measurably +1 file.

## Running tests

```powershell
# Unit + component
npm test                  # single run
npm run test:watch        # watch mode

# Coverage report (HTML in ./coverage/)
npm run test:coverage
start ./coverage/index.html

# Strict audit coverage inventory
npm run test:audit-coverage

# E2E (requires dev server on :8080 or auto-starts per playwright.config.ts)
npm run test:e2e
npm run test:e2e:ui       # Playwright inspector UI

# Edge-function tests (requires Deno installed locally)
npm run test:deno
```

## Writing tests

- Co-locate unit tests as `src/**/*.test.ts` or use `src/test/*.test.ts`.
- Use `src/test/utils.tsx` `renderWithProviders()` for component tests needing
  router/query providers.
- Mock `useAuth` per-test via `vi.mocked(useAuth).mockReturnValue(...)`.
- For DB mutation hooks, see `src/test/idor.mutations.test.ts` for the
  chainable-supabase-mock pattern.

## CI recommendation

```yaml
- run: npm ci
- run: npm run lint
- run: npx tsc -p tsconfig.app.json --noEmit
- run: npm run test:audit-coverage
- run: npm audit --omit=dev --audit-level=high
```
