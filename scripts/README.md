# Scripts

This directory contains release checks, inventory generators, seeders, and
maintenance utilities. Prefer the `npm run ...` commands when they exist, so CI
and local usage stay aligned.

## Safety Notes

- Treat any script using `SUPABASE_SERVICE_ROLE_KEY` as database-mutating.
- Seed and destructive scripts use `scripts/_seed-env.ts` and
  `scripts/_prod-guard.ts`; they require a Supabase URL plus service-role key
  and block production-looking hosts unless the project ref is explicitly
  allowlisted as non-production or `I_KNOW_THIS_IS_PROD=yes` is set.
- Do not paste service-role keys, webhook secrets, or provider keys into logs,
  screenshots, PR descriptions, or chat.
- Inventory and check scripts are generally read-only. The exception is an
  explicit `--out` flag, which writes the generated report to the target path.
- Run destructive maintenance scripts only against local, test, development, or
  staging projects unless an incident commander explicitly approves production.

## Checks and Inventories

| Command or file | Purpose | Notes |
| --- | --- | --- |
| `npm run check:runtime` | Verifies Node, npm, and `packageManager` match the repo engines. | Run before debugging dependency or CI drift. |
| `npm run check:runtime:local` | Runs `check:runtime` through `scripts/project-runtime.mjs`. | Use when a local shell defaults to Node/npm newer than the repo pin. |
| `npm run runtime -- <command>` | Runs any command through the pinned local Node 20/npm 10 launcher. | Finds Volta, Scoop `nodejs20`, PATH entries, or `MAIPROP_NODE20_HOME`; used by Husky hooks. |
| `npm run check:secrets` | Scans tracked workspace text files for common committed secret/token patterns. | Runs in CI and pre-push; rotate any real value it flags before committing. |
| `npm run check:production-deploy` | Verifies a live deployed URL serves the built Vite bundle and mounts the app. | CI deploy gate; pass URLs after `--` and use `--browser` for the Playwright mount check. |
| `npm run check:bundle-size` | Checks built JS chunks in `dist/assets` against conservative size budgets. | Run after `npm run build`; fails on budget breaches and forbidden initial preloads. |
| `npm run check:load-test-contract` | Verifies the baseline k6 script keeps p95/error thresholds, summary output, and critical public page/API coverage. | Static gate; run before changing `scripts/load-test/basic.js` or ECAS performance evidence. |
| `npm run check:dependency-overrides` | Verifies every active `package.json` override has rationale and resolves in `package-lock.json`. | Run after dependency upgrades; pair with `npm audit` to decide whether an override can be removed. |
| `npm run inventory:release` | Generates the release-safety inventory from functions, workflows, and env docs. | Read-only unless an output flag is added manually. |
| `npm run check:release-safety` | Enforces release-safety invariants for CI. | Checks workflow coverage, public function posture, and documented env references. |
| `npm run inventory:public-functions` | Regenerates `docs/public-edge-function-inventory.json`. | Use after changing `supabase/config.toml` or public Edge Function auth. |
| `npm run check:public-functions` | Fails when a `verify_jwt=false` function is unclassified, missing source, missing required snippets, or missing tests. | Required before releasing Edge Function auth changes. |
| `npm run capture:supabase-index-stats` | Captures live `pg_stat_user_indexes` rows through `supabase db query` and writes a pure JSON array for advisor review artifacts. | Requires `--out <path>` plus a percent-encoded `SUPABASE_DB_URL`/`SUPABASE_PRODUCTION_DB_URL`/`SUPABASE_STAGING_EFFECTIVE_DB_URL`, or `SUPABASE_PROJECT_REF` plus `SUPABASE_DB_PASSWORD` for a non-interactive link, or a locally linked Supabase project for `--linked` fallback. CI-only advisor reports may pass `--allow-empty-when-unconfigured` so the advisor gate still runs when DB credentials are intentionally absent or Supabase returns a transient query timeout; auth, SQL, and permission failures still fail. |
| `npm run check:supabase-advisor` | Fetches live Supabase Security and Performance Advisor lints through the Management API. Use `--fail-on-error` to block high/error lints and `--fail-on-unknown` to block unclassified WARN/INFO drift. Pass `--index-stats <json>` after `capture:supabase-index-stats` so unused-index debt is mapped to production scan counters. | Requires `SUPABASE_ACCESS_TOKEN` and a project ref; writes JSON when `--out` is provided. Release-safety CI may pass `--allow-transient-unavailable` so Supabase Management API HTTP 544/timeouts produce an explicit unavailable artifact instead of blocking deployment; auth, permission, malformed response, and real advisor debt still fail. |
| `npm run check:supabase-types` | Checks generated Supabase types freshness. | Use after schema or migration changes. Release-safety CI may pass `--allow-transient-unavailable` so Supabase CLI 520/522/524/504/timeouts are recorded instead of blocking deployment; retrieved stale types still fail. |
| `npm run check:mutation-validation` | Verifies selected high-risk browser and Edge Function mutation paths use schema-first Zod parsing before writes/RPCs. | Required when adding or changing mutation entry points covered by ECAS validation evidence. |
| `npm run inventory:audit-coverage` | Generates audit coverage inventory data. | Pairs with audit remediation work. |
| `npm run check:audit-coverage` | Enforces audit coverage plus the critical workflow proof test. | CI-oriented guard. |
| `npm run lint:migrations` | Lints new migrations for idempotent SQL patterns. | New migrations must use safe re-run patterns. |
| `npm run lint:migrations:chronology` | Adds migration chronology checks to the idempotency lint. | Use when adding or reordering migration files. |
| `scripts/coverage-report.mjs` | Utility for coverage reporting. | Use alongside Vitest coverage output. |

