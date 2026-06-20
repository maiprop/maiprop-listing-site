# DORA Performance Proof Log

Current status: performance proof is pending operator execution. This file is a
DORA evidence index only; it does not prove capacity, resilience, or production
readiness until a real operator-run artifact is linked and hashed.

| Date | Scenario | Evidence status | Operator | Evidence link | Decision |
|---|---|---|---|---|---|
| 2026-06-20 | Production smoke against https://portal.maiprop.co | Smoke evidence captured | @krenios request | `artifacts/performance/k6/live-smoke-20260620T0948Z/load-test-summary.json`; run timestamp: 2026-06-20T09:44:09Z; artifact SHA256: 2a3254169e4443ed34e87b102d7f345d49f515cd2a6567b3a152a6982b999a9e; release SHA: 98616bb2862ed6ba9f7db9f23c34869fa4034cf1; approval ref: side-conversation-20260620-fix-them | Useful smoke signal only; not accepted as baseline, 10x, soak, DORA capacity, or procurement performance proof. |
| 2026-06-20 | Non-prod baseline and growth load proof | Pending operator execution | Pending operator execution | Pending normalized summary artifact | Pending review |

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
