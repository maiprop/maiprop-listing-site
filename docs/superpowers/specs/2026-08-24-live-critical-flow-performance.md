# Live Critical-Flow Performance Design

**Date:** 2026-08-24

**Scope:** landing, catalogue, sign-up, sign-in, dashboard entry, listing creation, and newly-created listing visibility
**Production origin:** `https://portal.maiprop.co`

## Objective

Make the critical public and authenticated journeys feel responsive, remove the
known repeated work, and release the already-built catalogue architecture that
production is missing. Success is measured from an exact deployed SHA; a green
local build or a warm synthetic endpoint is not accepted as proof.

## Evidence and diagnosis

### Timed live journey

| Action | Observed time | Interpretation |
| --- | ---: | --- |
| Cold landing to meaningful content | 933 ms | Already within the target. |
| Landing to `/listings` usable shell | 1,832 ms | Slightly slow. |
| Listings shell to cards | +4,313 ms | Critical user-facing bottleneck. |
| `/listings` to `/signup` | 3,332 ms | Route transition is too slow. |
| Sign-up submit to confirmation | 11,172 ms | Critical; Auth server recorded 4.38 s, so the browser delay is not solely React work. |
| Confirmation to sign-in | 961 ms | Acceptable. |
| Sign-in submit to usable dashboard | 3,245 ms | Slow; repeated Auth/profile work is visible. |
| Dashboard to new-listing wizard | 1,053 ms | Acceptable. |
| Wizard step transitions | 389–484 ms | At the upper edge of the interaction budget. |
| Publish to toast/property route | 1,726 ms | Acceptable for a no-photo listing. |
| Property route to rendered detail | +837 ms | Acceptable. |
| Publish to public visibility | 10,378 ms | Too slow and not governed by a stated freshness SLO. |

### Production parity

- Repository `main` was `40e61b4d1c127d611f1446d514473d867b6af326` at diagnosis.
- Production `/deploy-version.json` reported
  `db53d1b9adae41edae93fbeb3e612b42dd8fec0b`, eleven commits behind.
- The live SHA predates
  `20260728123058_materialize_public_catalogue_snapshots.sql` and
  `20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql`.
- Both production and staging currently expose the old
  `get_public_listing_catalogue()` view-backed path; neither currently has
  `private.public_catalogue_versions`.
- The current release train deliberately stopped automatic production
  mutation. An exact-SHA staged candidate, independent approval, and the
  coordinated production workflow are required.

### Database and API evidence

- Production `pg_stat_statements` shows slow catalogue statement shapes with
  approximately 4.0–5.6 s mean execution and 6.9–7.7 s maxima.
- The old view reads a roughly 49,865-row listings table. The production
  `listing_images` statistics show about 43.4 million sequential scans and no
  index scans, consistent with the expensive view projection.
- A cold live listings request returned 503 after about 5.1 s. A repeated cold
  request did the same. A warm cached one-row sale request returned in 109 ms.
- The current worker has a 5 s producer deadline. When an upstream producer
  finishes successfully after that deadline, the caller receives a bounded 503
  but the successful response is discarded instead of seeding the cache.
- The repository already replaces the old view path with typed,
  publication-pinned reads over indexed immutable catalogue versions. The
  migration bootstraps a publication and schedules publication every minute.

### Auth evidence

- The production Auth log recorded the measured sign-up request at about
  4.38 s, including a successful email hook. The browser measured 11.17 s.
- The password sign-in token request was about 462 ms.
- Two near-concurrent `/user` requests took about 0.86 s and 3.06 s. The current
  Auth provider coalesces subscription reconciliation but not same-user profile
  hydration.

### Frontend consistency evidence

- `useListingForm` calls the listing boundary directly and bypasses the shared
  catalogue-query invalidation used by `useListingMutations`.
- Default sale and rent grids can paint a fresh embedded snapshot while the
  canonical API refreshes. The truly unfiltered `/listings` route cannot use
  either snapshot and waits without cards.
- The live bundle is the old implementation and still contains the removed
  direct browser-to-Supabase public catalogue fallback. Current `main` keeps
  the public API as the single authority.

## Performance budgets

These are release targets, measured at p95 unless a row explicitly says
otherwise. They refine, but do not weaken, `docs/SLO.md`.

