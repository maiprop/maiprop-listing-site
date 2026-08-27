# Production Performance Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy the already-merged critical-flow fixes, remove the remaining
measured latency and ownership defects, and keep production inside the agreed
p95 and error-rate budgets for a full observation window.

**Architecture:** Treat the current `main` release as Release A and deploy it
through the one-time approved single-admin bootstrap in
`docs/PRODUCTION_RELEASE_RUNBOOK.md`, preserving the immutable
staging/approval/production evidence train before changing more code. Delete
the temporary authorization immediately after final proof, health, and timing
handoff, then return Release B and all later releases to the normal two-person
train. Use the exact-SHA
post-deploy measurements to separate fixed defects from remaining work.
Release B then reduces critical JavaScript, mounts dashboard data only when
needed, shortens local sign-out, removes listing-wizard startup work, adds
cleanup-safe fixture handling, and installs continuous synthetic gates.

**Tech Stack:** React 18, TypeScript, Vite 8, TanStack Query 5, Supabase Auth and
Postgres, Supabase Edge Functions, Cloudflare Pages Functions/Cache API,
Playwright, Lighthouse CI, Vitest, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-24-live-critical-flow-performance.md`

**Prior plan:** `docs/superpowers/plans/2026-08-24-live-critical-flow-performance.md`

## Verified live baseline (2026-08-25 UTC)

The plan starts from these measurements, not from an assumption that the
merged fixes are already live:

| Evidence | Observed result | Interpretation |
| --- | --- | --- |
| Remote `main` | `a995b1e78c0624215df4c619491e6e03665460f9` | Release A candidate |
| Production marker | `db53d1b9adae41edae93fbeb3e612b42dd8fec0b` | Production is still the old July build |
| Landing visible heading | cold p95 551 ms; warm p95 397 ms | Route shell already passes |
| Listings visible shell | p95 490 ms on the exact second pass | Route shell already passes |
| Listings cards, unstable pass | approximately p50 5.68 s; p95 9.81 s | Fails the 1.5 s release ceiling |
| Listings cards, later pass | p50 893 ms; p95 994 ms, all `STALE` | Fast only while stale data is available |
| Public catalogue API | first request 503; one 503 in 11 small-sample requests | Cold reliability is not releaseable |
| Successful API cache state | all sampled successes `STALE`, `Age` 144–151 s | Cache behavior needs exact-SHA proof |
| Lighthouse `/` | LCP 9.707 s; CLS 0.000 | LCP fails; layout stability passes |
| Lighthouse `/listings` | LCP 17.792 s; CLS 0.000 | LCP fails severely |
| Sign-in | passed three live cycles | Retain as a regression gate |
| Sign-out | functionally succeeds but misses the latency budget | Execute Task 8 if Release A does not fix it |
| Duplicate signup | confirmation UI at approximately 5.9 s | Exceeds server/confirmation targets |

The catalogue percentages above are deliberately not population estimates;
the sample is sufficient to block a release claim, not to diagnose a precise
failure rate. Repeated global cache observations also cannot be labelled true
cold misses unless the response explicitly reports `MISS`.

## Global Constraints

- Production proof always starts by comparing the full current `main` SHA with
  `https://portal.maiprop.co/deploy-version.json`.
- Use only the coordinated release train: database, Edge Functions, then
  Cloudflare Pages. Never deploy one layer manually to manufacture parity.
- Preserve independent exact-SHA approval, release leases, N-1 compatibility,
  attempt-one provenance, immutable release assets, and automatic Pages
  rollback.
- The public Pages Functions API remains the sole public catalogue authority.
  Never restore a browser-to-Supabase catalogue fallback.
- Never cache non-2xx, expired, or `no-store` responses.
- Never expose a Supabase service-role key, Stripe restricted key, Cloudflare
  token, TURN credential, or user access token in a browser bundle, log, test
  artifact, or plan evidence.
- Every new or modified exposed database object keeps RLS and explicit grants;
  authorization is based on `auth.uid()`/server-derived ownership, never
  `user_metadata`.
- All code work uses TDD and the pinned runtime:
  `npm run runtime -- <command>`.
- Performance budgets are p95 unless stated otherwise:

| Journey or service | Sustainable target | Release ceiling |
| --- | ---: | ---: |
| Landing meaningful content | 1.5 s | 3.0 s |
| Client route to usable shell | 1.0 s | 1.5 s |
| First useful catalogue paint | 1.0 s | 1.5 s |
| Warm 12-card public catalogue API | 500 ms | 1.0 s |
| Cold 12-card public catalogue API | 1.0 s | 1.8 s |
| Public API 5xx rate | <0.1% | <0.5% |
| Password sign-in to usable dashboard | 2.0 s | 3.0 s |
| Same-user profile hydration requests | 1 | 1 |
| Sign-up server request | 3.0 s | 5.0 s |
| Sign-up confirmation UI | 5.0 s | 8.0 s |
| Wizard step interaction | 200 ms | 500 ms |
| No-photo publish to property route | 2.0 s | 2.5 s |
| New active listing to publication | 60 s | 75 s |
| Publication to public API visibility | 1.0 s | 5.0 s |
| Lighthouse LCP | 2.5 s | 3.0 s |
| Lighthouse CLS | 0.1 | 0.1 |
| Browser INP | 200 ms | 200 ms |

---

## Workstream order

1. **Release A:** unblock and deploy current `main` without additional feature
   changes.
2. **Exact-SHA measurement:** decide which defects survive Release A.
3. **Release B implementation:** measurement harness, critical rendering,
   dashboard/auth/wizard work, and fixture safety.
