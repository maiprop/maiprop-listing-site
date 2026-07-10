# Instant Listings And Card Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make listing cards visually consistent across homepage/listing surfaces and make public listing results paint quickly while preserving the 40-listing page contract.

**Architecture:** Prove the exact bottleneck before changing behavior. Then fix the public API cache/in-flight layer, verify the Supabase query path, standardize card view-model mapping, and add fast first-paint behavior that renders a small above-the-fold set before background-filling the full 40 rows.

**Tech Stack:** React, TypeScript, TanStack Query, Cloudflare Pages Functions, Supabase PostgREST, Vitest, Playwright, Node diagnostics.

## Global Constraints

- Preserve current public user flows and URLs.
- Keep sale/rent listing pages capable of loading up to 40 listings per page.
- First paint should show 8-12 useful listing cards as soon as possible.
- Do not show auctions in the homepage omnibox.
- No mock listing/profile data may be introduced.
- No paid-provider behavior change is required.
- Do not hide a broken `/api/public/listings?...limit=40` endpoint behind UI fallback; the endpoint must become reliable.
- All changes must be covered by focused tests before broad gates.

---

## Current Evidence

Observed live timings on `https://portal.maiprop.co`:

- Static homepage HTML returned around `75ms`.
- Static listings HTML returned, but sometimes took around `2.5s`.
- `/api/public/listings?listing_type=sale&page=1&limit=8` returned quickly.
- `/api/public/listings?listing_type=sale&page=1&limit=39` returned around `2.6s`.
- `/api/public/listings?listing_type=sale&page=1&limit=40` timed out after `25s` with no HTTP status.
- `/api/public/homepage?section=featured` timed out in repeated curl checks.

Interpretation:

- The first bottleneck is not card CSS.
- The slow path is the public API/data/cache layer.
- The exact default UI request shape (`limit=40` / `pageSize=40`) must be diagnosed and fixed.
- First-paint optimization is still valuable, but it must not mask a broken public endpoint.

---

## File Structure

- Create `scripts/diagnose-public-listings-latency.mjs`: repeatable live-safe endpoint timing diagnostics.
- Modify `functions/api/public/_cache.ts`: non-blocking cache writes, bounded in-flight cleanup, cache-state consistency.
- Modify `functions/api/public/listings.ts`: cache-version bump, compact list DTO review, optional query-shape refinements.
- Modify `functions/api/public/homepage.ts`: include missing card fields for homepage cards.
- Modify `src/lib/homepageListings.ts`: type homepage API rows accurately and normalize homepage row data.
- Create or modify `src/lib/homepageListingToCard.ts`: map homepage rows into the same `PropertyCard` contract as listings.
- Modify `src/components/index/FeaturedPropertiesSection.tsx`: use the shared homepage card mapper.
- Modify `src/hooks/useListings.ts`: fast first paint with full 40-row fill.
- Modify `src/pages/Listings.tsx`: render partial first paint honestly and avoid false empty states.
- Modify `scripts/check-production-deploy-public-api.mjs`: test real UI endpoint shapes and latency budgets.
- Modify `scripts/check-production-deploy.test.mjs`: cover deploy-check latency and JSON-shape assertions.
- Modify focused tests under `src/test/`.

---

## Task 0: Prove The Stall Layer Before Fixing

**Files:**
- Create: `scripts/diagnose-public-listings-latency.mjs`
- Create: `scripts/diagnose-public-listings-latency.test.mjs`

**Interfaces:**
- Produces: `runPublicListingsLatencyDiagnostics(baseUrl: string, options?: { timeoutMs?: number; iterations?: number }): Promise<DiagnosticResult[]>`
- DiagnosticResult:

```ts
type DiagnosticResult = {
  label: string;
  url: string;
  ok: boolean;
  status: number | null;
  ms: number;
  contentType: string | null;
  cacheState: string | null;
  cfRay: string | null;
  bytes: number;
  error: string | null;
};
```

- [ ] **Step 1: Create diagnostic script**

Implement `scripts/diagnose-public-listings-latency.mjs` with this endpoint matrix:

