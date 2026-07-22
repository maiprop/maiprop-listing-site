# Staging Scale Proof

The `Staging Scale Proof` workflow exercises the real Cloudflare Pages public
catalogue against the isolated Supabase staging project. It is manual because
the 1,000-VU growth profile and 40-minute soak consume provider capacity.

## Safety contract

- The database target must identify Supabase project `xsiehskfgeoqyazcgauv`.
- The production project ref is rejected independently.
- The operator must type `RUN_STAGING_LOAD`.
- The URL must be the protected staging Pages hostname or a branch Pages URL.
- Synthetic rows are tagged with `ecas-load:<run-id>` and cleaned before and
  after every run.
- The seeder performs database-only writes. It does not invoke Stripe, Edge
  Functions, email, SMS, or external webhook workflows.
- Promotion notifications are disabled only inside the seed transaction and
  are re-enabled before commit.

## Dataset shape

Both supported sizes use the same production-like mix:

- 55% sale, 30% rent, 5% auction, 5% Open House, 5% new-build listings.
- Organizations and memberships distributed across the seeded inventory.
- Two images per listing.
- One project and six units per new-build listing.
- One percent Spotlight and one percent Priority allocations, excluding Open
  Houses.
- Greek city, price, area, coordinate, and created-date distributions.

## Execution order

1. `1,000` listings with `baseline_100`.
2. `10,000` listings with `growth_10x`.
3. `10,000` listings with `enterprise_soak`.

Each run captures catalogue query plans, buffer usage, index counters, route
p95 latency, error rates, request volume, and peak VUs. Failed runs still invoke
the cleanup step. If a runner is force-terminated before cleanup, the next run
first removes all rows carrying the `ecas-load:` tag.
