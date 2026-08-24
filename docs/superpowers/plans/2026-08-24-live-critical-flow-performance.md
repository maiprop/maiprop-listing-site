# Live Critical-Flow Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` to implement this plan task by
> task, with TDD and a fresh task review after every implementation.

**Goal:** Release the existing materialized catalogue architecture and add four
bounded hardenings that reduce repeated work and blank waiting in the measured
critical flows.

**Architecture:** Keep the public Pages Functions API as the only catalogue
authority; retain bounded caller deadlines while allowing a successful late
producer to seed Cloudflare Cache API; coalesce same-user Auth hydration in the
provider; reuse centralized React Query invalidation after wizard mutations;
use fresh embedded data only as temporary unfiltered placeholder content.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, Supabase JS/Postgres,
Cloudflare Pages Functions/Cache API, Vitest, Playwright, GitHub Actions.

**Spec:**
`docs/superpowers/specs/2026-08-24-live-critical-flow-performance.md`

## Global Constraints

- The public Pages Functions API remains the sole authority for public
  catalogue data. Never add a browser-to-Supabase fallback.
- Preserve the existing caller-facing producer and cache-read deadlines.
- Cache only successful, business-valid responses; never cache 4xx/5xx,
  `no-store`, or expired responses.
- Same-user profile requests may coalesce only while in flight. A later
  explicit refresh must make a new request, and a different user's generation
  must never reuse or apply the prior user's result.
- Listing query invalidation must not delay successful navigation.
- Embedded catalogue data is placeholder-only, at most twelve rows, and may be
  used only for an otherwise-unfiltered first page.
- No speculative database migration, dependency upgrade, index removal,
  release-policy bypass, or unrelated refactor belongs in these tasks.
- All implementation uses TDD: capture RED before implementation and GREEN
  after implementation in the task report.
- Use the pinned project runtime for every Node/npm command:
  `npm run runtime -- <command>`.

---

## Task 1: Seed the edge cache when a timed-out producer later succeeds

**Files:**

- Modify: `functions/api/public/_cache.ts`
- Modify: `functions/api/public/public-api.test.ts`

### Step 1: Add the failing late-success test

Extend the cache deadline tests with a controlled producer and a context whose
`waitUntil` stores background promises. The test must prove this sequence:

1. `cachedJson` returns a 503 within the existing deadline.
2. No cache entry exists at the moment of the timeout response.
3. The underlying producer later resolves with a successful JSON response.
4. Awaiting the registered background tasks seeds fresh and stale entries.
5. A second `cachedJson` call for the same cache key returns `HIT` and does not
   invoke its supplied producer.

Add sibling assertions that a late 503 and a rejected late producer do not seed
the cache and do not cause an unhandled rejection.

Run:

```powershell
npm run runtime -- npm test -- functions/api/public/public-api.test.ts -t "late producer" --maxWorkers=1 --reporter=verbose
```

Expected RED: the second call is not `HIT` or invokes the second producer,
because the current timeout wrapper discards the underlying successful result.

### Step 2: Expose the underlying producer after the deadline

Refactor the timeout helper to return the caller response plus an optional late
producer promise. The shape may be named differently, but it must preserve this
contract:

```ts
type ProducerDeadlineResult = {
  response: Response;
  lateResponse?: Promise<Response>;
};
```

When no positive producer deadline is configured, await and return the normal
response. When the producer wins the race, return it normally. When the
deadline wins, return `upstreamUnavailable()` and retain the original producer
promise as `lateResponse`.

### Step 3: Seed a cacheable late response in the background

Inside `produceAndCache`, if `lateResponse` exists:

- register one guarded background promise with `ctx.waitUntil`;
- await the late response without extending the current caller;
- apply the same cache/security headers used for a normal successful producer;
- read the body once and call the existing fresh-and-stale seed helper;
- skip non-OK, expired, and `no-store` responses;
- contain and log rejection;
- store that background promise in `cacheSeedState.promise`, so the in-flight
  key is not cleared before the late seed settles (the existing TTL remains the
  ultimate bound).

Do not duplicate the cache-policy rules. Extract a small helper if necessary so
normal and late success share one implementation.

### Step 4: Run focused and Functions checks

```powershell
npm run runtime -- npm test -- functions/api/public/public-api.test.ts --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck:functions
```

Expected GREEN: the full public API test file passes, Functions type checking
passes, and test output has no unhandled rejection.

### Step 5: Commit

```powershell
git add functions/api/public/_cache.ts functions/api/public/public-api.test.ts
git commit -m "fix: retain successful late catalogue responses"
```

---

## Task 2: Coalesce same-user profile hydration

**Files:**

- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/test/AuthContext.test.tsx`

### Step 1: Add failing concurrency tests

Add tests that hold both the `profiles` and `organization_memberships` queries
open, emit two same-user auth callbacks, and then release the queries. Assert:

- each table chain is created once for that user;
- both callers settle through the shared result;
- the final profile and authorization fingerprint are correct;
- `profileLoading` becomes false.

Add a second test that switches from user A to user B while A is in flight and
proves B starts a new request and A's later result cannot update B. Add a third
assertion that an explicit refresh after settlement performs a new read.

Run:

```powershell
npm run runtime -- npm test -- src/test/AuthContext.test.tsx -t "coalesces same-user profile hydration" --maxWorkers=1 --reporter=verbose
```

Expected RED: the current provider starts duplicate profile/membership query
sets.

### Step 2: Add an in-flight profile slot

Near the existing profile generation refs, add a ref with the minimum state
needed to share work:

```ts
const profileFetchInProgressRef = useRef<{
  userId: string;
  promise: Promise<Profile | null>;
} | null>(null);
```

Convert `fetchProfile` from an always-new async function into a callback that:

1. returns the existing promise when its `userId` matches;
2. otherwise creates the existing generation-guarded work immediately;
3. assigns the promise before any awaited query can settle;
4. clears only its own ref entry in `finally`;
5. preserves stale-user/generation rejection and authorization transition
   semantics.

On provider cleanup, invalidate the generation and clear the in-flight slot.
Do not couple profile and subscription promises.

### Step 3: Run focused tests and app type checking

```powershell
npm run runtime -- npm test -- src/test/AuthContext.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
```

Expected GREEN: the Auth provider tests and app type checking pass.

### Step 4: Commit

```powershell
git add src/contexts/AuthContext.tsx src/test/AuthContext.test.tsx
git commit -m "perf: coalesce profile hydration requests"
```

---

## Task 3: Invalidate catalogue queries after wizard mutations

**Files:**

- Modify: `src/hooks/useListingForm.ts`
- Modify: `src/test/useListingForm.test.tsx`

### Step 1: Add failing success and failure tests

Mock `invalidatePublicCatalogueQueries`. Extend the existing create and edit
submission tests to assert it is called once with the hook's QueryClient and
the saved listing ID after all listing-image reconciliation succeeds. Add a
failure assertion proving it is not called when the listing mutation or image
mutation fails.

Run:

```powershell
npm run runtime -- npm test -- src/test/useListingForm.test.tsx -t "invalidates catalogue" --maxWorkers=1 --reporter=verbose
```

Expected RED: the wizard currently bypasses the centralized invalidation.

### Step 2: Reuse the centralized invalidation helper

In `useListingForm`:

- obtain the QueryClient with `useQueryClient()`;
- import `invalidatePublicCatalogueQueries`;
- after the create/update and image reconciliation are fully successful, call
  `void invalidatePublicCatalogueQueries(queryClient, savedListing.id)` before
  toast/navigation;
- include `queryClient` in the callback dependencies.

Do not await invalidation, duplicate the key list, or invalidate after failure.

### Step 3: Run focused tests and app type checking

```powershell
npm run runtime -- npm test -- src/test/useListingForm.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
```

Expected GREEN: the hook tests and app type checking pass.

### Step 4: Commit

```powershell
git add src/hooks/useListingForm.ts src/test/useListingForm.test.tsx
git commit -m "fix: refresh catalogue state after listing publish"
```

---

## Task 4: Paint a mixed placeholder for an unfiltered catalogue

**Files:**

- Modify: `src/hooks/useListings.ts`
- Modify: `src/test/useListings.publicApi.test.tsx`

### Step 1: Add failing placeholder tests

Add a test where the canonical API promise remains pending and
`readInitialListingsPage` returns fresh sale and rent pages containing
interleaved timestamps and one duplicate ID. Render
`useListingsPaginated({})` and assert:

- up to twelve unique rows paint immediately;
- rows are newest-first with listing ID as deterministic tie-breaker;
- `isPlaceholderData` is true;
- the canonical unfiltered public API request still starts once.

Add or extend tests proving no mixed placeholder is used for a city, property,
price, feature, explicit type, non-default sort, later page/cursor, expired
snapshot, or two empty pages.

Run:

```powershell
npm run runtime -- npm test -- src/test/useListings.publicApi.test.tsx -t "mixed placeholder" --maxWorkers=1 --reporter=verbose
```

Expected RED: the current helper returns no placeholder without an explicit
sale/rent type.

### Step 2: Build the presentation-only mixed page

Generalize the default-snapshot eligibility helper so an otherwise-empty filter
object may select a mixed placeholder. For that case:

1. read the sale and rent embedded first pages;
2. combine and deduplicate by non-empty listing ID;
3. sort descending by valid `created_at`, then ascending by ID for a stable tie;
4. take twelve;
5. derive `hasMore` from either source page and set `nextCursor: null`, `page: 1`,
   `pageSize: 12`, and `offset: 0`;
6. normalize rows through `normalizeListingWithJoins`;
7. return `undefined` if no row survives.

Keep explicit sale/rent behavior unchanged. Treat only absent sort or the
existing default sort as eligible. Do not write embedded data into the query
cache as authoritative `initialData`.

### Step 3: Run focused tests and app type checking

```powershell
npm run runtime -- npm test -- src/test/useListings.publicApi.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
```

Expected GREEN: public catalogue hook tests and app type checking pass.

### Step 4: Commit

```powershell
git add src/hooks/useListings.ts src/test/useListings.publicApi.test.tsx
git commit -m "perf: paint the default catalogue from fresh snapshots"
```

---

## Task 5: Verify, review, merge, stage, deploy, and retime

**Files:**

- Verify only unless a failing gate identifies an in-scope defect.
- Append release evidence to the repository's existing evidence destinations
  only when the generating workflow produces accepted, exact-SHA artifacts.

### Step 1: Run deterministic local verification

Run focused files serially first, then the repository gates:

```powershell
npm run runtime -- npm test -- functions/api/public/public-api.test.ts src/test/AuthContext.test.tsx src/test/useListingForm.test.tsx src/test/useListings.publicApi.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
npm run runtime -- npm run typecheck:functions
npm run runtime -- npm run lint
npm run runtime -- npm run build
npm run runtime -- npm run check:bundle-size
npm run runtime -- npm run lint:migrations
npm run runtime -- npm run check:release-safety
```

Run the complete Vitest suite. Because this Windows OneDrive checkout produced
parallel timeout flakes while each exact failure passed in isolation, any full
suite failure must be rerun once with its exact file serially and the result
recorded. Never relabel an assertion failure as contention.

```powershell
npm run runtime -- npm test -- --reporter=dot
```

### Step 2: Run final whole-branch review

Generate a branch diff package from the pre-plan base through HEAD and dispatch
a fresh high-capability reviewer. Resolve every Critical/Important finding and
re-review only the fix diff. Ledger non-blocking observations for the release
report.

### Step 3: Push and merge through the protected path

```powershell
git push -u origin codex/live-flow-performance
```

Create or update the pull request, wait for all required checks, and merge only
when branch protection permits. Do not push directly through a rejected
protection rule. Fetch and record the exact 40-character `origin/main` SHA after
merge.

### Step 4: Stage the exact SHA

Use the normal workflows in order:

1. immutable release candidate;
2. exact-SHA isolated staging release;
3. independent production approval.

Require all preconditions in `docs/PRODUCTION_RELEASE_RUNBOOK.md`, including
snapshot migration/application, N-1 compatibility, signed schema evidence,
public API latency/payload checks, exact-SHA browser proof, CWV/query budgets,
security gates, and stable staging-origin parity.

### Step 5: Deploy the exact SHA

Dispatch **Deploy Production Release** from `main` with:

- `release_sha`: the exact full merged SHA;
- confirmation: `DEPLOY_PRODUCTION_RELEASE`.

Monitor the serialized database, Edge, and Cloudflare jobs and retain the
attempt-qualified aggregate. Stop on any failed lease, attestation, migration,
compatibility, or rollback signal.

### Step 6: Verify identity and retime live behavior

Verify both release endpoints and then repeat the timed journey:

```powershell
npm run runtime -- npm run release:verify-live-marker -- --base-url https://portal.maiprop.co --sha <FULL_SHA>
npm run runtime -- npm run check:production-deploy -- --base-url https://portal.maiprop.co
npm run runtime -- npm run diagnose:public-listings-latency -- --base-url https://portal.maiprop.co
```

Capture cold and warm landing/catalogue, sign-up, sign-in, wizard navigation,
no-photo publish, detail render, publication lag, and public propagation. Report
agent elapsed time as well as each action duration. Compare each result to the
spec budgets; do not claim the site is smooth solely because deployment passed.

### Step 7: Cleanup and report

Delete the exact tagged QA listing through an authorized app/admin path after
visibility verification, and retire the disposable QA account through the
approved Auth admin path if available. Report what was removed and whether any
fixture remains.

Commit only accepted generated evidence, then publish the final outcome with:

- branch/PR/merge SHA;
- staging and production workflow run identities;
- release marker parity;
- before/after timing table;
- gate results and any isolated timing-flake rulings;
- remaining external or policy gates;
- prioritized sustaining actions from the spec.