```js
const paths = [
  [ "limit-1", "/api/public/listings?limit=1" ],
  [ "sale-limit-8", "/api/public/listings?listing_type=sale&page=1&limit=8" ],
  [ "sale-limit-12", "/api/public/listings?listing_type=sale&page=1&limit=12" ],
  [ "sale-limit-24", "/api/public/listings?listing_type=sale&page=1&limit=24" ],
  [ "sale-limit-39", "/api/public/listings?listing_type=sale&page=1&limit=39" ],
  [ "sale-limit-40", "/api/public/listings?listing_type=sale&page=1&limit=40" ],
  [ "sale-pageSize-40", "/api/public/listings?listing_type=sale&page=1&pageSize=40" ],
  [ "sale-limit-40-cache-bust", `/api/public/listings?listing_type=sale&page=1&limit=40&diag=${Date.now()}` ],
  [ "rent-limit-12", "/api/public/listings?listing_type=rent&page=1&limit=12" ],
  [ "rent-limit-40", "/api/public/listings?listing_type=rent&page=1&limit=40" ],
  [ "homepage-featured", "/api/public/homepage?section=featured" ],
];
```

The script must:

```js
const started = performance.now();
const response = await fetch(url, {
  headers: {
    accept: "application/json",
    "user-agent": "maiprop-public-listings-latency-diagnostic/1.0",
  },
  signal: AbortSignal.timeout(timeoutMs),
});
const text = await response.text();
```

It must print a table and exit non-zero if any endpoint times out.

- [ ] **Step 2: Add parser/unit test**

In `scripts/diagnose-public-listings-latency.test.mjs`, mock `fetch` and assert:

```js
expect(results[0]).toMatchObject({
  label: "sale-limit-40",
  ok: false,
  status: null,
  error: expect.stringMatching(/timeout|aborted/i),
});
```

- [ ] **Step 3: Run local diagnostic test**

Run:

```bash
npx vitest run scripts/diagnose-public-listings-latency.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run live diagnostic once before any implementation**

Run:

```bash
node scripts/diagnose-public-listings-latency.mjs https://portal.maiprop.co --timeout-ms=8000 --iterations=2
```

Expected: produce a table showing which endpoint shapes fail, including `X-Maiprop-Cache` and `CF-RAY` when present.

- [ ] **Step 5: Record conclusion in PR body**

Record whether the stall is:

```text
cache-key specific
response-size specific
Supabase query specific
Cloudflare function/cache write specific
network/transient
```

Do not proceed to Task 3 until this conclusion is written down.

---

## Task 1: Baseline Regression Tests For Card Consistency

**Files:**
- Modify: `src/test/FeaturedPropertiesSection.mapping.test.tsx`
- Modify: `src/components/index/FeaturedPropertiesSection.tsx`
- Modify: `src/lib/homepageListings.ts`
- Create: `src/lib/homepageListingToCard.ts`

**Interfaces:**
- Consumes: `PropertyCard` props from `src/components/PropertyCard.tsx`.
- Produces: `homepageListingToCard(l: HomepageListing): Property`.

- [ ] **Step 1: Add failing test for Spotlight card parity**

Add a test case that renders `FeaturedPropertiesSection` with a row containing:

```ts
{
  id: "listing-spotlight-1",
  title: "Glifada Loft",
  address: "11 Dimarchou Aggelou Metaxa",
  city: "Dimos Glyfadas",
  price: 275000,
  price_per_sqm: 7051,
  sqm: 39,
  floor: 1,
  total_floors: 4,
  year_built: 2026,
  listing_type: "sale",
  property_type: "apartment",
  views_count: 110,
  is_featured: true,
  priority_placement: 10,
  has_video_tour: true,
  has_virtual_tour: true,
  cover_image_url: "https://example.test/glifada.jpg",
  profiles: {
    display_name: "K R",
    avatar_url: null,
    verified: false
  }
}
```

Expected assertions:

```ts
expect(screen.getByText(/Spotlight/i)).toBeInTheDocument();
expect(screen.getByText("360°")).toBeInTheDocument();
expect(screen.getByText("110")).toBeInTheDocument();
expect(screen.getByText("K R")).toBeInTheDocument();
```

- [ ] **Step 2: Run failing test**

Run:

```bash
npx vitest run src/test/FeaturedPropertiesSection.mapping.test.tsx
```

Expected: FAIL because homepage mapping currently drops featured/media/agent fields.

- [ ] **Step 3: Create homepage card mapper**

Create `src/lib/homepageListingToCard.ts`:

```ts
import type { Property } from "@/components/PropertyCard";
import { calculatePricePerSqm } from "@/lib/priceCalculations";
import { homepageListingImages, type HomepageListing } from "@/lib/homepageListings";
import { getNewBuildCardSummary } from "@/lib/newBuildCardSummary";

