# Production Incident and Predeployment Observation Baseline

- **Captured:** 2026-08-28 08:10–08:30 Europe/Athens (+03:00)
- **Production origin:** `https://portal.maiprop.co`
- **Live release SHA:** `db53d1b9adae41edae93fbeb3e612b42dd8fec0b`
- **Failed/superseded staging candidate SHA:** `31c35ebd1f714a2176b3b99268f594f2f01587f4`
- **Next release SHA:** the future protected-`main` PR merge SHA, resolved
  only after that reviewed merge completes

This is an incident and predeployment observation baseline, not the formal
immutable release go/no-go artifact. Browser route-shell timings are recorded
separately from the time at which property cards or authenticated data become
usable. The measurements below are limited to the stated sample counts and no
complete raw-artifact bundle is attached to this document. The prescribed
post-deploy comparison requires five cold and five warm non-mutating samples,
structured evidence, and the exact deployed SHA.

## User-visible result

The owner measured more than 10 seconds from opening Properties until property
cards loaded. An independent filtered-listings click committed the route after
3.47 seconds and still displayed the catalogue loader. The user-visible
baseline is therefore `>10 s`; sub-250 ms route-shell timings must not be
reported as property readiness.

## Public navigation

Anonymous Chrome measurements used one cold document load and five warm loads
per route, followed by five retained SPA transitions per route.

| Route | Cold document wall | Warm document p50 / p95 | SPA p50 / p95 |
| --- | ---: | ---: | ---: |
| `/` | 374 ms | 63 / 72 ms | 81 / 244 ms |
| `/listings` | 199 ms | 46 / 50 ms | 87 / 101 ms |
| `/pricing` | 192 ms | 58 / 74 ms | 80 / 85 ms |
| `/professionals` | 218 ms | 69 / 88 ms | 97 / 104 ms |
| `/login` | 219 ms | 66 / 75 ms | 67 / 72 ms |
| `/signup` | 206 ms | 73 / 75 ms | 71 / 83 ms |

`/professionals` returned an anonymous Supabase REST 401 and console error in
all 11 retained samples.

## Authentication

Three fresh isolated Chrome contexts used `buyer.free@maiprop.demo`.

| Action | Samples | p50 / p95 |
| --- | --- | ---: |
| Login page ready | 401, 552, 349 ms | 401 / 552 ms |
| Submit to usable dashboard | 5,591, 8,965, 2,864 ms | 5,591 / 8,965 ms |
| Sign out to anonymous UI | 926, 2,929, 1,291 ms | 1,291 / 2,929 ms |

The signup page was ready in 347 ms. A successful production signup was not
submitted because exact Auth-user cleanup was unavailable; no account was
created.

## Listing creation and cleanup

One uniquely tagged listing was created with the canonical seller account.

| Action | Duration / result |
| --- | ---: |
| Login | 624 ms |
| `/listings/new` ready | 970 ms |
| Wizard transitions | 52–85 ms |
| Create RPC | 318 ms, HTTP 200 |
| Submit to property route | 1,187 ms |
| Submit to success toast | 1,327 ms |
| Submit to authenticated detail ready | 13,980 ms |
| Anonymous public-detail verification | failed after 27,600 ms |
| Dashboard UI cleanup | failed after 26,041 ms |

The public attempt returned listing API 503 and catalogue RPC 500/400
responses. UI cleanup could not render the listing card because the legacy
management catalogue RPC returned 500. The exact fixture
`4acd849b-2b79-4389-bb6b-97fcff1f183b` was then deleted through the
seller-authenticated `delete_listing_for_user` boundary in 594 ms. The first
call returned `true`; an exact second call returned SQLSTATE `42501`.
Independent public and management residue verification was unavailable because
those read paths failed. Cleanup is API-successful but not independently
verified. No other production row was changed.

## Catalogue API and database parity

Read-only production probes established that the failed/superseded staging
candidate migrations are absent:

- `query_public_catalogue`: HTTP 404 / `PGRST202`
- `get_public_catalogue_publication`: HTTP 404 / `PGRST202`
- `get_public_catalogue_homepage`: HTTP 404 / `PGRST202`
- `get_public_catalogue_listing`: HTTP 404 / `PGRST202`
- `get_manageable_listing_catalogue_page`: HTTP 404 / `PGRST202`
- legacy `get_public_listing_catalogue`: HTTP 500 / SQLSTATE `57014` statement
  timeout in 3.61 seconds

A five-iteration public API diagnostic reproduced cold failure followed by
warm-cache recovery. In iteration one, four listing variants returned 503 in
4.55–5.24 seconds. Later successful warm requests fell to 14–53 ms after the
cache was populated, while the second pass still included 1.37–2.76 second
responses.

The live marker uses the legacy schema and `/api/release` returns SPA HTML
instead of release JSON. The homepage embedded snapshot was generated on
2026-07-22.

## Release gate state

Exact-main CI run `33118157129` passed for the failed/superseded staging
candidate SHA. Stage run `33120858340` verified the signed source artifact and
provenance, then timed out after one hour waiting for the exact-SHA Stripe,
staging Pages, and production Pages proof pairs. Every staging mutation job
was skipped.

The failed staging run cannot be rerun because attempt 2 is rejected. A
reviewed PR merge through protected `main` is required to create an
attempt-one release train; its resulting merge SHA is the next release SHA and
cannot be specified before the merge. That merge must occur only after all
provider credentials are fresh and the operator is ready to dispatch the three
proof workflows while the new latch is open.

## Release acceptance

- First useful catalogue paint p95: at most 1.5 seconds
- Warm 12-card catalogue API p95: at most 1.0 second
- Cold 12-card catalogue API p95: at most 1.8 seconds
- Public API 5xx rate: below 0.5 percent
- Sign-in to usable dashboard p95: at most 3.0 seconds
- No-photo publish to property route p95: at most 2.5 seconds
- Publication to public API visibility p95: at most 5.0 seconds

Production verification must measure property-card readiness, not only route
commit or shell paint. It must collect five cold and five warm non-mutating
samples with structured evidence, and compare the exact deployed SHA with this
observation baseline before the formal release go/no-go decision is recorded.