| Journey or service | Sustainable target | Release ceiling |
| --- | ---: | ---: |
| Landing meaningful content | 1.5 s | 3.0 s |
| Client route to usable shell | 1.0 s | 1.5 s |
| First useful catalogue paint | 1.0 s | 1.5 s |
| Warm 12-card public catalogue API | 500 ms | 1.0 s |
| Cold 12-card public catalogue API | 1.0 s | 1.8 s |
| Public API 5xx rate | <0.1% | <0.5% |
| Password sign-in to usable dashboard | 2.0 s | 3.0 s |
| Same-user profile hydration requests per auth transition | 1 | 1 |
| Sign-up server request | 3.0 s | 5.0 s |
| Sign-up submit to confirmation UI | 5.0 s | 8.0 s |
| Wizard step interaction | 200 ms | 500 ms |
| No-photo publish to property route | 2.0 s | 2.5 s |
| New active listing to next public publication | 60 s | 75 s |
| New publication to public API visibility | 1.0 s | 5.0 s |

The public-visibility budget is intentionally split. Publication freshness and
edge/API propagation are distinct systems and need distinct alerts.

## Design

### 1. Release the existing materialized catalogue architecture

The exact merged SHA must pass the normal immutable candidate and isolated
staging release. Staging must apply the existing snapshot migrations, bootstrap
a retained publication, and prove that `query_public_catalogue` uses the staged
snapshot tables. Only after those proofs pass may the coordinated production
workflow apply the same migration chain and deploy the matching Pages worker.

No direct production migration is added to this change. The repository already
contains the necessary structural migration, and running a second speculative
rewrite before staging the first would increase rollback risk.

### 2. Preserve a successful late cache producer

`cachedJson` keeps the 5 s caller deadline. If the underlying producer is still
running at the deadline, its promise is registered with `ctx.waitUntil`. A
later successful, cacheable response seeds both fresh and stale Cache API
entries. While that late task is pending, the existing in-flight entry remains
present, so followers receive the already-bounded result instead of starting
another expensive producer. Non-2xx, expired, or `no-store` late responses are
never cached. Rejections are logged and contained.

This changes resilience, not the caller-facing deadline. It cannot make the
first cold request wait indefinitely.

### 3. Coalesce same-user profile hydration

`AuthProvider` tracks one in-flight profile/membership request by user ID and
identity generation. Only startup reconciliation paths (`getSession`,
`INITIAL_SESSION`, and equivalent same-session auth callbacks) may coalesce
onto that promise. Explicit refresh and post-update reads always replace any
in-flight startup read so they cannot inherit pre-update data. A different
user or a sign-out/same-user-sign-in boundary always starts a new generation,
and stale generations remain unable to update state or clear a newer loading
state. The in-flight slot clears after its exact promise settles.

Subscription reconciliation remains independent and unchanged.

### 4. Invalidate catalogue state after the listing wizard succeeds

After create or update plus image-row reconciliation succeeds,
`useListingForm` invokes the same centralized catalogue invalidation helper as
the mutation hooks. It passes the listing ID, invalidating management lists,
public lists, homepage-derived queries, and detail state. Invalidation is
fire-and-forget so cache bookkeeping cannot extend the publish-to-navigation
critical path. A failed mutation does not invalidate.

This is client consistency, not a substitute for the one-minute publication
process.

### 5. Paint a safe mixed placeholder on the default catalogue route

For an otherwise-unfiltered request with no listing type, combine the fresh
embedded sale and rent first pages, retain only `sale`, `rent`, and
`new_build` rows, deduplicate by listing ID, order newest first with stable ID
tie-breaking, and keep the first twelve. The mixed placeholder is deliberately
cursorless (`hasMore: false`, `nextCursor: null`) and omits publication
metadata because its two source snapshots need not share a publication.
React Query uses the result only as `placeholderData` and immediately performs
the canonical unfiltered API request. Any city, price, property, feature,
type, pagination, or non-default sort prevents the placeholder. Empty or
expired embedded data does not suppress the loading state.

The placeholder is presentation-only and never becomes a second catalogue
authority.

## Required release and operations actions

### In this release

1. Land the four bounded changes above with task-scoped reviews.
2. Run focused tests, deterministic serial reruns of known timeout-sensitive
   tests, type checks, Functions type checks, lint, production build, bundle
   budget, migration lint, and release-safety checks.