export function homepageListingToCard(l: HomepageListing): Property {
  const isProjectNewBuild = l.listing_type === "new_build" && Boolean(l.project_id);
  const projectName = isProjectNewBuild ? l.project?.name?.trim() || l.projects?.name?.trim() || "" : "";
  const listingType = l.listing_type === "new_build" && !isProjectNewBuild ? "sale" : l.listing_type ?? "sale";

  return {
    id: l.id,
    title: projectName || l.title,
    address: l.address || l.city,
    city: l.city,
    price: Number(l.price),
    pricePerSqm: calculatePricePerSqm({
      price: l.price,
      sqm: l.sqm,
      storedPricePerSqm: l.price_per_sqm,
    }) ?? undefined,
    bedrooms: l.bedrooms ?? undefined,
    bathrooms: l.bathrooms ?? undefined,
    sqm: Number(l.sqm),
    floor: l.floor ?? undefined,
    totalFloors: l.total_floors ?? undefined,
    yearBuilt: l.year_built ?? undefined,
    energyClass: l.energy_class ?? undefined,
    images: homepageListingImages(l),
    type: l.property_type ?? "apartment",
    listingType,
    aiScore: l.ai_score ?? undefined,
    views: l.views_count ?? undefined,
    tags: l.tags || [],
    isFeatured: Boolean(l.is_featured),
    hasVideo: Boolean(l.has_video_tour),
    hasVirtualTour: Boolean(l.has_virtual_tour),
    agent: l.profiles
      ? {
          name: l.profiles.display_name || "Owner",
          avatar: l.profiles.avatar_url ?? undefined,
          verified: Boolean(l.profiles.verified),
        }
      : undefined,
    isPreSale: isProjectNewBuild,
    constructionStatus: l.construction_status ?? undefined,
    ...getNewBuildCardSummary(l),
  };
}
```

- [ ] **Step 4: Use mapper in homepage section**

In `FeaturedPropertiesSection.tsx`, replace manual prop construction with:

```tsx
import { homepageListingToCard } from "@/lib/homepageListingToCard";
```

Then:

```tsx
<PropertyCard
  key={l.id}
  imagePriority={index < 4}
  deferOffscreenRendering={false}
  property={homepageListingToCard(l)}
/>
```

Do not add the listings-page compare button to homepage cards.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npx vitest run src/test/FeaturedPropertiesSection.mapping.test.tsx src/test/PropertyCard.behavior.test.tsx
```

Expected: PASS.

---

## Task 2: Include Missing Card Fields In Public Homepage API

**Files:**
- Modify: `functions/api/public/homepage.ts`
- Modify: `scripts/check-production-deploy-public-api.mjs`
- Modify: `scripts/check-production-deploy.test.mjs`

**Interfaces:**
- Consumes: Supabase public listing rows.
- Produces: homepage API rows with enough fields for `homepageListingToCard()`.

- [ ] **Step 1: Add API contract test**

Extend public API tests so `/api/public/homepage?section=featured` fixture responses include these fields:

```ts
[
  "is_featured",
  "priority_placement",
  "has_video_tour",
  "has_virtual_tour",
  "views_count",
  "owner_id"
]
```

If `profiles` is returned, assert:

```ts
expect(row.profiles).toEqual(expect.objectContaining({
  display_name: expect.any(String),
}));
```

- [ ] **Step 2: Run test to verify current contract gap**

Run:

```bash
npx vitest run scripts/check-production-deploy.test.mjs
```

Expected: FAIL until API fixture/mock and runtime contract are aligned.

- [ ] **Step 3: Extend homepage featured select**

In `functions/api/public/homepage.ts`, ensure the featured select includes:

```ts
"is_featured",
"priority_placement",
"has_video_tour",
"has_virtual_tour",
"owner_id"
```

Add small-owner profile enrichment only for the returned featured rows:

