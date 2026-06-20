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
BASE_URL=https://staging.example.com ECAS_LOAD_PROFILE=baseline_100 k6 run scripts/load-test/basic.js
BASE_URL=https://staging.example.com ECAS_LOAD_PROFILE=growth_10x k6 run scripts/load-test/basic.js
LOAD_TEST_APPROVED_PRODUCTION=true BASE_URL=https://portal.maiprop.co ECAS_LOAD_PROFILE=baseline_100 k6 run scripts/load-test/basic.js
```

Production runs must not execute unless `LOAD_TEST_APPROVED_PRODUCTION=true`
is set and operations has approved the window. The script writes
`load-test-summary.json` for evidence retention.
