# DORA Performance Proof Log

Current status: production `baseline_100` proof exists, production
`growth_10x` previously failed, and protected-preview `baseline_100`,
`growth_10x`, and `enterprise_soak` proof exists for the current PR. This file
is a DORA evidence index; preview proof must not be confused with production
proof.

Cloudflare Pages `growth_10x` and `enterprise_soak` runs are quota-impacting
operations. Future runs against Pages hosts require explicit
`LOAD_TEST_APPROVED_CLOUDFLARE_QUOTA_BURN=true` approval and should be planned
outside routine CI.

| Date | Scenario | Evidence status | Operator | Evidence link | Decision |
|---|---|---|---|---|---|
| 2026-06-20 | Production smoke against https://portal.maiprop.co | Smoke evidence captured | @krenios request | `artifacts/performance/k6/live-smoke-20260620T0948Z/load-test-summary.json`; run timestamp: 2026-06-20T09:44:09Z; artifact SHA256: 2a3254169e4443ed34e87b102d7f345d49f515cd2a6567b3a152a6982b999a9e; release SHA: 98616bb2862ed6ba9f7db9f23c34869fa4034cf1; approval ref: side-conversation-20260620-fix-them | Useful smoke signal only; not accepted as baseline, 10x, soak, DORA capacity, or procurement performance proof. |
| 2026-06-20 | Production baseline_100 against https://portal.maiprop.co | Successful | @krenios request | `artifacts/performance/k6/prod-baseline-100-20260620T104513Z/load-test-summary.json`; run timestamp: 2026-06-20T10:47:15Z; artifact SHA256: 61bb1b0ebbae548afe8804f67c2f06c314702ecf70a26f8da7ed8beda2af3b70; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34; monitoring window: local k6 stdout plus post-run public API checks; approval ref: side-conversation-20260620-proceed-with-1 | Accept as ECAS 100-VU baseline evidence only. |
| 2026-06-20 | Production growth_10x against https://portal.maiprop.co | Failed | @krenios request | `artifacts/performance/k6/prod-growth-10x-20260620T104737Z/load-test-summary.json`; run timestamp: 2026-06-20T10:56:48Z; artifact SHA256: 46bcd747183ea76affb8521cfafdbfd50f406fa024e5f020b8edf845283857ce; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34 | Reject 10x capacity claim; public API/Supabase upstream path returned 503 under load. |
| 2026-06-20 | Production enterprise_soak against https://portal.maiprop.co | Pending operator execution | Pending operator execution | Pending successful prerequisite run | Skipped after failed growth_10x; do not run until 10x is stable. |
| 2026-06-21 | Protected preview baseline_100 against https://codex-fix-growth-load-proof.maiprop-listing-site.pages.dev | Successful | @krenios request | `artifacts/performance/k6/protected-preview-baseline-20260621T1150Z/load-test-summary.json`; run timestamp: 2026-06-21T11:45:28Z; artifact SHA256: 5972e13634a36bc83df2ad0da1ccfce2deda2e1302aafa1018c01d97a22fea90; release SHA: 52995a54b48f6baa62a65d20ca0a39170d4bfc62; monitoring window: local k6 stdout plus normalized summary; Cloudflare Access service auth enabled | Accept as non-production baseline evidence for the PR only. |
| 2026-06-21 | Protected preview growth_10x against https://codex-fix-growth-load-proof.maiprop-listing-site.pages.dev | Successful | @krenios request | `artifacts/performance/k6/protected-preview-growth-20260621T1154Z/load-test-summary.json`; run timestamp: 2026-06-21T11:54:43Z; artifact SHA256: 2073d73ca5e211add6c09b871a37b1999873c425b1fe4c8a8b534992197357e8; release SHA: 52995a54b48f6baa62a65d20ca0a39170d4bfc62; monitoring window: local k6 stdout plus normalized summary; reached 1,000 VUs, 506,212 requests, no failed routes; quota-impacting Cloudflare Pages run | Accept as non-production 10x evidence for the PR only; still not production capacity proof. |
| 2026-06-21 | Protected preview enterprise_soak against https://codex-fix-growth-load-proof.maiprop-listing-site.pages.dev | Successful | @krenios request | `artifacts/performance/k6/protected-preview-soak-20260621T1205Z/load-test-summary.json`; run timestamp: 2026-06-21T12:35:02Z; artifact SHA256: 4640f848d09a076331dd4e2a96db040072e919b7925005f72d83ae4e8c6032e6; release SHA: 52995a54b48f6baa62a65d20ca0a39170d4bfc62; monitoring window: local k6 stdout plus normalized summary; reached 250 VUs, 698,915 requests, no failed routes; quota-impacting Cloudflare Pages run | Accept as non-production soak evidence for the PR only; still not production capacity proof. |

## Successful Entry Requirements

Successful entries require:

- run timestamp;
- operator;
- normalized summary artifact;
- artifact SHA256;
- release SHA;
- monitoring window;
- approval reference for production hosts.

Production-host evidence must include an approval reference for production hosts
before it can be used for DORA, procurement, ECAS, or production-readiness
review.

Use `npm run check:perf-evidence` before treating this log as review-ready.