## Build, Performance, and Assets

| Command or file | Purpose | Notes |
| --- | --- | --- |
| `npm run compress:images` | Compresses project image assets with Sharp. | Review resulting media diffs before committing. |
| `scripts/lighthouse-auth.cjs` | Provides Lighthouse CI auth/session setup. | Requires the same staging credentials used by the Lighthouse workflow. |
| `scripts/load-test/basic.js` | Basic k6 load-test script. | Run only against approved non-production targets unless production load testing is scheduled. |

## Seed and Demo Data

All seeders require migrations to be applied and a service-role key in the
environment. They should be run against local, development, or staging projects.

| Command or file | Purpose | Notes |
| --- | --- | --- |
| `npm run seed:users` | Creates 21 mock accounts across buyer, seller, investor, agent, institutional, developer, and professional roles. | Demo password is `Demo2025!`; also creates cross-role interactions. |
| `npm run seed:listings` | Creates mock listings. | Uses the production guard and service-role key. |
| `npm run seed:professionals` | Creates mock professional directory entries. | Useful for marketplace and consultation flows. |
| `npm run seed:open-houses` | Creates mock open-house data. | Use after listings exist. |
| `npm run seed:new-builds` | Creates mock new-build/project data. | Useful for developer and project-detail flows. |
| `npm run seed:notifications` | Creates mock notification data. | Useful for notification UI testing. |
| `npm run seed:listing-images` | Attaches listing images. | Review storage bucket and public URL settings first. |
| `npm run seed:demo-accounts` | Creates curated demo accounts. | Keep credentials out of public docs if they differ from local defaults. |
| `scripts/seed-production-listings.ts` | Seeds production-style listing data. | Requires explicit production approval and prod-guard override if used against production. |
| `npm run check:edge-functions` | Runs `deno check` against every Supabase Edge Function `index.ts`. | Catches deployed-runtime type errors that are not covered by Node/Vite typecheck. |
| `npm run check:type-debt` | Enforces the explicit-`any` / ts-ignore ratchet in `scripts/type-debt-baseline.json`. | Run `node scripts/check-type-debt.mjs --update-baseline` only after intentionally reducing or accepting the count. |

## Maintenance and Destructive Utilities

| File | Purpose | Notes |
| --- | --- | --- |
| `scripts/delete-past-auctions.mjs` | Deletes or cleans up past auction data. | Destructive; confirm target project and backup status first. |
| `npm run cleanup:production-fixtures` | Dry-runs inventory of synthetic public listing fixtures, including supervisor and E2E publish records; `-- --apply` can delete them with explicit production confirmations. | Destructive only with `--apply`, `I_KNOW_THIS_IS_PROD=yes`, and `CONFIRM_FIXTURE_CLEANUP=delete-public-fixture-listings`. |
| `scripts/wipe-all-listings.mjs` | Removes listing data. | Highly destructive; use only for reset scenarios with explicit approval. |
| `scripts/suppress-any-legacy.mjs` | Legacy TypeScript cleanup helper. | Use only when intentionally suppressing legacy `any` debt. |
| `scripts/_seed-env.ts` | Shared Supabase URL and service-role env resolver for seeders. | Fails fast when required env vars are missing. |
| `scripts/_prod-guard.ts` / `scripts/_prod-guard.mjs` | Shared production safety guard. | Blocks known/likely production hosts unless explicitly overridden. |

## Mock User Details

`npm run seed:users` creates 3 accounts per role:

| Type | Role | Count | Indices |
| --- | --- | --- | --- |
| Buyer | `individual` | 3 | 0-2 |
| Seller | `seller_landlord` | 3 | 3-5 |
| Investor | `investor` | 3 | 6-8 |
| Agent | `agent` | 3 | 9-11 |
| Institutional | `institutional` | 3 | 12-14 |
| Developer | `developer` | 3 | 15-17 |
| Professional | `professional` | 3 | 18-20 |

It also seeds representative listings, messages, viewings, favorites, CRM
contacts, professionals, and consultation requests.
