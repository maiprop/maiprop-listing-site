# Auction recovery — 21 September 2026

Production auctions are still unavailable. Read-only checks identify a deployment mismatch; the auction records remain in the database. The current source already contains the public-runtime loading fix, while production runs an older worker. Releasing only the website would also fail because production lacks the required auction database functions.

## Verified live state

- Production `/api/public/auctions?limit=60&page=1&pageSize=24` returns HTTP 503 with `Supabase runtime is not configured`.
- `/runtime-config.js` returns 200 and contains a public Supabase key and the production project URL. No credentials are recorded in this evidence.
- `/api/release` identifies production as `5cf9ba49eafdc19d2e8746bc877f33b08bad0dae`; current main at diagnosis is `44759128d5e8c88c1c21d1a20adfaa8667d6e1c8`.
- The deployed auction handler requires `getSupabaseServiceRuntime`; current main uses the public runtime. Production Pages deliberately forbids a service-role binding. Adding that credential is not the recovery procedure.
- Production is missing `get_public_auction_candidates`, `get_current_auction_listing_visible_limit` and `get_visible_auction_candidate_envelope`. A public REST probe of the envelope returns 404/PGRST202.
- Production has 53,460 auction records, with 29,487 dated today or later at the query time. These counts include records that may not satisfy publication rules; they are not a claim about the public catalogue count.
- Production migration history has 420 rows, versus 450 on staging. The evidence JSON lists the 30 candidate versions absent from production history. Existing historical reconciliation must still run; never mark missing migrations applied without checking their effects.
- Staging has the required functions, permits anonymous access to the bounded envelope, denies anonymous access to the underlying candidate function, and returns a valid HTTP 200 empty auction page for its current data. Its deployed SHA is `fd13c83dcd1f2ac5a496abde11b419d0cc4eb1e1`, so this does not satisfy a new candidate's exact-SHA staging gate.

## Changes in the isolated recovery branch

The previously tested auction action changes are isolated from the unfinished project-wide work. Save, remove and report use the canonical internal listing ID even when the public route uses an OS identifier. Favorites use one page-level query, bind pending operations to the initiating account, and roll back failed writes. Reporting uses a shared authenticated insert with honest failure feedback. The mutation inventory follows that shared hook and removes the two obsolete component entries.

The existing module-size and request-boundary reviews had expired and caused the scheduled CI run to fail before building a candidate. Their current limits and guards were rechecked, with a time-limited review renewal to 5 October. No size limits, validation styles or release approval requirements were relaxed. `2026-09-21-auction-release-review.json` records hashes, measured sizes and the limits of that review. This is maintenance of existing exceptions, not completion of the wider refactor.

## Recovery sequence and spending boundary

1. Finish all local validation and push this branch with `[CF-Pages-Skip]`; do not create a PR or dispatch a workflow merely to diagnose the incident.
2. With the user's release-spending authorization, run one controlled release cycle for the reviewed candidate. Merge through the repository's normal checks and bind all subsequent evidence to the resulting exact main SHA.
3. Obtain fresh CI, signed staging, Stripe readiness and production approval evidence required by the existing workflows. The configured single-admin authorization expired on 8 September; an allowlisted approver or a newly authorized, exact-SHA incident window is required. Do not reuse an expired authorization or another actor's identity.
4. Use the coordinated production release, including its migration-history reconciliation and database capability checks, before promoting the matching website artifact. The old release failed while validating a consumption receipt; the correction is already in main as `22becf98`. The readiness propagation correction is already in main as `44759128`.
5. Stop on a failed gate and diagnose locally before another paid run. Do not manually apply a subset of the historical migrations or inject a production service-role key to bypass the release.
6. Verify the live release marker, non-empty valid auction response, filters and pagination, UUID and OS detail routes, access-tier caps, and authenticated save/remove/report. Record actual production cold/warm timings only after restoration. Do not claim success from staging's empty response.

The current branch does not add the unfinished alert-delivery or enrichment work. Those remain separate functional follow-ups after the catalogue is restored. No production records, credentials, workflows or deployment settings were changed during this diagnosis.

## Local validation

- Seven focused action/consumer suites: 66 tests passed.
- Public API, auction hook and release-capability migration suites: 165 tests passed.
- Frontend and Pages Functions type checks passed.
- Production frontend build passed; all 175 bundle checks passed.
- Existing request-boundary tests: 48 passed with network permission disabled. The coordinates tests accept transport failure and do not prove provider availability.
- Secret scan, lint and enterprise readiness checks passed.
- Full regression suite: 529 files and 4,650 tests passed in 383.73 seconds.
- A separate final check of the updated release inventories: 26 tests passed.

Evidence: [sanitized live diagnosis](2026-09-21-auction-recovery-evidence.json), [time-limited release review](2026-09-21-auction-release-review.json).