4. **Release B deployment:** repeat the protected train and compare before,
   Release A, and Release B.
5. **Sustainability window:** require 24 hours of synthetic evidence before the
   phrase “fully boosted” is accepted.

---

### Task 1: Provision the provider prerequisites for Release A

**Files:**

- Read: `.github/workflows/provision-cloudflare-pages-runtime.yml`
- Read: `.github/workflows/verify-stripe-live-readiness.yml`
- Read: `docs/PRODUCTION_RELEASE_RUNBOOK.md`
- Read: `docs/CLOUDFLARE_PAGES_SETUP.md`
- Read: `docs/ENV_SETUP.md`
- No repository code changes are expected.

**Interfaces:**

- Consumes: current remote `main`, GitHub repository variables/secrets,
  Cloudflare Pages projects, Cloudflare Realtime TURN, Stripe live mode.
- Produces: verified runtime bindings and live-readiness evidence consumed by
  the staging and production workflows.

- [ ] **Step 1: Pin the exact Release A SHA**

```powershell
$releaseSha = (git ls-remote origin refs/heads/main).Split("`t")[0]
if ($releaseSha -notmatch '^[0-9a-f]{40}$') { throw 'Remote main did not resolve to a full SHA.' }
$releaseSha
```

Task 7 resolves this value from remote `main` after the reviewed single-admin
bootstrap implementation merges. Do not substitute the historical candidate
shown in the baseline table. If remote `main` changes, start a new incident
with the new SHA; never mix artifacts.

- [ ] **Step 2: Complete Stripe restricted-key verification**

In Stripe live mode, finish the email verification for the pending restricted
key, give it only the read permissions required by
`verify-stripe-live-readiness.yml`, and store the revealed `rk_live_...` value
as the GitHub repository secret `STRIPE_RESTRICTED_KEY`. Never paste the key in
a terminal or task message. Configure the four temporary variables for incident
`PERF-BOOTSTRAP-20260826-01` exactly as documented in the production runbook,
then dispatch **Verify Stripe Live Readiness** from `main` with
`single_admin_break_glass=true`, the operator-held identical reason, and
`VERIFY_STRIPE_BREAK_GLASS $releaseSha PERF-BOOTSTRAP-20260826-01`. Require an
attempt-one signed success for `$releaseSha`; this read-only action does not
burn a receipt.

- [ ] **Step 3: Activate and provision Cloudflare TURN**

Cloudflare Realtime TURN is usage-billed. Obtain the owner's explicit billing
authorization before activation, create distinct staging and production keys,
and store these GitHub secrets:

```text
CLOUDFLARE_STAGING_TURN_KEY_ID
CLOUDFLARE_STAGING_TURN_API_TOKEN
CLOUDFLARE_TURN_KEY_ID
CLOUDFLARE_TURN_API_TOKEN
```

Require staging and production key IDs/tokens to differ. Configure
`MAIPROP_TURN_TTL_SECONDS=21600` through the protected workflow only.

- [ ] **Step 4: Apply the approved one-time approval exception**

For this Release A incident only, follow the runbook's signed, exact-SHA,
four-hour, single-admin procedure for actor `krenios`. The actor must remain in
`PRODUCTION_RELEASE_DEPLOYERS`; the exception waives only approval allowlist
membership and actor separation after central validation. Do not edit a
workflow or allowlist during the incident. After final proof, delete all four
temporary variables in the documented order. The ordinary independent
allowlisted approver/deployer contract remains authoritative for every later
release.

- [ ] **Step 5: Provision both Pages runtimes**

As `krenios`, dispatch **Provision Cloudflare Pages Runtime** twice—first
`staging` with
`PROVISION_STAGING_PAGES_BREAK_GLASS $releaseSha PERF-BOOTSTRAP-20260826-01`,
then `production` with
`PROVISION_PRODUCTION_PAGES_BREAK_GLASS $releaseSha PERF-BOOTSTRAP-20260826-01`.
Use the same transient reason and `single_admin_break_glass=true`. Require each
action's immutable 7-day receipt and same-run signed binding before mutation,
plus its attempt-qualified 30-day Pages payload/binding. The minimized evidence
must show both encrypted TURN bindings and `MAIPROP_TURN_TTL_SECONDS=21600`
without revealing values.

- [ ] **Step 6: Enable the release lane only after all proofs pass**

Let the three exact provider proof pairs release the already-running staging
latch automatically. Set `PRODUCTION_RELEASE_ENABLED=true` only after Stripe,
both Pages runtime proofs, and signed staging evidence are green; restore
`STAGING_RELEASE_ENABLED` only to its recorded intended steady-state value
during cleanup. Record actor, run ID, run attempt, UTC start/end, immutable
artifact ID, GitHub digest, and binding artifact ID in the release log. Do not
delete the temporary authorization until coordinated final proof, health, and
timing handoff complete.

---

### Task 2: Stage, approve, deploy, and prove Release A

**Files:**

- Read: `.github/workflows/stage-release.yml`
- Read: `.github/workflows/approve-production-release.yml`
- Read: `.github/workflows/deploy-production-release.yml`
- Read: `docs/PRODUCTION_RELEASE_RUNBOOK.md`
- No source changes are permitted while this exact-SHA train is running.

**Interfaces:**

- Consumes: `$releaseSha` and the provider proofs from Task 1.
- Produces: an immutable staging deployment, signed independent approval,
  production deployment, rollback target, and exact live marker.

- [ ] **Step 1: Verify the immutable candidate belongs to Release A**

Use GitHub Actions to verify the push-triggered CI run for `$releaseSha` is
attempt one and contains **Immutable release candidate built**. Verify the
candidate and signed binding digests before staging.

- [ ] **Step 2: Run isolated staging**

Dispatch the staging release for `$releaseSha`. Require all of the following:

- materialized catalogue migrations applied and publication bootstrapped;
- `query_public_catalogue` uses retained snapshot tables;
- immutable and canonical staging origins serve `$releaseSha`;
- public API budgets, Lighthouse LCP/CLS/INP, query budgets, migration
  convergence, security gates, authenticated TURN, and N-1 compatibility pass;
- zero skipped catalogue compatibility assertions.

- [ ] **Step 3: Create the exact-SHA one-time approval**

As `krenios`, dispatch **Approve Production Release** for the signed staging
run with `single_admin_break_glass=true`, the identical transient reason,
incident `PERF-BOOTSTRAP-20260826-01`, and
`APPROVE_PRODUCTION_BREAK_GLASS $releaseSha PERF-BOOTSTRAP-20260826-01`.
Require the attempt-one signed approval artifact to bind `$releaseSha`, source
run, staging run, artifact digests, approver, nonce, authorization hash, and
effective expiry. This read-only action does not burn a receipt.

- [ ] **Step 4: Deploy through the coordinated workflow**

As `krenios`, dispatch **Deploy Production Release** from `main` with
`release_sha=$releaseSha`, `single_admin_break_glass=true`, the identical
reason and incident, and confirmation
`DEPLOY_PRODUCTION_BREAK_GLASS $releaseSha PERF-BOOTSTRAP-20260826-01`.
Require the immutable `production-deploy` receipt and same-run binding before
archive or mutation. Monitor database, Edge, then Pages. Stop on any lease,
provenance, migration, N-1, provider, or health failure. Once the receipt is
uploaded, any retry requires a new incident and fresh expiry; never rerun the
workflow or resume through direct Cloudflare recovery.

- [ ] **Step 5: Verify live identity**

```powershell
npm run runtime -- npm run release:verify-live-marker -- --base-url https://portal.maiprop.co --sha $releaseSha
npm run runtime -- npm run check:production-deploy -- --base-url https://portal.maiprop.co
$marker = Invoke-RestMethod 'https://portal.maiprop.co/deploy-version.json'
if ($marker.sha -ne $releaseSha) { throw "Production marker mismatch: $($marker.sha)" }
```

Expected: the marker, Pages deployment, `/api/release`, database evidence, Edge
manifest, and signed aggregate all bind the same SHA. If Pages health fails,
the workflow must restore and verify the captured `db53d1...` deployment; the
release remains failed even after rollback.

---

### Task 3: Add one reproducible critical-flow timing harness

**Files:**

- Create: `e2e/live-critical-performance.spec.ts`
- Create: `scripts/run-live-critical-performance.mjs`
- Create: `scripts/run-live-critical-performance.test.mjs`
- Modify: `package.json`
- Reuse: `scripts/diagnose-public-listings-latency.mjs`
- Reuse: `e2e/helpers/demoAccounts.ts`

**Interfaces:**

- Produces:

```ts
export type CriticalFlowSample = {
  action: string;
  startedAtUtc: string;
  durationMs: number;
  status: "pass" | "fail" | "blocked";
  httpStatus?: number;
  cacheState?: string;
  deployedSha: string;
};

