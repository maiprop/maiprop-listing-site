# Staging Environment Setup

Purpose: mirror production so migrations, Stripe webhook changes, and edge-function deploys are validated end-to-end before `main` -> production.

## Architecture

- Pull requests run validation only; a successful `main` CI run can promote its
  exact immutable artifact to the dedicated Cloudflare staging project
- Dedicated Supabase project `maiprop-staging` (separate ref, separate DB, separate auth users)
- Stripe in **test mode** - separate webhook endpoint, separate API keys
- Sentry environment tag `staging` (same DSN or separate project, your call)

## One-time setup

### 1. Supabase staging project

```bash
# On supabase.com dashboard: create project "maiprop-staging", copy the ref
supabase link --project-ref <staging-ref>
supabase db push                              # apply all migrations
supabase functions deploy --project-ref <staging-ref>
```

Seed demo accounts into staging:

```bash
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-jwt> \
E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS=<staging-ref> \
  VITE_SUPABASE_URL=https://<staging-ref>.supabase.co \
  npx tsx scripts/seed-demo-accounts.ts
```

### 2. Cloudflare Pages

- Create a dedicated staging Pages project; do not reuse the production project.
- Its stable origin is exactly
  `https://maiprop-listing-site-staging.pages.dev`; do not use the production
  project's `https://staging.maiprop-listing-site.pages.dev` preview hostname.
- Project settings -> Builds & deployments -> configure production branch as
  `main`.
- Use direct-upload mode, or disable both production and preview automatic
  deployments on any retained Git integration. The release train API-attests
  this posture on both the staging and production Pages projects before any
  staging mutation.
- Set the production runtime compatibility date to `2026-05-19`, matching the
  reviewed source-controlled Wrangler configuration.
- The staging workflow pins Wrangler `4.86.0`, copies the verified candidate to
  a runner-temporary directory outside the repository, verifies its manifest
  again, and fails if any `wrangler.toml`, `wrangler.json`, or `wrangler.jsonc`
  can be discovered in an ancestor. Do not add environment-specific `[vars]`
  to the repository root `wrangler.toml`.
- `.env.staging.example` is a cross-provider inventory, not a Pages import file.
  Do not bulk-copy it into Cloudflare Pages. Configure only the strict runtime
  allowlist enforced by `validate-cloudflare-pages-staging-posture.mjs`:
  `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, their three
  `VITE_*` aliases, `VITE_APP_URL`, `VITE_PUBLIC_API_ORIGIN`,
  `VITE_APP_ENVIRONMENT=staging`, and `MAIPROP_TURN_TTL_SECONDS=21600` as
  `plain_text`; the documented Stripe browser bindings are optional. All
  Supabase values must exactly match the isolated staging project. Unexpected
  Pages bindings fail the release preflight.
- Pre-provision `SUPABASE_SERVICE_ROLE_KEY` as a `secret_text` binding and,
  when used, `SITE_LOCK_PASSWORD` as a `secret_text` binding. Never write
  either value into Wrangler `[vars]` or build artifacts.
- The release train validates these bindings before deployment and fails closed
  when any staging binding points at production.

### 3. Stripe (test mode)

- Create a webhook endpoint at `https://<staging-ref>.supabase.co/functions/v1/stripe-webhook` listening to the same events as prod.
- Set the `STRIPE_WEBHOOK_SECRET` on the staging Supabase project (Settings -> Edge Functions -> Secrets), not the Cloudflare Pages env.
- Pages browser Stripe configuration is optional. When present,
  `VITE_STRIPE_PUBLISHABLE_KEY` must use `pk_test_*`,
  `VITE_STRIPE_RUNTIME_MODE` and `VITE_BILLING_MODE` must be `test`, and every
  `VITE_STRIPE_PRICE_*` value must be a staging-only price ID. The release train
  checks these rules against both Pages project records and both deployed
  `/runtime-config.js` URLs.

### 4. GitHub

