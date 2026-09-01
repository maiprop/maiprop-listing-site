# Wave 0 final-review fix report

Date: 2026-09-01
Worktree: `C:\Users\K R\OneDrive\Desktop\maiprop-listing-site\.worktrees\emergency-cloudflare-current-artifact`
Starting commit: `fc60bd8da90d1ea9d65dc0c742e1fbee7d8084dd`
Status: COMPLETE — all five blocking findings are implemented and verified. No push, deployment, live read, or live mutation was performed.

## Scope and constraints preserved

- Amended the unshipped `20260901120000_repair_subsecond_release_capabilities.sql` migration; no follow-up migration was added.
- Did not add or provision a production Supabase service-role binding.
- Kept `get_public_auction_candidates(integer,text,date,timestamptz,text)` executable only by `service_role`.
- Preserved the exact-auction publication reader and identity validation path.
- Preserved anonymous Cache API behavior while making all bearer-bearing requests private/no-store and Cache API-ineligible.
- Kept the source changes limited to the final-review findings and their tests.

## Finding 1 — current-user entitlement RPC and grants

### RED

1. `npx vitest run src/test/subsecondReleaseCapabilitiesMigration.test.ts`
   - Exit 1.
   - Three expected failures: no current-user RPC, visible wrapper still called the arbitrary-UUID helper, and the post-create assertion omitted the current-user RPC.
2. `npx vitest run functions/api/public/public-api.test.ts -t "validates a paid caller"`
   - Exit 1.
   - Paid response remained capped (`expected 20, received 0`) because the handler called the now-service-only arbitrary-UUID RPC.

### Implementation

- Added `public.get_current_auction_listing_visible_limit()` with no arguments, `SECURITY DEFINER`, empty `search_path`, and `auth.uid()` derivation.
- Revoked that function from `PUBLIC`, `anon`, and `service_role`; granted only to `authenticated`.
- Explicitly revoked the arbitrary-UUID helper from every role and re-granted only to `service_role`.
- Made the visible wrapper call the no-argument current-user helper.
- Changed Pages entitlement lookup to POST `{}` to `get_current_auction_listing_visible_limit`; the validated bearer remains the authorization context.

### GREEN

- Migration capability test: exit 0 (the then-current 4/4 tests passed).
- Paid caller handler test: exit 0 (1/1 targeted test passed).
- Final focused suite also covers the complete grant contract and passed 174/174.

## Finding 2 — filter before the visible cap

### RED

1. `npx vitest run src/test/subsecondReleaseCapabilitiesMigration.test.ts`
   - Exit 1 with three expected failures: old five-argument wrapper signature, no complete canonical filter boundary, and stale post-create signature.
2. `npx vitest run functions/api/public/public-api.test.ts -t "forwards every canonical filter"`
   - Exit 1: the fixture that represents a match beyond the former first-60 prefix returned `total: 0` instead of `1`.

### Implementation

- Replaced the unshipped five-argument visible wrapper with a 17-argument `SECURITY DEFINER` wrapper.
- The wrapper calls the underlying service-only boundary with a literal bounded pool of 600, filters that materialized pool, then applies `LEAST(caller limit, entitlement, 600)`.
- Pages forwards every canonical filter to the database boundary:
  - city substring;
  - base property type and land/commercial subtype tags;
  - inclusive bid, construction-year, and sqm ranges;
  - ownership aliases and ownership-percentage fallback;
  - exact round and `3plus` round;
  - low/medium/high/very-high estimated-yield buckets using the existing rent table and inclusive TypeScript bucket boundaries.
- TypeScript predicates remain as defense-in-depth after the database boundary.
- The raw 600-row RPC remains unavailable to `anon` and `authenticated`; only the filtered visible wrapper is public.

### GREEN

- Migration capability test: exit 0 (5/5).
- Canonical filter forwarding/beyond-old-cap test: exit 0 (1/1 targeted).
- Focused suite: exit 0, 174/174.

## Finding 3 — bearer presence bypasses shared cache

### RED

