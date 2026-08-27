# Staging Scale Proof

The standalone `Staging Scale Proof` workflow is currently hard-disabled. It
must not receive database credentials or seed staging independently. Scale
proof can be re-enabled only after it is invoked from the exact-SHA
`stage-release.yml` lease and inherits that workflow's CI, target, and mutation
acknowledgement controls.

## Safety contract

- The database target must identify Supabase project `xsiehskfgeoqyazcgauv`.
- The production project ref is rejected independently.
- The run must originate from the exact release SHA accepted by
  `stage-release.yml`.
- The exact provider-proof latch and staging mutation acknowledgement must be
  validated before database credentials are exposed.
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

## Planned execution order

1. `1,000` listings with `baseline_100`.
2. `10,000` listings with `growth_10x`.
3. `10,000` listings with `enterprise_soak`.

Once the proof is routed through the release lease, each run will capture
catalogue query plans, buffer usage, index counters, route p95 latency, error
rates, request volume, and peak VUs. Failed runs must still invoke cleanup. If a
runner is force-terminated before cleanup, the next leased run must first
remove all rows carrying the `ecas-load:` tag.