- Staging mutation and security-evidence jobs declare `environment: staging`;
  the reusable Supabase caller cannot declare an environment, so its called
  runner declares the scope. On the current private GitHub Free plan these
  declarations provide deployment attribution only: environment secrets,
  deployment branch policies, required reviewers, and prevent-self-review are
  not active controls. Credentials and control variables remain repository
  scoped. After a GitHub Team/Enterprise upgrade, configure the existing
  `staging` environment and move only staging-specific credentials into it as
  defense in depth.
- Add repository variable `STAGING_RELEASE_ENABLED=true` only after the
  dedicated staging Supabase and Cloudflare projects are fully provisioned.
  Missing or any value other than exact lowercase `true` keeps the separate
  standard/manual staging provider lanes off. `Stage Release Candidate` uses
  exact signed provider proof pairs as its authorization instead.
- Keep `STAGING_PAGES_BOOTSTRAP_ENABLED=false` except during the separately
  authorized first-deployment procedure below.
- Set `STAGING_TRUSTED_CONTROL_SHA` to the full reviewed `main` commit only
  when authorizing the separate manual staging Pages bootstrap lane. That
  workflow requires the value to match both `github.workflow_sha` and the
  release SHA. Clear or rotate the pin after the bootstrap run.
- Add repository variable
  `STAGING_MUTATION_ACKNOWLEDGEMENT=MUTATE_STAGING_xsiehskfgeoqyazcgauv`
  only when the fixed staging project `xsiehskfgeoqyazcgauv` is ready for
  mutation. This non-secret acknowledgement is checked again immediately
  before each database, Edge Function, and Cloudflare staging mutation.
- Configure `CLOUDFLARE_STAGING_PAGES_PROJECT`,
  `CLOUDFLARE_PAGES_PROJECT`, `STAGING_APP_URL`, and
  `PRODUCTION_SUPABASE_PROJECT_ID` as repository variables. `STAGING_APP_URL`
  must be the dedicated stable HTTPS staging origin. The staging Pages project,
  app origin, and Supabase ref must be distinct from production.
- Add required `staging` secrets: `STAGING_SUPABASE_URL`,
  `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_PROJECT_ID`,
  `SUPABASE_ACCESS_TOKEN`, `E2E_DEMO_PASSWORD`, `E2E_ADMIN_EMAIL`, and
  `E2E_ADMIN_PASSWORD`. The admin identity must already be a platform admin in
  the isolated staging project; the release train validates its RLS boundary
  but never grants it elevated access.
- Set repository variable `STAGING_TURN_PROOF_EMAIL` to a seeded staging
  professional account, such as `architect.pro@maiprop.demo`. The account must
  have a `professionals` row and use `E2E_DEMO_PASSWORD`; the staging train
  authenticates it and proves a `video:professional:<id>` room can receive
  short-lived TURN credentials.
- The tenant/security matrices use the isolated staging demo identities
  documented in `.env.staging.example`. Local operators may override them with
  `STAGING_DEVELOPER_A_EMAIL`, `STAGING_DEVELOPER_B_EMAIL`,
  `STAGING_DEVELOPER_FREE_EMAIL`, and `STAGING_SELLER_FREE_EMAIL`; the release
  workflow intentionally leaves those variables unset so empty GitHub secrets
  cannot suppress the validated defaults.
- Optional: pre-provision `SITE_LOCK_PASSWORD` on the dedicated Pages project
  only as a `secret_text` binding, and add the same value as the repository
  secret `STAGING_SITE_LOCK_PASSWORD` for authenticated verification. The
  strict runtime allowlist accepts its name and encrypted type but never reads,
  uploads, or compares its Cloudflare value; plaintext is rejected.
- The dedicated Cloudflare staging project must contain
  `SUPABASE_SERVICE_ROLE_KEY` as a `secret_text` binding. The protected
  `Provision Cloudflare Pages Runtime` workflow resolves and masks this value
  from the isolated Supabase Management API and sends it directly to
  Cloudflare; it is never stored as a GitHub secret or uploaded as evidence.
  The workflow also requires dedicated `CLOUDFLARE_STAGING_TURN_KEY_ID` and
  `CLOUDFLARE_STAGING_TURN_API_TOKEN` repository secrets. Its plain-text
  Supabase URL, project ref, and publishable key must exactly match the isolated
  staging project; the release train fails instead of falling back to
  production.