`npx vitest run functions/api/public/public-api.test.ts -t "bypasses shared cache for low-limit bearer presence"`

- Exit 1, both cases failed.
- `Bearer low-limit-token` and malformed `Bearer` responses still had public cache semantics and used Cache API operations.

### Implementation

- Added bearer-scheme presence detection independent of successful token parsing or requested limit.
- Any bearer presence bypasses `cachedJson`, receives `private, no-store` plus `CDN-Cache-Control: no-store`, and varies on `Authorization`.
- Anonymous requests continue through the unchanged Cache API path.

### GREEN

- Targeted low-limit/malformed bearer cases passed.
- The public API file then passed 134/134, and after the deadline additions its final count passed 137/137 as part of the focused/full suites.

## Finding 4 — aggregate deadline includes body consumption

### RED

1. `npx vitest run functions/api/public/public-api.test.ts -t "keeps the subordinate DB timeout active through candidate response-body reads"`
   - Exit 1: at 2,500 ms the response was still unsettled because the fetch timer had been cleared after headers.
2. `npx vitest run functions/api/public/public-api.test.ts -t "applies one aggregate deadline"`
   - Exit 1: after 5,000 ms the sequential auth, entitlement, and candidate body reads were still unsettled.
3. Self-review follow-up: `npx vitest run functions/api/public/public-api.test.ts -t "maps an exact-publication body timeout"`
   - Exit 1: the exact-publication body timeout escaped as a raw `TimeoutError` rejection.

### Implementation

- Added one 5,000 ms request deadline beginning before entitlement resolution and lasting through response production.
- Propagated its signal through auth lookup, current-user entitlement lookup, canonical candidate RPCs, exact-publication lookup, and exact-auction RPC lookup.
- Kept the 2,500 ms auth/DB/RPC limits as subordinate limits.
- Kept each timer and parent abort listener active through `json()`/`text()` consumption, not merely until response headers.
- Mapped exact RPC body-read timeouts to `SupabaseTransientError` while preserving invalid-JSON `SyntaxError` behavior.
- Bearer/authenticated timeout or transient responses return the existing 503 upstream contract through the private/no-store response path.

### GREEN

- Candidate body timeout test: exit 0 (settled private 503 at 2,500 ms).
- Aggregate sequential body test: exit 0 (settled private 503 at 5,000 ms).
- Exact-publication body timeout test: exit 0 (private 503 at 2,500 ms).
- `npm run typecheck:functions`: exit 0.
- Final public API test coverage is included in the 174-test focused suite and 4,522-test full suite.

## Finding 5 — smoke retries only transport/5xx

### RED

`npx vitest run src/test/liveOperationalSmokeWorkflow.test.ts`

- First RED: exit 1, 5/9 failed. Module invocation was absent, and 4xx, application-error, invalid-shape, and slow-first/fast-second scenarios incorrectly recovered on a later attempt.
- Additional strictness RED: exit 1, 1/10 failed. Invalid JSON was also being classified as retryable after response headers.

### Implementation

- Runs the embedded program with `node --input-type=module`, which supports its top-level `await` under the pinned Node 20 job.
- Retries only when `fetch` fails before a response is received or when the response status is 500–599.
- Treats 4xx, application error payloads, shape mismatch, invalid JSON, and API latency above 3,500 ms as terminal.
- Preserves three-attempt maximum, bounded 15-second per-attempt fetch timeout, and backoff only for retryable failures.
- Tests extract, de-indent, compile, and execute the actual heredoc program with deterministic fetch/clock fixtures. They do not merely assert substrings.

### GREEN

`npx vitest run src/test/liveOperationalSmokeWorkflow.test.ts`

- Exit 0.
- 10/10 passed, including transport-first/success, 503-first/success, 4xx-first/valid, app-error-first/valid, invalid-shape-first/valid, invalid-JSON-first/valid, and slow-first/fast-second behavior.

## Final verification

