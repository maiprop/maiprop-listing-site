# Auction-only recovery: local preparation

**Local preparation verified; not a live restoration or deployment authorization artifact.** No GitHub CI, staging mutation or production deployment was dispatched for this preparation.

The rejected broader database catch-up is preserved separately in local Git stash `a76838f46c5065a794b1d73fa6761c133acceeeb`. It is not part of this change. The new forward migration restores only three missing auction functions and one auction ordering index. It leaves the existing account-limit helper, lead and role schemas, billing functions, data and historical migration records alone.

The public envelope enforces the Free 60 / maximum 600 row limits from the authenticated caller. Review exposed two defects inherited from the earlier envelope: direct free RPC callers could use paid filters, and arbitrary clock parameters could revive expired auctions or alter promotion classification. The recovery ignores premium filters for free callers and derives the catalogue clock from server UTC midnight. The internal candidate reader remains restricted to `service_role`; Pages needs only its existing public Supabase runtime.

The migration must be applied in a single transaction, as demonstrated by `psql -1` in the disposable test harness. Its local lock timeout is three seconds and statement timeout is sixty seconds. A conflicting index definition, missing dependency or publicly exposed entitlement helper aborts the recovery. A failed index check was verified to roll back all newly created functions.

## Scoped website source

`scripts/prepare-auction-only-source.mjs` starts from the recorded live SHA `5cf9ba49eafdc19d2e8746bc877f33b08bad0dae` and replaces exactly 13 files from the reviewed candidate commit. They cover the auction endpoint, auction page/cards, translations and required shared favorites/cache/detail dependencies. Pricing, checkout functions, account-role code and the build configuration remain at their live source versions. Shared dependencies can also affect ordinary property pages; that limited shared impact is explicit.

The preparer reads committed blobs, rejects ambiguous commit references and existing output directories, restores files transformed or omitted by Git archive attributes, and hashes the complete prepared source. The source manifest records both input SHAs; a future executor must not label this mixed source as the unmodified main tree. Source manifests are preparation evidence, not substitutes for signed build/deployment evidence.

The local build used source candidate `72f91b2f6b65d2d16bf10f22bce88a0b0a1e4cb7`. Its complete source SHA-256 is `d2c24c2b51dcda71b40d56a981f33eeb221cd000fdfadff8d8ced743b90b9952`. Generated source, manifest and build are under `.tmp/auction-only-source-20260921-v2`; focused test files were subsequently copied into this temporary tree solely to run current tests against the prepared runtime.

## Fresh local evidence

- 35 PostgreSQL checks passed in a disposable local PostgreSQL 18.4 cluster. They include missing-function reproduction, anonymous/free/paid bounds, exclusions, filters, daily-pool fallback metadata, privacy, image limits, deterministic ordering, direct-RPC bypass regressions, repeat application and transaction failures. Synthetic fixtures stub the existing account-limit helper; real paid production account behavior is not claimed.
- 203 auction API/page/action tests passed against the prepared source, including favorite/report behavior. These are contract/component tests, not a live production end-to-end test.
- Nine source/recovery contract tests passed, including archive attributes and preservation of live Pricing/checkout.
- Frontend and Pages Functions type checks, production frontend build and Pages-worker compilation passed.
- Migration idempotency/chronology, enterprise readiness and whitespace checks passed.
- Independent review of the scoped preparation passed after the two verified fixes.

The migration SHA-256 before Git line-ending normalization is `358340988a8acc7042f283a07a5c267a43171d93e5acc5b42171eb1534225a3c`. Release packaging must compute digests from the committed bytes, not reuse this local observation blindly.

## Remaining release work

The standard full-release workflow still requires whole-database parity and would replay unrelated migrations. The old catalogue hotfix is bound to a different website and migration set. Neither may be dispatched for this scoped recovery.

A dedicated release integration must bind the single migration and prepared website artifact to their exact inputs, retain current-main operator authorization and immutable evidence, rehearse transactional SQL and browser/API behavior on staging, and capture the current website rollback target. Production must receive the database capability before the matching website; unrelated Edge Functions must not be deployed. The live marker must truthfully identify the composed source. Finish this integration and its review before another paid run. Verify non-empty live auctions, paging/filtering, details, access limits and actions before claiming restoration.
