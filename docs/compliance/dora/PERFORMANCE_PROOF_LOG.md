# DORA Performance Proof Log

Current status: production `baseline_100` proof exists, but `growth_10x` failed
and `enterprise_soak` is still pending. This file is a DORA evidence index; it
does not prove 10x capacity, soak resilience, or final production readiness
until successful operator-run artifacts are linked and hashed.

| Date | Scenario | Evidence status | Operator | Evidence link | Decision |
|---|---|---|---|---|---|
| 2026-06-20 | Production smoke against https://portal.maiprop.co | Smoke evidence captured | @krenios request | `artifacts/performance/k6/live-smoke-20260620T0948Z/load-test-summary.json`; run timestamp: 2026-06-20T09:44:09Z; artifact SHA256: 2a3254169e4443ed34e87b102d7f345d49f515cd2a6567b3a152a6982b999a9e; release SHA: 98616bb2862ed6ba9f7db9f23c34869fa4034cf1; approval ref: side-conversation-20260620-fix-them | Useful smoke signal only; not accepted as baseline, 10x, soak, DORA capacity, or procurement performance proof. |
| 2026-06-20 | Production baseline_100 against https://portal.maiprop.co | Successful | @krenios request | `artifacts/performance/k6/prod-baseline-100-20260620T104513Z/load-test-summary.json`; run timestamp: 2026-06-20T10:47:15Z; artifact SHA256: 61bb1b0ebbae548afe8804f67c2f06c314702ecf70a26f8da7ed8beda2af3b70; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34; monitoring window: local k6 stdout plus post-run public API checks; approval ref: side-conversation-20260620-proceed-with-1 | Accept as ECAS 100-VU baseline evidence only. |
| 2026-06-20 | Production growth_10x against https://portal.maiprop.co | Failed | @krenios request | `artifacts/performance/k6/prod-growth-10x-20260620T104737Z/load-test-summary.json`; run timestamp: 2026-06-20T10:56:48Z; artifact SHA256: 46bcd747183ea76affb8521cfafdbfd50f406fa024e5f020b8edf845283857ce; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34 | Reject 10x capacity claim; public API/Supabase upstream path returned 503 under load. |
| 2026-06-20 | Production enterprise_soak against https://portal.maiprop.co | Pending operator execution | Pending operator execution | Pending successful prerequisite run | Skipped after failed growth_10x; do not run until 10x is stable. |

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