export type CriticalFlowReport = {
  baseUrl: string;
  deployedSha: string;
  startedAtUtc: string;
  finishedAtUtc: string;
  samples: CriticalFlowSample[];
  summaries: Record<string, { count: number; p50Ms: number; p95Ms: number }>;
};
```

- Consumes: `PERF_BASE_URL`, demo credentials, and the production-mutation
  safety switch. Anonymous and auth-only runs never require a service-role key.

- [ ] **Step 1: Write failing report-contract tests**

Test deterministic nearest-rank p50/p95 calculation, exact deployed-SHA
capture, UTC timestamps, failed HTTP status preservation, cache-state capture,
and secret redaction. A report containing an email password, bearer token,
publishable key, restricted key, or TURN credential must throw before writing.

```powershell
npm run runtime -- node --test scripts/run-live-critical-performance.test.mjs
```

Expected RED: the runner and report types do not exist.

- [ ] **Step 2: Implement the non-mutating measurements**

The Playwright spec must use fresh browser contexts with service workers
blocked and measure with `performance.now()` inside the browser, not controller
wall time. Collect five cold and five warm samples for:

- `/` to visible main heading and FCP/LCP/CLS;
- `/listings` to shell and first property card;
- `/login` and `/signup` form shells;
- password sign-in to visible dashboard heading;
- sign-out click to visible logged-out login shell;
- `/dashboard` and `/listings/new` usable shell;
- all public catalogue diagnostic paths with status, TTFB, total time,
  `X-Maiprop-Cache`, `Age`, and `Cache-Control`.

The duplicate-account signup probe runs once per report and records Auth server
response and confirmation UI separately. It must never create a new identity.

- [ ] **Step 3: Add explicit mutation safety**

The listing publish test is skipped unless all three conditions are true:

```ts
const mutationAllowed =
  process.env.PERF_ALLOW_PRODUCTION_MUTATION === "1" &&
  process.env.PERF_FIXTURE_TAG?.startsWith("codex-live-perf-") === true &&
  process.env.PERF_CLEANUP_VERIFIED === "1";
