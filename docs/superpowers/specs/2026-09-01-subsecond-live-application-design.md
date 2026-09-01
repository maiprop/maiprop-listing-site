# Subsecond Live Application Design

**Date:** 2026-09-01

**Production origin:** `https://portal.maiprop.co`

**Baseline release:** `5cf9ba49eafdc19d2e8746bc877f33b08bad0dae`

**Supersedes for forward performance work:** the narrower journey targets in
`2026-08-24-live-critical-flow-performance.md`. Existing release-safety and
rollback requirements remain in force.

## Objective

Make the public catalogue and existing-session seller journeys usable within
one second at p95 without replacing the current React, Supabase, and
Cloudflare architecture. Availability is a prerequisite: a fast shell with
missing properties or failed auctions does not pass.

The design concentrates effort in dependency order:

1. restore production database, Edge, and frontend capability parity;
2. collapse authenticated startup waterfalls;
3. narrow listing-management mutations and remove critical-path probes;
4. serve public read models through bounded, cacheable Edge APIs;
5. enforce the result with exact-SHA release gates and real-user timing.

It deliberately avoids a framework rewrite, new cache infrastructure, and
speculative database indexing.

## Current production evidence

The browser observations below were captured against the baseline release on
2026-09-01. A timing is considered successful only when the requested data or
action state is rendered.

| Flow | Observed result |
| --- | --- |
| Cold homepage | Meaningful shell in 501 ms, but Spotlight Properties and this week's auctions both rendered load errors. |
| Auctions hard navigation | Route return in 145 ms and loading state in 222 ms; terminal failure in 2,136 ms with no auction rows or statistics. |
| Seller dashboard hard navigation | Dashboard heading in 1,415 ms; the page was still checking the plan at 1,924 ms. |
| Overview to My Listings | Approximately 3.9 s before the empty listing-management state rendered. |
| My Listings to create wizard | Wizard heading in 3,217 ms. |
| Listing wizard step transitions | 391-425 ms. |

Additional targeted traces on the same release showed 36-48 authenticated data
requests, repeated profile and entitlement work, missing production RPC/view
capabilities, a 503 auction API caused by unavailable Supabase service runtime,
and multi-second empty dashboard queries. The public listings endpoint is fast
when its Cloudflare cache is warm, so the bottleneck is not one universal slow
database query.

## Performance contract

All targets are p95 unless marked otherwise. Measurements use at least 30 cold
and 30 warm samples, desktop and throttled mobile, and the exact deployed SHA.

| Boundary | Target | Release ceiling |
| --- | ---: | ---: |
| Immediate interaction feedback | 100 ms | 150 ms |
| Warm SPA navigation to usable data | 300 ms | 500 ms |
| Cold public catalogue/detail to usable data | 800 ms | 1,000 ms |
| Existing-session dashboard to usable overview | 900 ms | 1,000 ms |
| Account bootstrap API | 500 ms | 700 ms |
| Dashboard overview API | 400 ms | 600 ms |
| Create-listing wizard ready | 900 ms | 1,000 ms |
| Wizard step transition | 200 ms | 300 ms |
| No-photo publish confirmation | 700 ms | 1,000 ms |
| Edit save confirmation | 700 ms | 1,000 ms |
| Unlist or relist confirmation | 500 ms | 800 ms |
| Cloudflare cache hit | 100 ms | 200 ms |
| Cold bounded origin read | 600 ms | 900 ms |
| Initial dashboard data requests | 2 | 2 |
| Inactive dashboard-tab requests | 0 | 0 |
| Required capability probe failures | 0 | 0 |

A cold request from every global network cannot be guaranteed below one
second. The product contract is therefore immediate shell or stale data,
bounded origin work, and p95 usable data below one second. A loading spinner
that later fails never satisfies the contract.

## Architecture

### 1. Release capability parity

Database capabilities must be deployed before code that calls them. Each
release carries a machine-readable capability manifest tied to the frontend
Git SHA. It names the required migrations, views, RPCs, Edge routes, and
runtime bindings for that release.