- GitHub environment protection is not available for this private repository
  on the current plan. The default-off release flag, exact workflow-SHA trust
  pin, attempt-one actor checks, signed artifact bindings, and staging mutation
  acknowledgement are therefore mandatory controls; do not enable staging
  without all of them. Configure a `main`-only environment branch policy only
  after upgrading to a plan that enforces it for private repositories.
- Do not store a separate `STAGING_SUPABASE_SERVICE_ROLE_KEY` GitHub secret.
  The Supabase staging workflow resolves and masks the staging `service_role`
  JWT at runtime through the Management API using `SUPABASE_ACCESS_TOKEN`.
  An absent staging service role is a hard failure; there is no production
  fallback. The dedicated Cloudflare project still requires its independently
  pre-provisioned `SUPABASE_SERVICE_ROLE_KEY` `secret_text` binding.
- Runtime provisioning is a separate administrative operation, not part of a
  deployment. Temporarily enable only the matching release flag, dispatch the
  target-specific confirmation phrase from an allowlisted approver identity
  that is not a deployer, verify its redacted evidence, and return the flag to
  `false`. A subsequent exact-artifact deployment is still required before
  Pages Functions consume changed bindings.
- When isolated staging is selected, CI resolves its service-role key and
  creates or resets the configured RLS and onboarding identities immediately
  before security E2E. The exact-SHA job runs the RLS, account-deletion, and
  onboarding guard suites against the canonical staging deployment and rejects
  skipped, flaky, or unexpected results. Only the minimized report digest and
  aggregate counts enter the final release attestation. The fixture script requires
  `E2E_SECURITY_USE_ISOLATED_STAGING=true`, the destructive-test
  acknowledgement, and an exact project-ref allowlist match, so it cannot
  prepare identities in production.
- Required when migrations change: add `SUPABASE_STAGING_DB_URL`, the percent-encoded Postgres connection string used by CI to run `supabase db push --db-url` before deploying staging edge functions. Without it, CI fails the staging migration path instead of deploying functions against a stale schema.
- Legacy migration convergence is forward-only after the isolated staging
  ledger has been canonicalized. The staging release train validates the fixed
  anomaly manifest in `supabase/reconciliation/production-history-v1.json`,
  runs one dry-run and one acknowledged `supabase db push`, and packages
  read-only schema evidence plus the pgTap convergence proof. Production must
  never run `supabase migration repair` or write directly to
  `supabase_migrations.schema_migrations`.
- The pre-canonical isolated staging project has one bounded bootstrap
  exception. Set `STAGING_MIGRATION_ALIAS_REPAIR_AUTHORIZATION` to
  `REPAIR_REVIEWED_STAGING_MIGRATION_ALIASES <exact-release-sha>` for the single
  exact-SHA run, then clear it after that run succeeds. The protected workflow
  accepts only the fixed version/name/remote-statement-hash/canonical-file-hash
  map in `scripts/reconcile-staging-migration-aliases.mjs`, renews the staging
  lease and target assertion immediately before the CLI repair, and requires a
  canonical empty repair plan before the ordinary dry-run. Unknown or changed
  history fails closed. This exception is staging-only and must not be expanded
  into a generic migration-history repair path.
- `STAGING_SUPABASE_PROJECT_ID`, `STAGING_SUPABASE_URL`, and
  `STAGING_SUPABASE_PUBLISHABLE_KEY` must all point to the same non-production
  project. The dedicated Pages project's `SUPABASE_*` and `VITE_SUPABASE_*`
  aliases must match those values exactly, while `VITE_APP_URL` and
  `VITE_PUBLIC_API_ORIGIN` must equal `STAGING_APP_URL`.
  `VITE_PUBLIC_API_ORIGIN` is consumed only by bundled Capacitor native HTTP;
  browser previews always call same-origin `/api` paths. The release train
  fails closed when any value is missing, inconsistent, or points to production.