```ts
const ownerIds = rows.map((row) => row.owner_id).filter((id): id is string => typeof id === "string");
const profiles = await fetchOwnerProfiles(env, ownerIds);
return rows.map((row) => ({
  ...row,
  profiles: row.owner_id ? profiles.get(row.owner_id) ?? null : null,
}));
```

Use the same `profiles_public` field set as `functions/api/public/listings.ts`:

```ts
"user_id,display_name,avatar_url,role,verified"
```

- [ ] **Step 4: Run public API tests**

Run:

```bash
npx vitest run scripts/check-production-deploy.test.mjs scripts/local-public-api-fixtures.test.mjs
```

Expected: PASS.

---

## Task 3: Fix Cloudflare Public API Cache Stall

**Files:**
- Modify: `functions/api/public/_cache.ts`
- Modify: `functions/api/public/listings.ts`
- Create or modify: `functions/api/public/_cache.test.ts`

**Interfaces:**
- Consumes: `cachedJson(ctx, cacheKey, producer, cache)`.
- Produces: API responses that are not blocked by cache writes and cannot keep a bad in-flight promise forever.

- [ ] **Step 1: Add failing cache write test**

Create a test that models a cache whose `put()` promise never resolves:

```ts
it("returns fresh response without waiting for cache put", async () => {
  const never = new Promise<void>(() => undefined);
  const cacheApi = {
    match: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockReturnValue(never),
  };
  vi.stubGlobal("caches", { default: cacheApi });

  const ctx = { waitUntil: vi.fn() } as unknown as PublicApiCtx;
  const response = await cachedJson(
    ctx,
    new URL("https://cache.test/listings"),
    async () => jsonResponse({ ok: true }),
    { producerTimeoutMs: 1000 },
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ok: true });
  expect(ctx.waitUntil).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run failing cache test**

Run:

```bash
npx vitest run functions/api/public/_cache.test.ts
```

Expected: FAIL if `cachedJson()` waits for `cacheApi.put()`.

- [ ] **Step 3: Make cache writes non-blocking**

Change `putFreshAndStale()` so it schedules guarded cache writes and returns immediately:

```ts
const guardedPut = putPromise.catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[public-api] cache seed failed for ${cacheRequest.url}: ${message}`);
});
ctx.waitUntil?.(guardedPut);
```

Remove response-path blocking:

```ts
// Remove this:
await guardedPut;
```

- [ ] **Step 4: Add bounded in-flight cleanup**

Add:

```ts
function scheduleInflightCleanup(cacheId: string, promise: Promise<Response>, timeoutMs: number): void {
  const timer = setTimeout(() => {
    if (inflightCacheMisses.get(cacheId) === promise) inflightCacheMisses.delete(cacheId);
  }, timeoutMs);
  promise.finally(() => clearTimeout(timer));
}
```

Call it whenever setting:

```ts
inflightCacheMisses.set(cacheId, pending);
scheduleInflightCleanup(cacheId, pending, (cacheProducerTimeoutMs(cache) ?? 5000) + 1000);
```

- [ ] **Step 5: Bump listing public API cache version**

In `functions/api/public/listings.ts`, change:

```ts
const LISTINGS_CACHE_VERSION = "default-card-v4";
```

to:

```ts
const LISTINGS_CACHE_VERSION = "default-card-v5-nonblocking-cache";
```