| Command | Result |
|---|---|
| `npx vitest run src/test/subsecondReleaseCapabilitiesMigration.test.ts src/test/publicAuctionCandidateBoundaryMigration.test.ts src/test/publicProfessionalsProjectionMigration.test.ts src/test/activeListingQuotaAndManagedCatalogueMigration.test.ts functions/api/public/public-api.test.ts src/test/publicListingProjectionConsumers.test.ts src/test/liveOperationalSmokeWorkflow.test.ts` | PASS — 7 files, 174 tests |
| `npm run typecheck` | PASS |
| `npm run typecheck:functions` | PASS |
| `npm run lint:migrations` | PASS — 170 migrations inspected, no violations |
| `npm run check:release-safety` | PASS — exit 0, workflow violations empty |
| `npm run runtime -- npm exec -- vitest run scripts/validate-cloudflare-pages-staging-posture.test.mjs` | PASS — 1 file, 23 tests under the project runtime |
| `npx eslint functions/api/public/auctions.ts functions/api/public/_cache.ts functions/api/public/public-api.test.ts src/test/liveOperationalSmokeWorkflow.test.ts src/test/subsecondReleaseCapabilitiesMigration.test.ts` | PASS |
| `npm run build` | PASS — 3,357 modules transformed; production build completed in 2.43 s |
| `npm run check:bundle-size` | PASS — all 174 chunks within budget |
| `npm test` | PASS — 516 files, 4,522 tests; 197.92 s |
| `git diff --check` | PASS — no whitespace errors (only configured LF-to-CRLF notices) |

The implementation plan's literal posture command, `npm run runtime -- node --test scripts/validate-cloudflare-pages-staging-posture.test.mjs`, exits 1 before running tests because this baseline file imports Vitest and Node's native runner cannot initialize Vitest's suite collector (`runner.config` is undefined). The same unchanged test passes 23/23 through Vitest under the pinned project runtime, as shown above. This is a pre-existing plan/runner mismatch, not a product regression.

## Files changed

- `.github/workflows/live-operational-smoke.yml`
- `functions/api/public/_cache.ts`
- `functions/api/public/auctions.ts`
- `functions/api/public/public-api.test.ts`
- `src/test/liveOperationalSmokeWorkflow.test.ts`
- `src/test/subsecondReleaseCapabilitiesMigration.test.ts`
- `supabase/migrations/20260901120000_repair_subsecond_release_capabilities.sql`
- `.superpowers/sdd/2026-09-01-production-parity-and-auction-recovery/final-review-fix-report.md`

## Self-review

- Security boundary: verified the arbitrary-UUID entitlement helper and raw 600-row RPC are service-role-only; the new current-user helper accepts no UUID and is authenticated-only; all definer functions use an empty search path and qualified object references.
- Filter parity: compared every database predicate with `parseAuctionFilters`, `auctionMatchesFilters`, `auctionOwnershipMatches`, `auctionRound`, and `yieldMatches`, including nullish bid/sqm behavior, inclusive ranges/bucket edges, tag ordering, ownership aliases, percentage fallback, and round semantics.
- Exact reads: publication lookup and duplicate/identity checks remain on the indexed exact-reader path; only deadline signal/body coverage was added.
- Cache posture: low-limit, invalid, timed-out, and paid bearer requests never call Cache API and are private/no-store; missing bearer callers retain public Cache API hit/put behavior.
- Deadline posture: aggregate and subordinate controllers remove listeners and clear timers in `finally`; candidate and exact RPC bodies remain under signal control; timeout/transient errors use the existing 503 contract.
- Workflow behavior: behavioral fixtures execute the extracted workflow source and prove both retryable and terminal sequences.
- Scope: `git status` showed only the seven expected implementation/test files before adding this report. No dependency, generated artifact, secret, production binding, deployment, or unrelated file was changed.

## Concerns / follow-up

- No blocking implementation concern remains.
- The amended migration was intentionally not applied to staging or production in this wave. Runtime migration application and `EXPLAIN (ANALYZE, BUFFERS)` evidence remain deployment-stage verification; no speculative index was added.
- The plan's stale Node-native posture-test command should be corrected separately to invoke Vitest. The correct pinned-runtime Vitest command passes now.