The release workflow performs read-only probes in this order:

1. migration convergence;
2. required view and function existence;
3. least-privilege execution of each public and authenticated read contract;
4. Edge runtime binding presence;
5. representative non-empty or explicitly valid empty response;
6. frontend artifact and capability-manifest SHA match.

The deployment order is expand-only database migration, Edge/API deployment,
frontend deployment, exact-SHA canary, and only then release promotion. The
workflow stops before frontend promotion on any 404, 5xx, schema mismatch, or
missing binding. Compatibility migrations remain until the next release has
completed its observation window.

The auction endpoint must not depend on a broadly privileged secret when a
narrow database role or security-definer read function can satisfy the public
contract. The immediate recovery may restore the existing runtime binding,
but the steady-state design uses the minimum privilege required by the auction
publication reader.

### 2. Account and dashboard read models

Authenticated startup is split into two explicit boundaries.

`get_account_bootstrap_v1()` returns the authenticated principal's profile,
authoritative role, participant type, active organization memberships,
locally synchronized entitlement state, notification count, and listing quota.
It replaces parallel profile, membership, subscription, notification-count,
and quota requests during route entry.

`get_dashboard_overview_v1()` returns only the counters and small summaries
needed by the visible overview: active listings, views, saved items, viewings,
and the role-specific overview card. It does not return full catalogues,
messages, reviews, consultations, or inactive-tab rows.

Stripe remains the billing authority, but webhook reconciliation stores the
current entitlement in the application database. Dashboard startup reads that
local result. A direct Stripe or subscription Edge request is reserved for an
explicit billing refresh and does not block routing.

Dashboard tab components own their data hooks. A hook is enabled only while
its tab is active. Notification rows load when the notification panel opens;
the bootstrap provides the count. Realtime events update the relevant small
query or invalidate it without refetching the complete dashboard.

Route guards wait only for the information they enforce. `SellerRoute` checks
session and seller-capable role; only developer-specific flows wait for the
developer entitlement. Profile decoration and non-security billing state may
settle after the protected shell renders.

### 3. Listing-management critical path

The listing wizard no longer mounts a public-catalogue health probe or fetches
the seller's complete catalogue to calculate quota. Quota comes from the
account bootstrap and is revalidated by the create mutation.

Create, edit, and status changes use narrow, idempotent server contracts:

- `create_managed_listing_v1` validates quota and returns the created listing
  identity plus status;
- `update_managed_listing_v1` updates an authorized listing and returns the
  changed projection;
- `set_managed_listing_status_v1` performs authorized unlist/relist state
  transitions and returns the new status.

The implementation may retain an existing contract when it already provides
the same authorization and projection; duplicate RPCs are not created merely
to match these names. RLS and server-side authorization remain authoritative.

The client shows pending state within 100 ms, performs an optimistic status
transition where reversible, and rolls back on a terminal error. Successful
mutations update the exact management cache entry and invalidate only affected
summary and publication keys. Public catalogue publication and cache warming
run asynchronously and never extend the mutation confirmation path.

Image uploads remain separate from the no-photo mutation budget. Multi-image
uploads use bounded concurrency, and listing publication waits only for assets
the user explicitly chose to include.

### 4. Public read models and Cloudflare caching

The existing immutable public listings publication remains the catalogue
authority. It is extended as a pattern, not replaced with direct browser-to-
Supabase reads.

Auctions receive a publication-backed card projection, facets, and summary
statistics. Public consumers read it through `/api/public/auctions` with
Cloudflare Cache API coalescing, fresh and stale entries, a bounded producer
deadline, and explicit cache-state headers. Entitled expansion validates the
session locally where possible and performs at most one entitlement lookup.

The homepage uses one cacheable summary payload containing Spotlight cards,
auction summary/cards, and open-house summary/cards. A failure in one producer
is represented as a typed partial section rather than failing the entire
homepage response. Last-known-good data may be served stale within its
business-validity window.

