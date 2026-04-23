# Testing Strategy

## Test tooling

| Tool | Purpose | Command |
|------|---------|---------|
| **Vitest** | Unit + component tests (jsdom) | `npm test` |
| **@vitest/coverage-v8** | V8-based coverage reports | `npm run test:coverage` |
| **Playwright** | E2E browser tests | `npm run test:e2e` |
| **Deno test** | Edge-function tests | `npm run test:deno` |

## Current coverage baseline (2026-04-16)

| Metric | Current | Threshold | Target Q3 | Target Q4 |
|--------|---------|-----------|-----------|-----------|
| Lines       | ~11%  | 11% | 30% | 50% |
| Statements  | ~11%  | 11% | 30% | 50% |
| Functions   | ~24%  | 22% | 35% | 55% |
| Branches    | ~21%  | 20% | 30% | 45% |

## Priority coverage gaps

Ranked by business impact — files at **0%** that should get tests first:

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
- `src/pages/dashboard/*Tab.tsx` (9 files, all 0%)

## Running tests

```powershell
# Unit + component
npm test                  # single run
npm run test:watch        # watch mode

# Coverage report (HTML in ./coverage/)
npm run test:coverage
start ./coverage/index.html

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
- run: npm run test:coverage
- run: npm audit --omit=dev --audit-level=high
```