This avoids reusing any previously bad Cloudflare cache key for the exact `limit=40` shape.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run functions/api/public/_cache.test.ts scripts/check-production-deploy.test.mjs
```

Expected: PASS.

---

## Task 4: Verify Supabase Query Shape And Compact DTO

**Files:**
- Modify: `functions/api/public/listings.ts`
- Modify: `scripts/check-production-deploy-public-api.mjs`
- Modify: `src/test/useListings.publicApi.test.tsx`

**Interfaces:**
- Consumes: public list-card DTO fields.
- Produces: bounded list response payload that excludes detail-only fields.

- [ ] **Step 1: Audit current list-card fields**

Confirm `functions/api/public/listings.ts` only selects fields needed by `PropertyCard` list cards:

```ts
id,
owner_id,
created_at,
title,
address,
city,
price,
price_per_sqm,
bedrooms,
bathrooms,
sqm,
floor,
total_floors,
year_built,
energy_class,
cover_image_url,
property_type,
listing_type,
open_house_date,
open_house_transaction_type,
auction_date,
auction_starting_bid,
ai_score,
views_count,
tags,
has_video_tour,
has_virtual_tour,
is_featured,
priority_placement,
is_pre_sale,
construction_status,
latitude,
longitude,
has_parking,
has_pool,
has_elevator,
has_garden,
has_smart_home,
listing_images(url,sort_order)
```

Remove `walkability_score`, `safety_score`, and `noise_score` from the list endpoint unless a visible card element needs them. Keep them on detail/AI endpoints.

- [ ] **Step 2: Add response-size assertion**

In `scripts/check-production-deploy-public-api.mjs`, record response byte length for `limit=40` and fail if it exceeds:

```ts
const PUBLIC_LISTINGS_LIMIT40_MAX_BYTES = 180_000;
```

This keeps list DTOs compact and prevents silent payload creep.

- [ ] **Step 3: Add URL contract assertion**

In `src/test/useListings.publicApi.test.tsx`, assert the list page URL includes `limit=40` only for the full fill request and not for first paint after Task 5:

```ts
expect(firstPaintPath).toContain("pageSize=12");
expect(fullFillPath).toContain("pageSize=40");
```

- [ ] **Step 4: Run focused tests**

Run:

```bash
npx vitest run src/test/useListings.publicApi.test.tsx scripts/check-production-deploy.test.mjs
```

Expected: PASS.

---

## Task 5: Make Listings First Paint Fast While Preserving 40-Row Page

**Files:**
- Modify: `src/hooks/useListings.ts`
- Modify: `src/pages/Listings.tsx`
- Modify: `src/test/useListings.publicApi.test.tsx`
- Modify: `src/test/Listings.performance.test.ts`
- Modify: `src/test/Listings.interactions.test.tsx`

**Interfaces:**
- Consumes: `fetchListingsPage(filters, page, pageSize, options, signal)`.
- Produces: above-the-fold listing cards from a small request, then background-fill toward 40 rows.

- [ ] **Step 1: Add failing hook test**

Update `src/test/useListings.publicApi.test.tsx`:

```ts
expect(publicApiMock.mock.calls[0][0]).toContain("pageSize=12");
expect(publicApiMock.mock.calls.some(([path]) => String(path).includes("pageSize=40"))).toBe(true);
```

- [ ] **Step 2: Run failing hook test**

Run:

```bash
npx vitest run src/test/useListings.publicApi.test.tsx
```

Expected: FAIL because current first request uses `PAGE_SIZE = 40`.

- [ ] **Step 3: Add first-paint constants**

In `src/hooks/useListings.ts`:

```ts
export const INITIAL_LISTINGS_PAGE_SIZE = 12;
export const PAGE_SIZE = 40;
```

- [ ] **Step 4: Implement first-paint query path**

For public catalog routes, call:

```ts
fetchListingsPage(filters, 1, INITIAL_LISTINGS_PAGE_SIZE, options, signal)
```

first, then prefetch/fill:

```ts
fetchListingsPage(filters, 1, PAGE_SIZE, options, signal)
```

Use TanStack Query cache update so the UI upgrades from 12 to 40 without flicker.

- [ ] **Step 5: Avoid false empty state**

In `src/pages/Listings.tsx`, the empty state must require:

```ts
!isLoading && !isFetching && filtered.length === 0
```

Do not show "No properties found" while first-paint or full-fill requests are active.

- [ ] **Step 6: Run focused tests**

Run:

```bash
npx vitest run src/test/useListings.publicApi.test.tsx src/test/Listings.performance.test.ts src/test/Listings.interactions.test.tsx
```

Expected: PASS.

---

## Task 6: Add Real Production Endpoint Coverage

**Files:**
- Modify: `scripts/check-production-deploy-public-api.mjs`
- Modify: `scripts/check-production-deploy.test.mjs`
- Modify: `.github/workflows/reusable-cloudflare-production-deploy.yml` only if the script is not already called there.

**Interfaces:**
- Consumes: production base URL.
- Produces: deploy failure if real listing requests stall, return HTML, return non-JSON, exceed latency budget, or exceed response-size budget.

- [ ] **Step 1: Add real UI endpoint checks**

Add these paths:

```ts
"/api/public/listings?listing_type=sale&page=1&limit=12",
"/api/public/listings?listing_type=sale&page=1&limit=40",
"/api/public/listings?listing_type=rent&page=1&limit=12",
"/api/public/listings?listing_type=rent&page=1&limit=40",
"/api/public/homepage?section=featured"
```

- [ ] **Step 2: Add latency budget**

For public listing endpoints, fail if total request time exceeds:

```ts
const PUBLIC_LISTINGS_LATENCY_BUDGET_MS = 3000;
```

For homepage featured:

```ts
const PUBLIC_HOMEPAGE_FEATURED_LATENCY_BUDGET_MS = 2000;
```

- [ ] **Step 3: Add response-size budget**

For `limit=40`:

```ts
const PUBLIC_LISTINGS_LIMIT40_MAX_BYTES = 180_000;
```

- [ ] **Step 4: Run deploy-check tests**

Run:

```bash
npx vitest run scripts/check-production-deploy.test.mjs
```

Expected: PASS locally with mocked fetches, latency assertions, and JSON-shape assertions.

---

## Task 7: Local, Browser, And Live Verification

**Files:**
- No source files unless verification exposes a regression.

**Interfaces:**
- Consumes: completed Tasks 0-6.
- Produces: evidence that UI consistency, endpoint reliability, and first-paint latency are fixed.

- [ ] **Step 1: Run static/code gates**

Run:

```bash
npm run check:secrets
npm run typecheck
```

Expected: PASS.

- [ ] **Step 2: Run focused regression suite**

Run:

```bash
npx vitest run src/test/FeaturedPropertiesSection.mapping.test.tsx src/test/PropertyCard.behavior.test.tsx src/test/useListings.publicApi.test.tsx src/test/Listings.performance.test.ts src/test/Listings.interactions.test.tsx scripts/check-production-deploy.test.mjs scripts/diagnose-public-listings-latency.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run broad test suite**

