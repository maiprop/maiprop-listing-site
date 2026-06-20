# Load Test Proof

The repository contains source-controlled k6 profiles and CI contract checks for
performance proof. Running true production-scale tests still requires an
approved time window, rate-limit coordination, and monitoring access.

## Profiles

- `ECAS_LOAD_PROFILE=smoke` checks a small pre-release path.
- `ECAS_LOAD_PROFILE=baseline_100` checks the current 100-concurrent-user ECAS baseline.
- `ECAS_LOAD_PROFILE=growth_10x` models the 1,000-concurrent-user growth target.
- `ECAS_LOAD_PROFILE=enterprise_soak` holds sustained load for longer regression windows.

## Commands

```bash
node scripts/perf-k6-run.mjs --base-url https://staging.example.com --profile smoke
node scripts/perf-k6-run.mjs --base-url https://staging.example.com --profile baseline_100
node scripts/perf-k6-run.mjs --base-url https://staging.example.com --profile growth_10x --summary-dir artifacts/performance/k6-growth
LOAD_TEST_APPROVED_PRODUCTION=true node scripts/perf-k6-run.mjs --base-url https://portal.maiprop.co --profile baseline_100 --summary-dir artifacts/performance/k6-production-approved
```

Production runs must not execute unless `LOAD_TEST_APPROVED_PRODUCTION=true`
is set and operations has approved the window. The script writes
normalized `load-test-summary.json` output and a raw
`load-test-raw-summary.json` backup for evidence retention.

## Non-Prod Guardrails

- `BASE_URL` is required. The k6 script and wrapper do not default to staging or
  production.
- `ECAS_LOAD_PROFILE` must be one of `smoke`, `baseline_100`, `growth_10x`, or
  `enterprise_soak`.
- `maiprop.co` and `*.maiprop.co` hosts are blocked unless
  `LOAD_TEST_APPROVED_PRODUCTION=true` is set.
- Prefer staging, preview, or disposable non-prod targets for proof collection
  unless an operations-approved production window exists.

## Evidence Handling

Do not mark a run as successful in `docs/performance/LOAD_TEST_EVIDENCE.md` or
`docs/compliance/dora/PERFORMANCE_PROOF_LOG.md` until a real operator records:

- the normalized summary artifact and artifact SHA256;
- release SHA under test;
- run timestamp and named operator;
- monitoring window;
- production approval record when a production host is targeted.

Use these local gates before review:

```bash
npm run check:load-test-contract
npm run check:perf-evidence
npm run test:perf
```
