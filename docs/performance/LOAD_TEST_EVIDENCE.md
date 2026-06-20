# Performance Load Test Evidence

Current status: production `baseline_100` evidence has been captured, but
`growth_10x` failed and `enterprise_soak` remains pending. Procurement, DORA,
ECAS, and production-readiness reviews must not treat 10x capacity or soak
resilience as proven until a later successful run records the required
artifacts below.

| Date | Environment | Profile | Base URL | Normalized summary artifact | Evidence status | Operator | Notes |
|---|---|---|---|---|---|---|---|
| 2026-06-20 | Production | smoke | https://portal.maiprop.co | `artifacts/performance/k6/live-smoke-20260620T0948Z/load-test-summary.json` | Smoke evidence captured | @krenios request | run timestamp: 2026-06-20T09:44:09Z; artifact SHA256: 2a3254169e4443ed34e87b102d7f345d49f515cd2a6567b3a152a6982b999a9e; release SHA: 98616bb2862ed6ba9f7db9f23c34869fa4034cf1; monitoring window: local k6 stdout only; approval record: side-conversation-20260620-fix-them. This is not baseline_100, growth_10x, or enterprise_soak proof. |
| 2026-06-20 | Production | baseline_100 | https://portal.maiprop.co | `artifacts/performance/k6/prod-baseline-100-20260620T104513Z/load-test-summary.json` | Successful | @krenios request | run timestamp: 2026-06-20T10:47:15Z; artifact SHA256: 61bb1b0ebbae548afe8804f67c2f06c314702ecf70a26f8da7ed8beda2af3b70; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34; monitoring window: local k6 stdout plus post-run public API checks; approval ref: side-conversation-20260620-proceed-with-1. This proves the 100-VU ECAS baseline only. |
| 2026-06-20 | Production | growth_10x | https://portal.maiprop.co | `artifacts/performance/k6/prod-growth-10x-20260620T104737Z/load-test-summary.json` | Failed | @krenios request | run timestamp: 2026-06-20T10:56:48Z; artifact SHA256: 46bcd747183ea76affb8521cfafdbfd50f406fa024e5f020b8edf845283857ce; release SHA: b13ca0182bef8d96ea50b85ecca177122ddc3d34; failed p95 and error-rate thresholds; public API/Supabase upstream route returned 503. |
| 2026-06-20 | Production | enterprise_soak | https://portal.maiprop.co | Pending successful prerequisite run | Pending operator execution | Pending operator execution | Skipped intentionally after failed `growth_10x`; not proof. |

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