Run:

```bash
npm run test
```

Expected: PASS.

- [ ] **Step 4: Run browser performance smoke**

Run:

```bash
npm run test:perf
```

Expected: PASS and no listing first-paint regression.

- [ ] **Step 5: Run live endpoint timing after deployment**

After deploy, run:

```bash
node scripts/diagnose-public-listings-latency.mjs https://portal.maiprop.co --timeout-ms=8000 --iterations=3
```

Expected:

```text
sale-limit-12: HTTP 200 JSON, under 3000ms
sale-limit-40: HTTP 200 JSON, under 3000ms
rent-limit-12: HTTP 200 JSON, under 3000ms
rent-limit-40: HTTP 200 JSON, under 3000ms
homepage-featured: HTTP 200 JSON, under 2000ms
```

- [ ] **Step 6: Run manual visual comparison**

Open:

```text
https://portal.maiprop.co/
https://portal.maiprop.co/listings?listing_type=sale
```

Verify:

```text
Glifada Loft card has consistent Spotlight badge/treatment where it is featured.
Homepage cards do not show Compare unless product decision changes.
Listings page first cards appear quickly.
No false "No properties found" state flashes during loading.
```

---

## Final Acceptance Criteria

- `limit=40` public listings endpoint no longer hangs.
- `limit=12` and `limit=40` both return JSON within the defined live budget.
- Homepage featured API no longer hangs.
- Spotlight cards are visually consistent between homepage and listings where the same promotion state applies.
- Listings first paint is fast and still fills to 40 rows.
- Production deploy checks cover the real user endpoint shape, not only `limit=1`.
- No mock data is added.
- No public URL or pricing/business behavior changes.

---

## Self-Review

- Spec coverage: card inconsistency covered by Tasks 1-2; API/cache stall covered by Tasks 0 and 3; DB/payload discipline covered by Task 4; 8-12 first paint plus 40-row preservation covered by Task 5; real deploy checks covered by Task 6; verification covered by Task 7.
- Placeholder scan: no TBD, TODO, "later", or vague edge-case placeholders remain.
- Type consistency: plan uses existing names `PropertyCard`, `HomepageListing`, `fetchPublicApi`, `cachedJson`, `PAGE_SIZE`, and current public API path conventions.