3. Push the feature branch, merge through the repository's protected path, and
   identify the exact full SHA now at `main`.
4. Build the immutable candidate for that SHA.
5. Run the isolated staging release. Require the snapshot migrations, current
   publication, public API budgets, exact-SHA browser proof, query budgets,
   Lighthouse/CWV gates, security checks, and N-1 compatibility proof.
6. Obtain the repository-required independent production approval.
7. Dispatch `Deploy Production Release` with the exact SHA and
   `DEPLOY_PRODUCTION_RELEASE` confirmation. Do not bypass the workflow or
   mutate Cloudflare/Supabase independently.
8. Verify `/deploy-version.json`, `/api/release`, migration parity, Edge
   function parity, Pages SHA, and the signed aggregate.
9. Repeat the same live journey with cold and warm catalogue samples. Record
   each action, API request count, cache state, and duration.

### Immediately after deployment

1. Compare production `pg_stat_statements` for the typed catalogue RPC to the
   old 4–5.6 s means. The cold 12-card path must stay under 1.8 s and converge
   toward the 500 ms SLO when warm.
2. Confirm no public browser request uses direct listings REST/RPC fallback.
3. Confirm one profile/membership hydration set per same-user auth transition.
4. Measure sign-up Auth duration, email-hook duration, network duration, and UI
   settlement separately. If Auth remains above 3 s, inspect Auth and Edge hook
   logs; if the hook is fast but Auth is slow, open a provider incident with the
   request IDs. If browser overhead exceeds 1 s beyond the Auth response, trace
   the client transition.
5. Measure publication lag and API propagation separately for a tagged test
   listing. Alert when publication lag exceeds 75 s or propagation exceeds 5 s.
6. Remove the exact QA listing created by this audit after visibility proof and
   retire the disposable QA account through the approved admin path.

### Sustaining work, gated by production evidence

1. Add daily synthetic browser timings for landing, catalogue, sign-in, and a
   non-mutating authenticated dashboard route. Keep sign-up/listing creation in
   the isolated staging release because they mutate data and send mail.
2. Add dashboards and alerts for catalogue p50/p95/p99, cold-miss rate, cache
   HIT/MISS/STALE/COALESCED distribution, producer timeouts, late-seed success,
   Auth `/signup`, Auth `/token`, profile hydration, publication lag, and public
   propagation lag.
3. Tighten the single-request release ceilings toward the service SLO only
   after two clean exact-SHA staging runs and one clean production observation
   window. Do not lower gates blindly and strand emergency releases.
4. Re-enable the lease-bound staging scale proof and run 1k and 10k listing
   datasets before claiming 10x sustainability.
5. Review unused indexes only with a full representative query-history window.
   Do not drop the advisor's INFO-only indexes as part of this latency fix.
6. If the materialized catalogue still misses the cold SLO, capture
   `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` in isolated staging and optimize
   the observed scan/sort. No index or function rewrite is authorized by a
   guess.
7. If publication freshness is the remaining bottleneck, design a debounced
   dirty-queue publisher or publication-aware cache namespace in staging. Keep
   listing writes fast and avoid synchronous full-catalogue publication.
8. If photo-heavy listing creation exceeds 2.5 s after uploads are complete,
   time geocoding, the listing RPC, image-row reconciliation, and navigation
   separately; then batch only the measured serial database segment.

## Safety and rollback

- Do not weaken branch protection, approval separation, release leases,
  migration convergence checks, or exact-SHA binding to gain speed.
- Do not add browser-to-Supabase public catalogue fallback.
- Do not cache errors or responses outside their business-validity boundary.
- Do not drop production indexes during this release.
- Production rollback uses the attempt-qualified N-1 artifacts and the
  repository runbook. A failed database/Edge deployment must not be combined
  with an unrelated Pages recovery run.
- If staging snapshot bootstrap, N-1 compatibility, public API budgets, or the
  exact-SHA browser proof fails, stop before production.

## Acceptance

The work is complete only when the merged exact SHA is deployed, release
identity is proven, all mandated gates pass, the live flow is retimed, and the
results are compared to the table above. A security-policy approval that must
come from a different human is a legitimate external gate; it must be reported
as such and never bypassed.
