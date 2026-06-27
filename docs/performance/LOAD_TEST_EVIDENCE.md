# Performance Load Test Evidence

Current status: production `baseline_100`, `growth_10x`, and
`enterprise_soak` evidence has been captured. The failed 2026-06-27
production `enterprise_soak` attempt is retained below as remediation evidence;
the later same-day rerun after public API cache/query hardening passed strict
route-level and aggregate budgets. Protected-preview `baseline_100`,
`growth_10x`, and `enterprise_soak` evidence remains useful PR evidence, but
does not replace production proof.
Procurement, DORA, ECAS, and production-readiness reviews must distinguish
preview proof from production proof.

Operational note: high-volume Cloudflare Pages runs consume Pages Functions
invocations. The 2026-06-21 protected-preview growth/soak runs are retained as
non-production evidence, but future Cloudflare Pages growth/soak runs require
explicit quota-burn approval and should not be used as routine CI checks.

| Date | Environment | Profile | Base URL | Normalized summary artifact | Evidence status | Operator | Notes |
|---|---|---|---|---|---|---|---|
| 2026-06-27 | Production | smoke | https://portal.maiprop.co | `artifacts/performance/k6-production-smoke-rerun-20260627/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-27T18:07:29Z; artifact SHA256: f9e527758609a0e616ceefb1712a21daee4613231046157d48c2e971b8c225ad; release SHA: 58937eaf5b53; monitoring window: local k6 stdout and normalized summary; approval ref: conversation-20260627-proceed-with-all; 441 requests, 10 peak VUs, zero failed routes, p95 42.65 ms, error rate 0. |
| 2026-06-27 | Production | growth_10x | https://portal.maiprop.co | `artifacts/performance/k6-production-growth-10x-20260627/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-27T18:16:52Z; artifact SHA256: 177b61a1a12dc80e4db9f016ca93d8a717be63be2502576e1581d097636f64cd; release SHA: 58937eaf5b53; monitoring window: local k6 stdout and normalized summary; approval ref: conversation-20260627-proceed-with-all; reached 1,000 VUs, 432,824 requests, no failed routes, p95 388.33 ms, aggregate error rate 0.0010. Accept as current production 10x proof for this release. |
| 2026-06-27 | Production | enterprise_soak | https://portal.maiprop.co | `artifacts/performance/k6-production-enterprise-soak-rerun-20260627-de528c73/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-27T21:19:32Z; artifact SHA256: b0373d1e46a96c05d8e2eb413cf36d90e6d2db022474c5afe754dbd9205a6608; release SHA: de528c73; monitoring window: local k6 stdout, normalized summary, and post-run direct probes; approval ref: conversation-20260627-proceed-with-all; reached 250 VUs, 696,339 requests, no failed routes, p95 27.25 ms, aggregate error rate 0.0003. `api_open_houses` had a route error rate of 0.00001, below the strict 0.01 route budget. Post-run probes for home, listings API, new-build API, open-houses API, and `/new-build/1a296bc6-8941-405b-9b81-1c4f5776dd8f` all returned 200 in 59-90 ms. Accept as current production enterprise soak proof for this release. |
| 2026-06-27 | Production | enterprise_soak | https://portal.maiprop.co | `artifacts/performance/k6-production-enterprise-soak-20260627/load-test-summary.json` | Failed | @krenios request | run timestamp: 2026-06-27T18:37:42Z; artifact SHA256: 9b0639ca9d90e231e9983e8bdc47b511b7b5bbf25d7cff3de26732dc02cff41e; release SHA: 58937eaf5b53; monitoring window: local k6 stdout, normalized summary, and post-run direct probes; approval ref: conversation-20260627-proceed-with-all; aborted after 269,052 requests because `api_listings` route error rate reached 0.0135, above the strict 0.01 route budget. Aggregate p95 25.68 ms and aggregate error rate 0.0022 passed, but this is not accepted as enterprise soak proof. |
| 2026-06-23 | Production | smoke | https://portal.maiprop.co | `artifacts/performance/k6-smoke-2026-06-23/load-test-summary.json` | Failed | @krenios request | run timestamp: 2026-06-23T07:43:07Z; artifact SHA256: cd6b30f4f3695d13a9a66acd9bd29cdcbe094c49edee2badef72499ddb94c489; release SHA: 0145793152164ac0fe5b4da22c48914251a00fa8; monitoring window: local k6 stdout and normalized summary; approval ref: side-conversation-20260623-proceed; 441 requests, p95 25 ms, overall error rate 0.0068 passed, but route-level strict thresholds failed once each for `api_listings`, `api_open_houses`, and `sitemap`. |
| 2026-06-23 | Production | smoke | https://portal.maiprop.co | `artifacts/performance/k6-smoke-2026-06-23-rerun/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-23T07:47:14Z; artifact SHA256: 52a846029c0c0635c48caee88a7b0fd6679f6bce6ca942ff894edb2d753700ee; release SHA: 0145793152164ac0fe5b4da22c48914251a00fa8; monitoring window: local k6 stdout, normalized summary, and 25-request direct probes per dynamic route; approval ref: side-conversation-20260623-proceed; 448 requests, 10 peak VUs, zero failed routes, p95 24.82 ms. This is smoke evidence only, not baseline_100, growth_10x, or enterprise_soak proof. |
| 2026-06-20 | Production | smoke | https://portal.maiprop.co | `artifacts/performance/k6/live-smoke-20260620T0948Z/load-test-summary.json` | Smoke evidence captured | @krenios request | run timestamp: 2026-06-20T09:44:09Z; artifact SHA256: 2a3254169e4443ed34e87b102d7f345d49f515cd2a6567b3a152a6982b999a9e; release SHA: 98616bb2862ed6ba9f7db9f23c34869fa4034cf1; monitoring window: local k6 stdout only; approval record: side-conversation-20260620-fix-them. This is not baseline_100, growth_10x, or enterprise_soak proof. |
| 2026-06-20 | Production | baseline_100 | https://portal.maiprop.co | `artifacts/performance/k6/prod-baseline-100-20260620T104513Z/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-20T10:47:15Z; artifact SHA256: 61bb1b0ebbae548afe8804f67c2f06c314702ecf70a26f8da7ed8beda2af3b70; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34; monitoring window: local k6 stdout plus post-run public API checks; approval ref: side-conversation-20260620-proceed-with-1. This proves the 100-VU ECAS baseline only. |
| 2026-06-20 | Production | growth_10x | https://portal.maiprop.co | `artifacts/performance/k6/prod-growth-10x-20260620T104737Z/load-test-summary.json` | Failed | @krenios request | run timestamp: 2026-06-20T10:56:48Z; artifact SHA256: 46bcd747183ea76affb8521cfafdbfd50f406fa024e5f020b8edf845283857ce; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34; failed p95 and error-rate thresholds; public API/Supabase upstream route returned 503. |
| 2026-06-20 | Production | enterprise_soak | https://portal.maiprop.co | Pending successful prerequisite run | Pending operator execution | Pending operator execution | Skipped intentionally after failed `growth_10x`; not proof. |
| 2026-06-21 | Protected Cloudflare Pages preview | baseline_100 | https://codex-fix-growth-load-proof.maiprop-listing-site.pages.dev | `artifacts/performance/k6/protected-preview-baseline-20260621T1150Z/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-21T11:45:28Z; artifact SHA256: 5972e13634a36bc83df2ad0da1ccfce2deda2e1302aafa1018c01d97a22fea90; release SHA: 52995a54b48f6baa62a65d20ca0a39170d4bfc62; monitoring window: local k6 stdout and normalized summary; Cloudflare Access service auth enabled; non-production preview target. |
| 2026-06-21 | Protected Cloudflare Pages preview | growth_10x | https://codex-fix-growth-load-proof.maiprop-listing-site.pages.dev | `artifacts/performance/k6/protected-preview-growth-20260621T1154Z/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-21T11:54:43Z; artifact SHA256: 2073d73ca5e211add6c09b871a37b1999873c425b1fe4c8a8b534992197357e8; release SHA: 52995a54b48f6baa62a65d20ca0a39170d4bfc62; monitoring window: local k6 stdout and normalized summary; reached 1,000 VUs, 506,212 requests, no failed routes; non-production preview target; quota-impacting Cloudflare Pages run. |
| 2026-06-21 | Protected Cloudflare Pages preview | enterprise_soak | https://codex-fix-growth-load-proof.maiprop-listing-site.pages.dev | `artifacts/performance/k6/protected-preview-soak-20260621T1205Z/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-21T12:35:02Z; artifact SHA256: 4640f848d09a076331dd4e2a96db040072e919b7925005f72d83ae4e8c6032e6; release SHA: 52995a54b48f6baa62a65d20ca0a39170d4bfc62; monitoring window: local k6 stdout and normalized summary; reached 250 VUs, 698,915 requests, no failed routes; non-production preview target; quota-impacting Cloudflare Pages run. |

## Required Live Evidence

Every successful row must include these fields in the row or an attached
evidence note:

- run timestamp: UTC timestamp for the k6 execution window;
- operator: named human operator or approved operations account;
- BASE_URL: exact target URL used by k6;
- ECAS_LOAD_PROFILE: one of `smoke`, `baseline_100`, `growth_10x`, or
  `enterprise_soak`;
- k6 command: wrapper command or CI job URL that executed the run;
- normalized summary artifact: retained `load-test-summary.json`;
- artifact SHA256: hash of the normalized summary artifact;
- release SHA: application commit under test;
- monitoring window: linked logs, dashboards, or incident-free observation
  window covering the run;
- production approval record: change ticket or written approval when the target
  host is `maiprop.co` or any `*.maiprop.co` host.

## Evidence Status Values

- `Pending operator execution`
- `Successful`
- `Failed`

Use `npm run check:perf-evidence` to verify that placeholder rows do not claim
live proof. A successful row without the required artifact hash, release SHA,
run timestamp, named operator, and production approval record when applicable
must fail the checker.