```

The test must capture the exact created listing ID and run authenticated
`delete_listing_for_user` cleanup in `finally`. It fails if the row remains in
the management catalogue or public API after cleanup.

- [ ] **Step 4: Add the runner and package command**

Add:

```json
"perf:live-critical": "node scripts/run-live-critical-performance.mjs"
```

The runner writes JSON to an explicitly supplied artifact directory, prints a
compact table, and exits non-zero when a release ceiling or 5xx ceiling fails.

- [ ] **Step 5: Run tests and commit**

```powershell
npm run runtime -- node --test scripts/run-live-critical-performance.test.mjs
npm run runtime -- npx playwright test e2e/live-critical-performance.spec.ts --project=chromium
git add e2e/live-critical-performance.spec.ts scripts/run-live-critical-performance.mjs scripts/run-live-critical-performance.test.mjs package.json
git commit -m "test: make live critical-flow timings reproducible"
```

---

### Task 4: Remeasure Release A before additional optimization

**Files:**

- Generated evidence only; no source changes.

**Interfaces:**

- Consumes: Task 3 harness and Release A marker.
- Produces: the go/no-go matrix for Tasks 5–9.

- [ ] **Step 1: Run the exact non-mutating suite**

This is the live-timing handoff required by the one-time Release A procedure.
First reconfirm the production marker equals `$releaseSha` and that the signed
database, Edge, Cloudflare, and aggregate evidence shares the exact
authorization and consumption hashes. Keep the plaintext incident reason out
of timing output and artifacts.

```powershell
$env:PERF_BASE_URL='https://portal.maiprop.co'
Remove-Item Env:PERF_ALLOW_PRODUCTION_MUTATION -ErrorAction SilentlyContinue
npm run runtime -- npm run perf:live-critical -- --samples=5 --artifact-dir=artifacts/live-performance/release-a
npm run runtime -- npm run diagnose:public-listings-latency -- https://portal.maiprop.co --iterations=30 --timeout-ms=8000
```

- [ ] **Step 2: Capture trace-level evidence**

Configure `chrome-devtools-mcp@latest`, then collect reload traces for `/` and
`/listings`, including LCP breakdown, render blocking, dependency graph, and
network request detail. Until that trace exists, do not attribute the 9.71 s
and 17.79 s lab LCP to a particular script or image.

- [ ] **Step 3: Apply the decision matrix**

| Release A result | Action |
| --- | --- |
| Cold API p95 ≤1.8 s and 5xx <0.5% | Do not alter catalogue SQL/cache; continue monitoring. |
| Cold API fails but typed RPC query p95 ≤1.0 s | Fix Pages cache/runtime behavior in Task 5. |
| Typed RPC query p95 >1.0 s | Capture staging `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` and optimize only the observed scan/sort. |
| Catalogue cards exceed 1.5 s while API passes | Fix placeholder/render path in Task 6. |
| Dashboard exceeds 1.5 s | Execute Task 7. |
| Sign-out exceeds 3.0 s or signup server exceeds 5.0 s | Execute Task 8. |
| Wizard startup exceeds 1.5 s | Execute Task 9. |

Commit the JSON evidence only if repository evidence policy accepts that
artifact class; otherwise retain it in the workflow artifact and link the run.

- [ ] **Step 4: Remove the temporary exception and restore steady state**

After proof, production health, and the Release A timing evidence are captured,
record the intended steady-state values of `STAGING_RELEASE_ENABLED` and
`PRODUCTION_RELEASE_ENABLED`. Delete
`PRODUCTION_BREAK_GLASS_EXPIRES_AT`,
`PRODUCTION_BREAK_GLASS_INCIDENT_ID`,
`PRODUCTION_BREAK_GLASS_RELEASE_SHA`, and
`PRODUCTION_BREAK_GLASS_ACTOR`, in that order; verify all four are absent.
Restore only the recorded intended standard gate values. Release B and every
later train use the normal independent two-person approval/deployment path.

---

### Task 5: Correct any remaining cold catalogue failure

**Files:**

- Modify when cache/runtime is the measured cause:
  `functions/api/public/_cache.ts`
- Modify when request construction is the measured cause:
  `functions/api/public/listings.ts`
- Modify tests: `functions/api/public/public-api.test.ts`
- Create a migration only when staging EXPLAIN proves a database defect, using
  `supabase migration new optimize_public_catalogue_observed_plan`.
- Test: `supabase/tests/public_catalogue_20k_scale_test.sql`

**Interfaces:**

- Consumes: typed `query_public_catalogue`, `X-Maiprop-Cache-Valid-Until`, and
  the late-producer cache state already implemented on `main`.
- Produces: bounded 2xx responses with `HIT`, `MISS`, `STALE`, or `COALESCED`;
  no cache state may preserve a 5xx.

- [ ] **Step 1: Add a failing reproduction matching Release A evidence**

Use fake timers and controlled producers to reproduce the exact failure:
concurrent cold callers, a producer finishing after the caller deadline, an
existing stale seed, or an expired publication. Assert one upstream producer,
bounded callers, successful late seed, and a subsequent `HIT`.

```powershell
npm run runtime -- npm test -- functions/api/public/public-api.test.ts -t "cold catalogue" --maxWorkers=1 --reporter=verbose
```

- [ ] **Step 2: Implement only the measured layer fix**

For a cache defect, keep `CDN-Cache-Control: no-store` on caller responses and
let `cachedJson` own Cache API entries. Ensure the in-flight key survives until
late seeding settles and that stale entries cannot outlive their business-valid
publication boundary.

For a database defect, run Index Advisor and EXPLAIN in isolated staging. Add
only the index or function change whose before/after plan reduces the observed
node. Use `CREATE INDEX CONCURRENTLY` only outside a transaction and only when
the table size/write profile requires it. Never add an index solely from a
column-name guess.

- [ ] **Step 3: Verify scale and security**

```powershell
npm run runtime -- npm test -- functions/api/public/public-api.test.ts --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck:functions
npm run runtime -- npm run lint:migrations
npm run runtime -- npm run check:supabase-advisor
```

Run the 20k snapshot test in isolated staging and require cold p95 ≤1.8 s,
warm p95 ≤1.0 s, and zero 5xx across 100 requests.

- [ ] **Step 4: Commit**

```powershell
git add functions/api/public/_cache.ts functions/api/public/listings.ts functions/api/public/public-api.test.ts supabase/migrations supabase/tests/public_catalogue_20k_scale_test.sql
git commit -m "fix: stabilize cold public catalogue responses"
```

Stage only paths that actually changed.

---

### Task 6: Reduce landing and catalogue LCP

**Files:**

- Create: `src/lib/criticalRouteModules.ts`
- Create: `src/test/criticalRouteModules.test.ts`
- Modify: `src/main.tsx`
- Modify: `src/App.tsx`
- Modify: `src/pages/Index.tsx`
- Modify: `src/test/App.test.tsx`
- Modify: `e2e/performance-gates.spec.ts`

**Interfaces:**

- Produces shared route loaders such as
  `loadIndexPage(): Promise<{ default: ComponentType }>` used by both
  `React.lazy` and startup preloading.
- Keeps Navbar, Hero, Browse by Type, and first Featured section in the critical
  homepage module; below-fold sections remain behind Suspense boundaries.

- [ ] **Step 1: Add failing critical-route preload tests**

Prove `/`, `/listings`, `/login`, `/signup`, `/dashboard`, and `/listings/new`
start exactly one matching module import before React renders. Prove unknown
routes do not preload every page.

```powershell
npm run runtime -- npm test -- src/test/criticalRouteModules.test.ts src/test/App.test.tsx --maxWorkers=1 --reporter=verbose
```

- [ ] **Step 2: Share route importers and start the critical import early**

Move the six dynamic import functions into `criticalRouteModules.ts`. In
`main.tsx`, call the pathname-matched loader without awaiting it immediately
before `createRoot(...).render(...)`. In `App.tsx`, construct `lazy()` routes
from the same loader functions so Vite/browser module caching removes the
route-chunk discovery waterfall.

- [ ] **Step 3: Code-split below-fold homepage sections**

Convert these static imports in `Index.tsx` to `lazy()` imports:

```text
HomepageAuctionsSection
HomepageOpenHousesSection
QuickSaleCTASection
PopularLocationsSection
ProfessionalsCTASection
```

Mount each only when its existing `useDeferredHomepageSection` enables it.
Keep stable-height placeholders and apply `content-visibility: auto` with an
accurate `contain-intrinsic-size` so delayed sections do not create CLS.

- [ ] **Step 4: Enforce resource and route budgets**

Extend `e2e/performance-gates.spec.ts` to assert that landing initial JS and CSS
stay below the current bundle budget, map/chart/AI chunks are absent before
interaction, LCP ≤3.0 s, CLS ≤0.1, and no route import is requested twice.

- [ ] **Step 5: Verify and commit**

```powershell
npm run runtime -- npm test -- src/test/criticalRouteModules.test.ts src/test/App.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
npm run runtime -- npm run build
npm run runtime -- npm run check:bundle-size
npm run runtime -- npm run test:perf
git add src/lib/criticalRouteModules.ts src/test/criticalRouteModules.test.ts src/main.tsx src/App.tsx src/pages/Index.tsx src/test/App.test.tsx e2e/performance-gates.spec.ts
git commit -m "perf: remove critical route and homepage waterfalls"
```

---

### Task 7: Make the dashboard shell fast and stop inactive request fan-out

**Files:**

- Create: `src/pages/dashboard/DashboardOverview.tsx`
- Create: `src/pages/dashboard/DashboardRouteSkeleton.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/Dashboard.behavior.test.tsx`
- Modify: `e2e/query-budget-gates.spec.ts`
- Modify: `e2e/performance-gates.spec.ts`

**Interfaces:**

- `DashboardOverview` owns overview-only hooks and receives only
  `{ profile, role, bioType, isPro, onSelectSection }`.
- Inactive tabs mount neither their component nor their data hooks.
- `DashboardRouteSkeleton` renders a stable, non-authoritative shell while the
  profile is hydrating; it never renders role-gated data or actions.

- [ ] **Step 1: Add failing request-budget tests**

For seller `/dashboard`, assert one profile hydration set and only overview
queries. For `/dashboard/listings`, assert the manageable-listings query and
promotion balance run while favorites, auction alerts, consultations,
professional services, saved searches, and both viewing directions do not.

```powershell
npm run runtime -- npm test -- src/test/Dashboard.behavior.test.tsx --maxWorkers=1 --reporter=verbose
```

- [ ] **Step 2: Extract the overview data boundary**

Move overview-only JSX and hooks from `Dashboard.tsx` into
`DashboardOverview.tsx`. The parent keeps auth, navigation, and active-section
selection. Render `DashboardOverview` only for `activeSection === "overview"`;
the existing self-contained tab components own their queries when mounted.

- [ ] **Step 3: Render a stable shell during profile hydration**

Replace the full-screen spinner used by
`loading || (user && profileLoading)` with `DashboardRouteSkeleton`. The
skeleton includes the real main landmark and a `Dashboard` heading, fixed nav
geometry, and labelled loading placeholders. It contains no inferred role,
subscription, quota, listing, or organization information.

- [ ] **Step 4: Gate the request count and timing**

Extend the E2E gates so seller dashboard shell p95 is ≤1.5 s, usable overview
p95 is ≤3.0 s, same-user profile hydration remains one set, and inactive tab
queries are zero.

- [ ] **Step 5: Verify and commit**

```powershell
npm run runtime -- npm test -- src/test/Dashboard.behavior.test.tsx src/test/DashboardTabs.behavior.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
npm run runtime -- npm run test:perf
git add src/pages/Dashboard.tsx src/pages/dashboard/DashboardOverview.tsx src/pages/dashboard/DashboardRouteSkeleton.tsx src/test/Dashboard.behavior.test.tsx e2e/query-budget-gates.spec.ts e2e/performance-gates.spec.ts
git commit -m "perf: isolate dashboard shell and active-section data"
```

---

### Task 8: Shorten sign-out and instrument signup precisely

**Files:**

- Modify: `src/contexts/AuthContext.tsx`
- Modify: `src/components/Navbar.tsx`
- Modify: `src/pages/Dashboard.tsx`
- Modify: `src/test/AuthContext.test.tsx`
- Modify: `src/test/Navbar.behavior.test.tsx`
- Modify: `src/test/Dashboard.behavior.test.tsx`
- Modify: `supabase/functions/auth-email-hook/index.ts`
- Modify: `supabase/functions/auth-email-hook/index.test.ts`
- Modify: `supabase/functions/_shared/brevo.ts`
- Modify: `supabase/functions/_shared/brevo.test.ts`

**Interfaces:**

- `signOut()` clears in-memory user/session/query identity synchronously, uses
  `supabase.auth.signOut({ scope: "local" })`, and returns a background promise
  for logging/recovery.
- Auth email logs expose bounded numeric fields
  `verify_ms`, `render_ms`, `provider_ms`, and `total_ms`; they never contain
  tokens, links, secrets, or complete recipient addresses.

- [ ] **Step 1: Add failing optimistic local sign-out tests**

Hold the Supabase sign-out promise open. Assert the context clears `user`,
`session`, profile, subscription, and user-scoped QueryClient state before that
promise resolves. Assert one `{ scope: "local" }` call, no stale auth event can
restore the signed-out generation, and a later explicit sign-in starts a new
generation.

- [ ] **Step 2: Implement current-session sign-out**

Clear local context state before enqueueing the remote revocation. Navbar and
Dashboard navigate to `/login` with `replace: true` immediately after the local
state transition and attach error reporting to the returned promise without
blocking the route. Preserve the existing session-race protections.

- [ ] **Step 3: Add email-hook phase timing tests**

Inject a monotonic clock into the hook helpers and assert phase durations are
logged on success and failure. Redact the recipient to a one-way bounded hash
or omit it. Add an AbortController timeout to `sendBrevoEmail` and classify
timeouts separately from 4xx/5xx provider responses; do not report a successful
Auth hook until the provider accepted the email.

- [ ] **Step 4: Diagnose rather than guess at signup latency**

Run 30 staging signups with disposable addresses and cleanup. If provider p95
is above 2.0 s, open a Brevo/Supabase provider incident with request IDs and the
phase histogram. If render p95 is above 250 ms, dynamically load only the
selected template and rerun. If hook total p95 is below 3.0 s but Auth remains
above 5.0 s, escalate to Supabase with Auth request IDs. Do not queue the email
after returning success; that would weaken confirmation delivery semantics.

- [ ] **Step 5: Verify and commit**

```powershell
npm run runtime -- npm test -- src/test/AuthContext.test.tsx src/test/Navbar.behavior.test.tsx src/test/Dashboard.behavior.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run test:deno
npm run runtime -- npm run typecheck
git add src/contexts/AuthContext.tsx src/components/Navbar.tsx src/pages/Dashboard.tsx src/test/AuthContext.test.tsx src/test/Navbar.behavior.test.tsx src/test/Dashboard.behavior.test.tsx supabase/functions/auth-email-hook/index.ts supabase/functions/auth-email-hook/index.test.ts supabase/functions/_shared/brevo.ts supabase/functions/_shared/brevo.test.ts
git commit -m "perf: make logout local-first and expose signup phases"
```

---

### Task 9: Remove listing-wizard startup work and guarantee cleanup

**Files:**

- Create: `src/hooks/useActorOwnedActiveListingCount.ts`
- Create: `src/test/useActorOwnedActiveListingCount.test.tsx`
- Modify: `src/pages/CreateListing.tsx`
- Modify: `src/hooks/useCreateListingConnections.ts`
- Modify: `src/test/CreateListing.test.tsx`
- Modify: `src/test/useCreateListingConnections.test.tsx`
- Create: `e2e/helpers/listingPerformanceFixture.ts`
- Create: `e2e/listing-publish-performance.spec.ts`
- Modify: `e2e/helpers/liveSafety.ts`

**Interfaces:**

- `useActorOwnedActiveListingCount()` performs an authenticated head/count
  query filtered by `owner_id=auth.uid()` and `status=active`; it returns
  `{ count, isLoading, error }` without listing rows or owner enrichment.
- `listingPerformanceFixture` returns
  `{ listingId, title, createdAtUtc, cleanup(): Promise<void> }`; `cleanup()` is
  idempotent and verifies both management and public absence.

- [ ] **Step 1: Add failing startup-request tests**

Assert a create-mode wizard does not call the deprecated
`get_public_listing_catalogue`, does not download actor listing rows just to
count quota, and renders Step 1 while non-authoritative connection diagnostics
are unresolved.

- [ ] **Step 2: Remove the remote connection probe**

Change `useCreateListingConnections` to report build/runtime capability only:
Supabase client configured, storage URL construction available, and selected
location provider. Actual database, storage, and geocoder failures remain
surfaced by their real operations. Delete the mount-time catalogue RPC.

- [ ] **Step 3: Replace the full-row quota preflight**

Implement the head/count hook with `.select("id", { count: "exact", head: true })`,
`.eq("owner_id", user.id)`, and `.eq("status", "active")`. The server-side
`create_listing_for_user` quota remains authoritative and race-resistant; the
count exists only for early UX.

- [ ] **Step 4: Lazy-load and preload wizard steps**

Keep `StepType` static. Convert Steps 2–6 to shared lazy importers. After each
step renders, start the next step importer during idle time; also start it on
Next-button pointer enter/focus. Use a stable form skeleton during the first
load and preserve entered state in `useListingForm`.

- [ ] **Step 5: Add cleanup-first publish timing**

Before publishing, the E2E helper signs in as `seller.pro@maiprop.demo`, proves
`delete_listing_for_user` can remove a disposable draft in isolated staging,
then creates one uniquely tagged no-photo listing. Capture create RPC,
property-route, next publication, and public API visibility separately. Always
delete the exact ID in `finally` and fail the run if residue remains.

Production mutation remains disabled unless the Task 3 three-variable guard is
present. Never reuse or delete the pre-existing
`8ddf4888-d5a4-4c37-8562-08de1923240a` row without a separate ownership audit.

- [ ] **Step 6: Verify and commit**

```powershell
npm run runtime -- npm test -- src/test/CreateListing.test.tsx src/test/useCreateListingConnections.test.tsx src/test/useActorOwnedActiveListingCount.test.tsx --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
npm run runtime -- npx playwright test e2e/listing-publish-performance.spec.ts --project=chromium
git add src/hooks/useActorOwnedActiveListingCount.ts src/test/useActorOwnedActiveListingCount.test.tsx src/pages/CreateListing.tsx src/hooks/useCreateListingConnections.ts src/test/CreateListing.test.tsx src/test/useCreateListingConnections.test.tsx e2e/helpers/listingPerformanceFixture.ts e2e/listing-publish-performance.spec.ts e2e/helpers/liveSafety.ts
git commit -m "perf: remove listing wizard startup probes"
```

---

### Task 10: Audit and repair listing ownership consistency

**Files:**

- Read: `supabase/migrations/20260726220701_correct_active_listing_quota_and_managed_catalogue.sql`
- Read: `supabase/migrations/20260728093154_align_managed_catalogue_and_promotion_principal.sql`
- Test: `src/test/activeListingQuotaAndManagedCatalogueMigration.test.ts`
- Test: `e2e/rls-security.spec.ts`
- Create a migration only if the post-Release-A audit proves an RPC/RLS defect.

**Interfaces:**

- Consumes the exact QA listing ID and seller demo Auth user ID.
- Produces one of two closed outcomes: fixture archived/deleted because its
  owner is wrong, or a reviewed migration because the owner is correct but the
  management RPC omits it.

- [ ] **Step 1: Audit without mutating**

Using an authorized admin read in Supabase, compare the QA row's `owner_id`,
`organization_id`, `status`, and creator metadata with the authenticated seller
demo user. Then call `get_manageable_listing_catalogue_page` as that seller and
record whether the exact ID is returned.

- [ ] **Step 2: Follow the deterministic branch**

- If `owner_id` is null or belongs to another account, classify the row as an
  old synthetic fixture and remove/archive it through the production fixture
  cleanup path after explicit exact-ID confirmation. No schema change follows.
- If `owner_id` equals the seller user but the management RPC omits it, reproduce
  the omission in isolated staging, add a failing pgTap/RLS test, and create a
  migration with `supabase migration new repair_manageable_listing_visibility`.
- If the RPC returns the row after Release A, close the issue as obsolete-live-
  build behavior and retain the regression test only.

- [ ] **Step 3: Verify authorization boundaries**

Prove owner, active organization manager, platform admin, unrelated user, and
anonymous visibility/delete behavior. The repair must not broaden unrelated
authenticated access.

```powershell
npm run runtime -- npm test -- src/test/activeListingQuotaAndManagedCatalogueMigration.test.ts --maxWorkers=1 --reporter=dot
npm run runtime -- npx playwright test e2e/rls-security.spec.ts --project=chromium
npm run runtime -- npm run lint:migrations
npm run runtime -- npm run check:supabase-advisor
```

- [ ] **Step 4: Commit only if code or migration changed**

```powershell
git add supabase/migrations src/test/activeListingQuotaAndManagedCatalogueMigration.test.ts e2e/rls-security.spec.ts
git commit -m "fix: align listing ownership and management visibility"
```

---

### Task 11: Add continuous performance monitoring and release gates

**Files:**

- Create: `.github/workflows/live-critical-performance.yml`
- Modify: `scripts/perf-evidence-contract.mjs`
- Modify: `scripts/perf-evidence-contract.test.mjs`
- Modify: `docs/OBSERVABILITY.md`
- Modify: `docs/SLO.md`

**Interfaces:**

- Consumes the Task 3 JSON report.
- Produces a 90-day GitHub artifact, a compact workflow summary, and a failed
  check when a release ceiling is exceeded.

- [ ] **Step 1: Add failing evidence-contract tests**

Require deployed SHA, UTC window, sample counts, p50/p95, HTTP status, cache
state distribution, action status, and cleanup proof for mutating staging runs.
Reject reports with fewer than five samples per non-mutating action or missing
release identity.

- [ ] **Step 2: Add two scheduled modes**

- Every five minutes: anonymous landing, listings, homepage API, and catalogue
  API probes with no account secrets.
- Daily: sign-in, dashboard, wizard shell, and sign-out using the demo account;
  signup and publish remain staging-only.

Use `concurrency` to prevent overlapping monitors, retain artifacts for 90
days, and never cancel an in-progress measurement.

- [ ] **Step 3: Add alert policy**

Fail immediately on any cold 5xx in a release gate. For scheduled monitoring,
open or update one deduplicated incident after two consecutive failed runs and
close it only after three consecutive green runs. Include SHA, route, p95,
status/cache distribution, and workflow URL; never include credentials.

- [ ] **Step 4: Document operational targets**

Add the spec budgets to `docs/SLO.md` and document owners:

```text
Catalogue/API: Platform
Landing/bundle/CWV: Frontend
Auth/email: Identity + Messaging provider
Dashboard/wizard: Product Frontend
Release/provider bindings: Release Engineering
```

- [ ] **Step 5: Verify and commit**

```powershell
npm run runtime -- node --test scripts/perf-evidence-contract.test.mjs
npm run runtime -- npm run check:perf-proof
npm run runtime -- npm run check:release-safety
git add .github/workflows/live-critical-performance.yml scripts/perf-evidence-contract.mjs scripts/perf-evidence-contract.test.mjs docs/OBSERVABILITY.md docs/SLO.md
git commit -m "ci: enforce sustainable live performance budgets"
```

---

### Task 12: Verify, review, deploy Release B, and close the program

**Files:**

- Verify all files changed by Tasks 3 and 5–11.
- Do not add unrelated changes while preparing the release.

**Interfaces:**

- Consumes: green task commits and Release A production baseline.
- Produces: merged Release B SHA, protected staging and production evidence,
  final before/after table, and a 24-hour sustainability result.

- [ ] **Step 1: Run deterministic verification**

```powershell
npm run runtime -- npm test -- --maxWorkers=1 --reporter=dot
npm run runtime -- npm run typecheck
npm run runtime -- npm run typecheck:functions
npm run runtime -- npm run test:deno
npm run runtime -- npm run lint
npm run runtime -- npm run build
npm run runtime -- npm run check:bundle-size
npm run runtime -- npm run lint:migrations
npm run runtime -- npm run check:release-safety
npm run runtime -- npm run check:perf-proof
npm run runtime -- npm run test:perf
```

Any full-suite failure is rerun by exact file serially. Assertion failures are
fixed; only verified infrastructure contention is recorded as such.

- [ ] **Step 2: Review each workstream and the aggregate diff**

Use a fresh reviewer for catalogue/cache, frontend bundle, Auth, Supabase/RLS,
fixture cleanup, and release workflow changes. Resolve every Critical or
Important finding and rerun the affected focused tests.

- [ ] **Step 3: Merge through branch protection**

Push the `codex/` branch, wait for required checks, merge, and resolve the new
full remote `main` SHA using `git ls-remote`. That SHA becomes Release B; do not
reuse Release A artifacts.

- [ ] **Step 4: Repeat Tasks 1 and 2 for Release B**

Build a new immutable attempt-one candidate, run isolated staging, obtain a new
independent exact-SHA approval, deploy through the coordinated workflow, and
verify the live marker and signed aggregate.

- [ ] **Step 5: Run the final measurement**

Run 30 cold and 30 warm public samples, five fresh-browser samples for every UI
action, one duplicate signup, three sign-in/sign-out cycles, and one
cleanup-proven staging publish. Production publish runs only under the explicit
Task 3 mutation guard.

- [ ] **Step 6: Require a 24-hour sustainability window**

Completion requires:

- every p95 at or below its release ceiling;
- public API 5xx below 0.5% for the release gate and below 0.1% target across
  the 24-hour window;
- no cache state outside its configured business-validity window;
- Lighthouse LCP ≤3.0 s, CLS ≤0.1, and INP ≤200 ms;
- no duplicate same-user profile hydration;
- no fixture residue or management/public ownership mismatch;
- production marker remains the Release B SHA for the entire window.

If any condition fails, keep the program open, attach the failing samples to
the responsible workstream, and do not describe production as “fully boosted.”

---

## Rollback and stop conditions

- Stop Release A or B before production when staging catalogue bootstrap,
  exact-SHA browser proof, migration convergence, N-1 compatibility, runtime
  binding proof, security gates, or performance ceilings fail.
- A Cloudflare post-deploy failure uses the workflow's captured deployment ID
  and verifies the old SHA after rollback. Never select an arbitrary deployment
  in the dashboard.
- Database and Edge changes are not rolled back by Pages rollback. Repair them
  with an additive forward fix; never rewrite or delete an applied migration.
- A signup optimization must not acknowledge success before the email provider
  accepts the confirmation message.
- A dashboard-shell optimization must not expose role-gated data while profile
  authorization is unresolved.
- A listing performance test must stop before creation when exact-ID cleanup is
  not proven.

## Expected sequence and elapsed time

| Phase | Expected active time | External wait |
| --- | ---: | ---: |
| Provider bootstrap | 30–60 min | Stripe email and TURN activation |
| Release A staging/approval/deploy | 60–120 min | GitHub runners and independent approval |
| Release A remeasurement | 30–45 min | None |
| Release B implementation | 2–4 engineering days | Provider response if signup is external |
| Release B staging/approval/deploy | 60–120 min | GitHub runners and independent approval |
| Final measurement | 45–60 min | None |
| Sustainability proof | 24 h | Scheduled monitoring window |