## Deployment flow

1. PR against `main` -> CI runs validation only, including quality, E2E, and
   migration checks. It does not mutate staging or production.
2. Merge to `main` -> CI builds the immutable candidate, verifies its manifest,
   records the GitHub artifact ID and digest, and creates a mandatory
   repository-secret HMAC binding over the exact payload and attempt-one
   producer metadata. CI does not mutate staging or production; failed binding
   creation fails the candidate.
3. Before the first Pages deployment only, an allowlisted release deployer may
   temporarily set `STAGING_PAGES_BOOTSTRAP_ENABLED=true` and manually dispatch
   `Bootstrap Cloudflare Staging Pages` with the exact current-main SHA,
   successful attempt-1 CI run ID, and `BOOTSTRAP_STAGING_PAGES`. The workflow
   requires the normal staging release flag and trusted control SHA, verifies
   the signed candidate binding and current-main lease, refuses production
   credentials or an ambiguous nonempty staging project, and makes one Direct
   Upload deployment to `maiprop-listing-site-staging`. It verifies both static
   and `/api/release` SHA markers plus runtime configuration at the immutable
   and stable URLs. Re-dispatching the same trusted SHA is verification-only
   when that exact healthy function-enabled canonical deployment already
   exists. Set the bootstrap flag back to `false` after success.
4. Every successful attempt-one main CI run starts validation of that exact
   candidate, then waits at most one hour for the exact-SHA, original-actor,
   attempt-one Stripe, staging Pages, and production Pages payload-plus-binding
   artifact pairs. The latch revalidates every unexpired pair and current
   `main` on each poll, and releases staging automatically only when all three
   exist. It does not read `STAGING_RELEASE_ENABLED` or
   `STAGING_TRUSTED_CONTROL_SHA`. Before the latch, the binding verifier checks
   the HMAC, artifact API metadata, payload files, source SHA/tree, `main` ref,
   workflow, and attempt-one actor tuple. The staging run then emits its
   own exact-candidate evidence. It checks the immutable deployment URL and the
   canonical staging URL, including an authenticated HTTP 200 TURN issuance
   proof. Tokens, room IDs, usernames, credentials, and ICE server values are
   excluded from uploaded evidence; only status, TTL, and aggregate counts remain.
   The workflow re-fetches and validates both staging and production Pages
   projects immediately before evidence upload, so Git auto-deploy suppression and
   binding isolation cannot rely on stale pre-deploy evidence. Raw project,
   binding, and deployment API responses remain job-local; uploaded artifacts
   contain only redacted posture and minimized deployment identity.
5. Production promotion remains disabled until the exact staged SHA has valid
   catalogue and health evidence, Stripe live readiness is signed, a different
   allowlisted actor approves it, and the production dispatcher is explicitly
   enabled. Promotion then runs database, Edge Functions, and Cloudflare Pages
   in that order without rebuilding the candidate.
6. Smoke-test staging using the checklist below.

## Manual smoke-test checklist (staging)

- [ ] Home page loads, hero video plays
- [ ] Sign in as `buyer.pro@maiprop.demo` (password `Demo2025!`)
- [ ] Navigate to `/listings`, apply a filter, open a detail page
- [ ] Pricing page -> click upgrade -> reach Stripe checkout (test card 4242...)
- [ ] Complete checkout -> redirected back, profile shows Pro
- [ ] Stripe dashboard shows webhook delivered + 200 response
- [ ] `/settings` -> delete account -> user signed out, cannot sign back in
- [ ] Sentry staging env receives at least one transaction

## Troubleshooting

- **Edge functions not updated** - keep standard/manual provider lanes disabled
  until the staging control plane is complete. The exact-SHA staging workflow
  applies migrations, deploys Edge Functions, validates their live inventory,
  and deploys Pages only after its three exact provider proof pairs pass.
- **Auth emails going to production URL** - set the required GitHub repository
  variable `STAGING_APP_URL` to the stable staging origin and configure
  Supabase Auth -> URL Configuration to allow that exact origin.
