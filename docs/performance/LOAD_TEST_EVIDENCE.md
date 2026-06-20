# Performance Load Test Evidence

Current status: no successful live load-test evidence has been recorded in this
file as of 2026-06-20. The k6 profile source, wrapper, and local contract gates
are present, but procurement, DORA, ECAS, and production-readiness reviews must
treat performance proof as pending until an operator executes a real run and
records the required artifacts below.

| Date | Environment | Profile | Base URL | Normalized summary artifact | Evidence status | Operator | Notes |
|---|---|---|---|---|---|---|---|
| 2026-06-20 | Production | smoke | https://portal.maiprop.co | `artifacts/performance/k6/live-smoke-20260620T0948Z/load-test-summary.json` | Smoke evidence captured | @krenios request | run timestamp: 2026-06-20T09:44:09Z; artifact SHA256: 2a3254169e4443ed34e87b102d7f345d49f515cd2a6567b3a152a6982b999a9e; release SHA: 98616bb2862ed6ba9f7db9f23c34869fa4034cf1; monitoring window: local k6 stdout only; approval record: side-conversation-20260620-fix-them. This is not baseline_100, growth_10x, or enterprise_soak proof. |
| 2026-06-20 | Non-prod target to be selected by operator | baseline_100, growth_10x, or enterprise_soak | Pending real operator input | Pending real operator execution | Pending operator execution | Pending operator execution | Template only; not proof. |

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