Professionals use a card projection with keyset pagination and a cached exact
detail projection. Open houses start with 24 cards, paginate by cursor, and
separate public detail, current-user state, and owner controls. Private owner
data loads only when the owner panel opens.

Public detail HTML uses a shared Cloudflare cache boundary with a short cache
read budget, stale-while-revalidate, and a static-shell fallback. Hover or
viewport prefetch may warm likely next routes after the critical page settles.

### 5. Failure behavior

Every boundary returns a typed, observable outcome: success, valid empty,
stale, timeout, unavailable capability, unauthorized, or terminal producer
failure. Unknown empty arrays are not treated as healthy success.

Cloudflare never caches an authorization response under a public key and never
caches an error as a successful payload. Late successful public producers may
populate cache through `waitUntil`; late failures are contained and recorded.

The UI preserves last-known-good data where safe, labels stale results, and
offers a retry. It does not display indefinite counters such as em dashes while
waiting for an origin that has already exceeded its deadline.

## Implementation sequence

### Wave 0: Baseline and production recovery

Use one clearly labelled synthetic seller listing for create, edit, unlist,
and relist timings. Preserve its ID for post-release comparison and remove it
only through the approved cleanup path after verification.

Add the capability manifest and probes, restore missing migration/runtime
parity, and prove listings, auctions, professionals, open houses, and their
homepage sections return contract-valid responses. Exit only when all probes
pass and auctions render real data or a business-valid empty state.

### Wave 1: Authenticated critical path

Implement account bootstrap and dashboard overview, gate inactive hooks, make
notifications lazy, use locally synchronized entitlements, and remove listing
wizard health/full-catalogue dependencies. Exit when dashboard entry makes at
most two data requests and create-wizard p95 is below one second.

### Wave 2: Listing mutations

Narrow create, update, and status contracts; add optimistic UI and targeted
cache updates; decouple publication. Exit when create, edit, unlist, and relist
meet their budgets without authorization or consistency regressions.

### Wave 3: Public read paths

Publish auctions, aggregate the homepage summary, paginate professionals/open
houses, and cache detail HTML. Exit when each public route meets the data-ready
budget with correct HIT, MISS, STALE, and failure behavior.

### Wave 4: Observability and payload refinement

Record route-start, shell-ready, data-ready, and interactive marks for SPA
navigations. Record actual React Query durations instead of looking for marks
that are never created. Add p50/p95/p99, request-count, payload, cache-state,
publication-lag, and error-rate dashboards. Defer noncritical Sentry and UI
modules, then tighten aggregate initial-gzip budgets based on the measured
remaining cost.

## Verification and release gates

Each wave has focused unit and integration tests, RLS tests for every new or
changed database contract, and deterministic browser checks. Database query
changes require representative staging data and
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` before an index is added or rewritten.

The final candidate must pass type checking, lint, focused tests, RLS tests,
Functions checks, production build, bundle budgets, migration lint, release
safety checks, exact-SHA staging, and an N-1 compatibility proof.

The production canary repeats the same seller listing lifecycle and public
routes. Measurement records p50, p95, maximum, data-request count, payload
size, cache state, terminal UI state, and deployed SHA. DOM load alone is not
accepted. A regression above a release ceiling, an unavailable required
capability, more than two initial dashboard requests, or any inactive-tab
request blocks promotion.

## Safety and rollback

- Do not bypass branch protection, independent release approval, deployment
  leases, migration convergence, or exact-SHA binding.
- Do not use pasted Stripe or other provider keys for website performance work.
- Do not expose service-role credentials to the browser.
- Do not introduce direct browser fallbacks to private catalogue tables.
- Do not drop indexes or perform destructive migration cleanup in these waves.
- Keep expand-only compatibility until rollback to the signed N-1 artifact is
  proven.
- If database or Edge capability deployment fails, stop before deploying a
  frontend that depends on it.

## Acceptance

The work is complete only when the exact merged SHA is deployed, capability
parity is proven, all release ceilings pass, and the live before/after report
contains 30 cold and 30 warm samples per required route or action. The target
is a usable p95 below one second, not a fast shell that later fails.
