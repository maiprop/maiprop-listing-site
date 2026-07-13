# Environment Variables — Setup Guide

This repo runs in three environments. Each has its own variables and its own source of truth.

| Env | Source of truth | Who edits |
|---|---|---|
| Local dev | `.env` at repo root (gitignored) | every developer |
| Staging | Cloudflare Pages → Environment variables, scoped to `staging` branch | platform lead |
| Production | Cloudflare Pages → Environment variables, scoped to `production` context | platform lead |
| CI (GH Actions) | Repo → Settings → Secrets and variables → Actions | repo admin |

Edge-function secrets (Stripe keys, service role, OpenAI) live in **Supabase → Project Settings → Edge Functions → Secrets**, **not** in Cloudflare Pages. They never reach the browser.

Stripe account routing:

| Purpose | Stripe account | Account id |
|---|---|---|
| Testing / sandbox / staging | `mAI prop sandbox` | `acct_1TnuLbGfkWWBWEyh` |
| Live production billing | `mAI prop` | `acct_1TnuLTGfOEgBOxtl` |

Set `STRIPE_EXPECTED_ACCOUNT_ID` to the account for the environment and run
`npm run check:stripe-account` before syncing products, replacing price IDs,
rotating webhook secrets, or launching live billing.

---

## Local development

### 1. Copy the template

```powershell
Copy-Item .env.example .env
```

### 2. Fill in required values

Only two are mandatory to boot the app:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key>
```

Find these in Supabase -> Project Settings -> API. If the Supabase project has
an activated custom domain for Auth/API traffic, `VITE_SUPABASE_URL` can be that
origin instead, for example `https://auth.maiprop.co`.

`VITE_SUPABASE_ANON_KEY` is accepted only as a legacy alias for the same anon key.
Use `VITE_SUPABASE_PUBLISHABLE_KEY` for new local, staging, and production configuration.

### 3. Optional for specific features

| Feature | Variable | Where to get it |
|---|---|---|
| Maps | `VITE_MAPBOX_TOKEN` | mapbox.com → Account → Access Tokens |
| AI search / assist | `GEMINI_API_KEY` or `OPENAI_API_KEY` | Gemini or OpenAI dashboard (set in Supabase Edge Function secrets) |
| Stripe checkout | `VITE_STRIPE_PRO_PRODUCT_ID` + all `VITE_STRIPE_PRICE_*` for display; `STRIPE_PRICE_*` or Admin Pricing sync for Edge checkout | Stripe dashboard → Products |
| Error monitoring | `VITE_SENTRY_DSN` | sentry.io → Project → Client Keys |
| Production telemetry audit | `SENTRY_AUTH_TOKEN` | sentry.io → User Settings → Auth Tokens; local/read-only audit only |
| Analytics | `VITE_PLAUSIBLE_DOMAIN` | plausible.io → Sites |
| Street view / Places | `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console; use a browser key restricted to local/dev referrers |
| Google Places autocomplete | `VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE` | Optional `true` flag; requires `VITE_GOOGLE_MAPS_API_KEY` with Places API access |
| Native public API origin | `VITE_PUBLIC_API_ORIGIN` | Optional absolute origin for `/api/public/*` when running a native shell; defaults to `VITE_APP_URL` or same-origin browser paths |

### 4. Service-role key (server-side scripts only)

For running `npm run seed:users`, `seed:demo-accounts`, etc. you need the service-role key. **Never** prefix it with `VITE_` — that would expose it to the browser.

```
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
```

The seed scripts call `assertNotProduction()` (see `scripts/_prod-guard.ts`) to refuse to run against the production project by default.

### 5. Run

```powershell
npm install
npm run dev
```

The app will not start if `VITE_SUPABASE_URL` is missing or malformed.

---

## Staging

See [`STAGING_SETUP.md`](./STAGING_SETUP.md) for the full walkthrough. Variables are listed in `.env.staging.example`.

---

## Production

### In Cloudflare Pages

1. Project settings → Environment variables.
2. Add each variable below for the `Production` environment.
3. Do **not** add service-role, Stripe secret, or OpenAI keys here — those go to Supabase edge-function secrets.

| Variable | Required | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | ✅ | Production Supabase project URL, or activated Supabase custom domain for branded OAuth |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Anon key, public |
| `VITE_SUPABASE_ANON_KEY` | optional legacy alias | Same value as `VITE_SUPABASE_PUBLISHABLE_KEY`; prefer the publishable-key name for new configuration |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Used by sitemap redirect |
| `VITE_SENTRY_DSN` | strongly recommended | See audit item #4 |
| `VITE_PLAUSIBLE_DOMAIN` | optional | GDPR analytics |
| `VITE_MAPBOX_TOKEN` | optional | Needed for map UIs |
| `VITE_STRIPE_PRO_PRODUCT_ID` | required for billing | Production product |
| `VITE_STRIPE_PUBLISHABLE_KEY` | required for live Stripe browser mode detection | Publishable key only, `pk_live_...` in production and `pk_test_...` in sandbox/staging. Never use secret keys in Cloudflare Pages. |
| `VITE_STRIPE_RUNTIME_MODE` / `VITE_BILLING_MODE` | optional billing runtime guard | Set to `live` in production and `test` in sandbox/staging when publishable-key inference is not sufficient. |
| `VITE_STRIPE_PRICE_*` | required for billing | Production prices |
| `VITE_TURNSTILE_SITE_KEY` | optional | Cloudflare Turnstile |
| `VITE_GOOGLE_MAPS_API_KEY` | optional | See browser-key restrictions below |
| `VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE` | optional | Set to `true` only when the browser key has Places API access; otherwise the UI uses the Nominatim fallback |
| `VITE_PUBLIC_API_ORIGIN` | optional | Absolute origin for `/api/public/*` when a native shell cannot use same-origin paths; browser builds use same-origin paths |

Built-in mAI Prop video rooms do not have a public-channel fallback. They always
join Supabase Realtime with `private: true`, so the video-room realtime RLS
migrations must be applied before the production UI exposes hosted rooms.

#### Google Maps browser-key restrictions

`VITE_GOOGLE_MAPS_API_KEY` is embedded in the Vite browser bundle. In Google
Cloud Console, configure the key with:

- Application restrictions: HTTP referrers.
- Allowed production referrers: `https://maiprop.co/*`, `https://portal.maiprop.co/*`, `https://maiprop-listing-site.pages.dev/*`, and `https://*.maiprop-listing-site.pages.dev/*`.
- API restrictions: Maps JavaScript API and Places API only.

Do not allowlist broad patterns such as `https://*.pages.dev/*`; keep preview
access scoped to this Cloudflare Pages project.

#### Google OAuth branding

The Google account chooser and consent screens are controlled by Google Auth
Platform and the Supabase Auth callback host, not by the React login card.

To replace `qvvicunqcrwpioqnvzxf.supabase.co` with Mai Prop branding:

1. In Google Auth Platform -> Branding, set the app name to `mAI prop`, upload
   `public/oauth-logo.png`, and set the public home page, privacy policy, and
   terms URLs from `https://portal.maiprop.co`.
2. Submit brand verification and publish the verified brand. Google does not
   show the app name/logo to external users until branding is verified and
   published.
3. For a branded callback host instead of the Supabase project ref, enable a
   Supabase Custom Domain, add a CNAME such as `auth.maiprop.co` pointing to
   `qvvicunqcrwpioqnvzxf.supabase.co`, verify/activate it in Supabase, then add
   both callback URLs in the Google OAuth client while rolling over:
   `https://qvvicunqcrwpioqnvzxf.supabase.co/auth/v1/callback` and
   `https://auth.maiprop.co/auth/v1/callback`.
4. After the custom domain is activated, set Cloudflare Pages
   `VITE_SUPABASE_URL=https://auth.maiprop.co` for production and redeploy.

### In Supabase (edge functions)

Dashboard → Project Settings → Edge Functions → Secrets.

| Secret | Used by |
|---|---|
| `BILLING_MODE=mock` | Temporary billing mode for health, checkout, billing portal, and invoice surfaces while real Stripe IDs/secrets are unavailable. Remove before real paid launch. |
| `STRIPE_MODE=mock` | Alternate explicit mock billing-mode flag; prefer `BILLING_MODE=mock` for new environments. |
| `STRIPE_MOCK_MODE=true` | Legacy equivalent of `BILLING_MODE=mock`; prefer `BILLING_MODE=mock`. |
| `STRIPE_RUNTIME_MODE` | Optional Stripe runtime guard. Defaults to `test`; set to `live` only for production live billing. |
| `STRIPE_ENVIRONMENT` / `STRIPE_RUN_MODE` | Legacy aliases accepted by the Stripe runtime guard; prefer `STRIPE_RUNTIME_MODE` in new environments. |
| `STRIPE_LIVE_MODE=true` | Required together with `STRIPE_RUNTIME_MODE=live` before any `sk_live_...` key is accepted by Edge billing functions. |
| `STRIPE_TEST_ACCOUNT_ID` | Expected Stripe sandbox account id. For MaiProp: `acct_1TnuLbGfkWWBWEyh` (`mAI prop sandbox`). |
| `STRIPE_SANDBOX_ACCOUNT_ID` | Alias for the expected Stripe sandbox account id used by catalog parity checks. Prefer `STRIPE_TEST_ACCOUNT_ID` for shared Edge conventions. |
| `STRIPE_LIVE_ACCOUNT_ID` | Expected Stripe live account id. For MaiProp: `acct_1TnuLTGfOEgBOxtl` (`mAI prop`). |
| `STRIPE_EXPECTED_ACCOUNT_ID` | Environment-specific guard used by `npm run check:stripe-account`; set to the sandbox account in test/staging and live account in production. |
| `STRIPE_API_VERSION` | Optional Stripe catalog setup override; defaults to `2026-06-24.dahlia` and should match the shared Edge Stripe client. |
| `STRIPE_PRODUCT_TAX_CODE` | Optional global Stripe catalog setup override for Product `tax_code`. By default the app resolves Greek software/AI tax codes per product: personal SaaS `txcd_10103000`, business SaaS `txcd_10103001`, personal AI software services `txcd_10105001`, and business AI software services `txcd_10105002`. Review overrides with tax counsel before live launch. |
| `STRIPE_SAAS_PERSONAL_TAX_CODE` / `STRIPE_SAAS_BUSINESS_TAX_CODE` | Optional Stripe catalog setup overrides for SaaS subscription and report products; defaults to Greek software product tax codes `txcd_10103000` and `txcd_10103001`. |
| `STRIPE_AI_PERSONAL_TAX_CODE` / `STRIPE_AI_BUSINESS_TAX_CODE` | Optional Stripe catalog setup overrides for AI valuation/report add-ons; defaults to Greek AI software service tax codes `txcd_10105001` and `txcd_10105002`. |
| `STRIPE_TAX_BEHAVIOR` | Optional Stripe catalog setup override for Price `tax_behavior`; defaults to `exclusive` so VAT/tax is calculated separately on invoices. Allowed: `exclusive`, `inclusive`. |
| `STRIPE_COMPANY_VAT_ID` / `COMPANY_VAT_ID` | Optional seller VAT ID written to Stripe invoice metadata and PDFs when no Stripe account tax ID object is configured. Prefer `STRIPE_COMPANY_VAT_ID`; `COMPANY_VAT_ID` is a legacy fallback. |
| `STRIPE_ACCOUNT_TAX_ID` | Optional Stripe Tax ID object (`txi_...`) used for invoice issuer tax identity when the Stripe account already has the VAT ID configured. |
| `STRIPE_SECRET_KEY` | Billing Edge Functions: `stripe-webhook`, `create-checkout`, `create-investor-payment`, `customer-portal`, `check-subscription`, `get-invoices`, `create-stripe-price`, `sync-stripe-pricing`, `apply-data-input-credit`, `delete-account`, `log-role-switch` |
| `STRIPE_SANDBOX_SECRET_KEY` / `STRIPE_TEST_SECRET_KEY` / `STRIPE_SECRET_KEY_TEST` | Test-mode Stripe secret aliases accepted by sandbox/live catalog parity checks. Values must be `sk_test_...`. |
| `STRIPE_LIVE_SECRET_KEY` / `STRIPE_SECRET_KEY_LIVE` | Live-mode Stripe secret aliases accepted by live migration and catalog parity checks. Values must be `sk_live_...`. |
| `STRIPE_API_KEY` | Local Stripe operator scripts fallback; prefer `STRIPE_SECRET_KEY` so Edge and scripts use one key name. |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` |
| `STRIPE_WEBHOOK_EXPECTED_URL` | Optional live migration gate override for the Stripe webhook URL; defaults to the production `stripe-webhook` Edge Function URL. |
| `STRIPE_CUSTOMER_PORTAL_CONFIGURATION_ID` | Optional Stripe Customer Portal configuration used by `customer-portal` |
| `STRIPE_TAX_CHECK_INVOICE` | Optional invoice id for `npm run check:stripe-tax-readiness` invoice-level VAT verification. |
| `STRIPE_TAX_EXPECT_COUNTRY` / `STRIPE_TAX_EXPECT_RATE` | Stripe Tax readiness expectations; defaults are `GR` and `0.24` for Greek VAT. |
| `STRIPE_TAX_READINESS_STRICT` | Set to `true` to make Stripe Tax readiness warnings fail the check. |
| `STRIPE_PRICE_*` | Optional server-side Checkout price fallbacks. Prefer Admin Pricing sync because it stores monthly and annual price IDs distinctly in `pricing_configs.metadata`. |
| `STRIPE_PRICE_PARTICIPANT_MONTHLY` / `STRIPE_PRICE_PARTICIPANT_ANNUAL` | Optional fallback for `pro` participant Checkout when DB metadata is unavailable |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_ANNUAL` | Legacy aliases for the participant Checkout fallback; prefer the `STRIPE_PRICE_PARTICIPANT_*` names for new configuration |
| `STRIPE_PRICE_AGENT_MONTHLY` / `STRIPE_PRICE_AGENT_ANNUAL` | Optional fallback for `agent_basic` Checkout when DB metadata is unavailable |
| `STRIPE_PRICE_DEVELOPER_MONTHLY` / `STRIPE_PRICE_DEVELOPER_ANNUAL` | Optional fallback for `developer_pro` Checkout when DB metadata is unavailable |
| `STRIPE_PRICE_PROFESSIONAL_MONTHLY` / `STRIPE_PRICE_PROFESSIONAL_ANNUAL` | Optional fallback for `professional_basic` Checkout when DB metadata is unavailable |
| `MAIPROP_OS_WEBHOOK_SECRET` | `receive-from-os` (HMAC, see `WEBHOOK_VERIFICATION.md`) |
| `MAIPROP_OS_URL` | OS import/sync functions |
| `MAIPROP_OS_API_URL` | Optional OS API base URL alias used by `property-valuation`; falls back to `MAIPROP_OS_URL` |
| `MAIPROP_OS_EMAIL` | OS import/sync functions |
| `MAIPROP_OS_PASSWORD` | OS import/sync functions |
| `GOOGLE_MAPS_API_KEY` | `streetview-proxy` and OS image enrichment |
| `CRON_SECRET` | `send-saved-search-alerts` scheduled invocation guard |
| `WEBHOOK_SECRET` | `oh-registration-notify` |
| `SENTRY_DSN` | edge-function structured logger forwarding |
| `ENVIRONMENT` | edge-function environment tag and CORS tightening |
| `AUTH_VERIFY_TIMEOUT_MS` | Optional Supabase JWT verification timeout for shared Edge auth helpers; defaults to `5000`. |
| `RATE_LIMIT_DB_TIMEOUT_MS` | Optional database timeout for shared Edge rate-limit checks; defaults to `2500`. |
| `GEMINI_API_KEY` | AI provider fallback for report/search/assist functions when `OPENAI_API_KEY` is not configured |
| `GEMINI_MODEL` | Optional Gemini model override; defaults to `gemini-2.5-flash` |
| `OPENAI_API_KEY` | Primary AI provider for `ai-search`, `property-chat`, `pro-ai-tools`, `listing-ai-assist`, `ai-translate`, `smart-filters`, `neighbourhood-report`, `ai-service-match`, `property-valuation`, `property-pois` |
| `OPENAI_MODEL` | Optional OpenAI model override for non-translation AI functions; defaults to `gpt-5.4-mini` |
| `OPENAI_TRANSLATION_MODEL` | Optional OpenAI model override for translation; defaults to `gpt-5.4-mini` |
| `OPENAI_REASONING_EFFORT` | Optional OpenAI reasoning effort override for supported models |
| `AI_PROVIDER_TIMEOUT_MS` | Optional timeout in milliseconds for outbound Gemini/OpenAI provider calls; defaults to `30000` |
| `LOVABLE_API_KEY` | legacy `followup-lead` content generation |
| `BREVO_API_KEY` | `send-saved-search-alerts`, `auth-email-hook`, `process-email-queue`, `invitation-notify`, `oh-registration-notify` |
| `BREVO_FROM_EMAIL` | same Brevo-backed email functions as above |
| `BREVO_FROM_NAME` | optional default sender-name override for Brevo-backed emails |
| `SEND_EMAIL_HOOK_SECRET` | `auth-email-hook` (Supabase Auth send-email webhook verification) |
| `EMAIL_TEMPLATE_PREVIEW_SECRET` | optional preview auth for `auth-email-hook/preview` (falls back to `SEND_EMAIL_HOOK_SECRET`) |

Rotation cadence for each is documented in [`SECRETS_ROTATION.md`](./SECRETS_ROTATION.md).

---

## CI (GitHub Actions)

Under Settings → Secrets and variables → Actions:

GitHub Actions also sets `CI=true` automatically. Playwright uses this to run
against the production preview server on port `4173` and to enable stricter
fail-fast behavior.

| Secret | Purpose | Scope |
|---|---|---|
| `E2E_TEST_EMAIL` | auth E2E spec sign-in | repo or `production` env |
| `E2E_TEST_PASSWORD` | same | same |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI status checks | repo. See `LIGHTHOUSE_CI_SETUP.md` |
| `GITHUB_TOKEN` | GitHub-provided token used by secret scanning | automatic |
| `GITLEAKS_LICENSE` | optional Gitleaks license for enhanced scanning | repo |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages production/preview deploy | production environment |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account for Pages deploy | production environment |
| `CLOUDFLARE_PAGES_PROJECT` | Cloudflare Pages project used by live posture capture | audit environment |
| `CLOUDFLARE_DNS_MODE` | `registrar` for the accepted current posture, or `cloudflare-authoritative` only after an approved nameserver migration | audit environment |
| `CLOUDFLARE_ZONE_ID` | Zone queried by live posture capture whenever `CLOUDFLARE_DNS_MODE` is set | audit environment |
| `CF_ACCESS_CLIENT_ID` / `CLOUDFLARE_ACCESS_CLIENT_ID` | optional Cloudflare Access service-token client id for protected preview/production deploy smoke checks | repo or environment scoped to deploy jobs |
| `CF_ACCESS_CLIENT_SECRET` / `CLOUDFLARE_ACCESS_CLIENT_SECRET` | optional Cloudflare Access service-token secret paired with the client id above; required when either client-id alias is set | repo or environment scoped to deploy jobs |
| `CF_ACCESS_TOKEN` / `CLOUDFLARE_ACCESS_TOKEN` | optional pre-issued Cloudflare Access JWT for deploy smoke checks when service-token headers are not used | repo or environment scoped to deploy jobs |
| `VITE_SUPABASE_URL` | production Vite build Supabase URL | production environment |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | production Vite build anon/publishable key | production environment |
| `VITE_SUPABASE_PROJECT_ID` | production Supabase project ref | production environment |
| `VITE_SUPABASE_PROJECT_URL` | legacy alias for `VITE_SUPABASE_URL`; prefer `VITE_SUPABASE_URL` | local/test only |
| `VITE_MAPBOX_TOKEN` | optional map token for production build | production environment |
| `VITE_SENTRY_DSN` | optional browser Sentry DSN | production environment |
| `VITE_STRIPE_PRO_PRODUCT_ID` | optional Stripe product id for subscription checks | production environment |
| `VITE_TURNSTILE_SITE_KEY` | optional Turnstile site key | production environment |
| `VITE_GOOGLE_MAPS_API_KEY` | optional browser Google Maps key; see browser-key restrictions above | production environment |
| `VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE` | optional `true` flag for Google Places autocomplete; leave false/unset to use Nominatim suggestions | production/staging build |
| `VITE_PLAUSIBLE_DOMAIN` | optional analytics domain | production environment |
| `VITE_APP_URL` | canonical app origin for production build | production environment |
| `VITE_PUBLIC_API_ORIGIN` | optional absolute origin for cached `/api/public/*` routes in native shells; defaults to `VITE_APP_URL` | production/staging build |
| `CAPACITOR_BUNDLED_WEB` | set to `true` for APK builds that bundle the Vite output instead of opening a remote URL | Android WebView APK workflow |
| `CAPACITOR_APP_ID` | Android package id override; default is `co.maiprop.portal.mobile` | Android WebView APK workflow |
| `CAPACITOR_APP_NAME` | Android app label override; default is `MaiProp Portal` | Android WebView APK workflow |
| `CAPACITOR_SERVER_URL` | remote web origin for non-bundled Capacitor builds; default is `https://portal.maiprop.co` | Android WebView APK workflow |
| `SITE_LOCK_PASSWORD` | optional Cloudflare Pages runtime passcode gate | production environment |
| `STAGING_SUPABASE_URL` | optional isolated staging Supabase URL for security/E2E jobs; PR preview deploys require it to be a non-production Supabase URL matching `STAGING_SUPABASE_PROJECT_ID` | repo or staging environment |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | optional isolated staging anon/publishable key; PR preview deploys are skipped when it matches the production key | repo or staging environment |
| `STAGING_SUPABASE_PROJECT_ID` | optional isolated staging Supabase project ref; if absent, matching production, or mismatched from `STAGING_SUPABASE_URL`, CI treats the setup as production-only and skips staging/preview deploys | repo or staging environment |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | optional isolated staging `service_role` JWT key for live-safe security fixtures; when absent, CI uses production runtime with destructive tests disabled instead of mixing staging publishable keys with the production service role | staging environment only |
| `STAGING_APP_URL` | optional explicit Cloudflare Pages PR preview/staging origin; when absent, CI derives `https://<branch>.<project>.pages.dev` and bakes that into the preview bundle as `VITE_APP_URL` | repo or staging environment |
| `STAGING_SITE_LOCK_PASSWORD` | optional Cloudflare Pages Preview runtime passcode gate; never reuse `SITE_LOCK_PASSWORD` unless preview should intentionally share the production passcode | staging environment only |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI deploy/list token | repo or environment scoped to deploy jobs |
| `SUPABASE_DB_URL` | optional Postgres connection string override for local/CI Supabase diagnostic scripts such as index-stat capture; prefer staging/production-specific vars in workflows | local/CI diagnostics only |
| `DATABASE_URL` | optional legacy Postgres connection string fallback used by local backup/diagnostic scripts only when `SUPABASE_DB_URL` is unset | local/CI diagnostics only |
| `MAIPROP_BACKUP_PASSPHRASE` | local operator secret used to encrypt `npm run backup:supabase:logical` output; never expose through `VITE_*` or app runtime environments | local backup operator shell only |
| `MAIPROP_NODE20_HOME` | optional local path override for `scripts/project-runtime.mjs`; point it at the directory containing the pinned Node 20 `node` and npm binaries when PATH/Volta/Scoop discovery is not enough | local developer shell only |
| `SUPABASE_STAGING_DB_URL` | optional isolated staging Postgres connection string for CI `supabase db push --db-url`; only required when `STAGING_SUPABASE_PROJECT_ID` points to a real non-production staging project and migrations change | staging environment only |
| `SUPABASE_STAGING_EFFECTIVE_DB_URL` | CI-generated staging Postgres connection string after resolving `SUPABASE_STAGING_DB_URL` or the Supabase Management API pooler URL; do not set manually outside the workflow | GitHub Actions generated runtime env |
| `SUPABASE_PRODUCTION_DB_URL` | percent-encoded production Postgres connection string used only by the manual production DB migration workflow; keep scoped to the protected `production` environment | production environment |
| `SUPABASE_PROJECT_REF` | optional project ref alias used by release-safety live inventory | manual release certification |
| `RELEASE_SAFETY_SUPABASE_PROJECT_REF` | optional project ref override for release-safety live inventory; defaults to `supabase/config.toml` `project_id` when unset | manual release certification |
| `SUPABASE_MANAGEMENT_API_BASE` | optional override for Supabase Management API advisor checks; defaults to `https://api.supabase.com/v1` | local/CI diagnostics only |
| `SENTRY_AUTH_TOKEN` | optional read-only token for local production telemetry checks; never required by app runtime | local operator shell only |
| `SENTRY_ORG` | Sentry organization slug used by read-only compliance evidence capture | repo variable or local operator shell |
| `SENTRY_PROJECT` | Sentry project slug used by read-only compliance evidence capture | repo variable or local operator shell |
| `RLS_USER_A_EMAIL` | live-safe RLS test user A | repo or staging environment |
| `RLS_USER_B_EMAIL` | live-safe RLS test user B | repo or staging environment |
| `RLS_USER_PASSWORD` | shared live-safe RLS test password | repo or staging environment |
| `ONBOARDING_TEST_EMAIL` | live-safe onboarding E2E user | repo or staging environment |
| `ONBOARDING_TEST_PASSWORD` | live-safe onboarding E2E password | repo or staging environment |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase `service_role` JWT API key for Edge Functions, staging security fixtures, and the live operational smoke fixture-repair step; destructive checks stay disabled unless an isolated staging project is configured; do not use the `sb_secret_*` key for PostgREST/Auth Admin-backed fixtures | repo or environment scoped to deploy/test jobs |
| `MAIPROP_EDGE_TEST_AUTH_BYPASS` | explicit CI-only bypass marker for edge-function tests that exercise handler internals without live Supabase Auth | CI test environment only |
| `PRODUCTION_DEPLOY_URLS` | optional space-separated URL override for the post-deploy production smoke check; defaults to `https://portal.maiprop.co` | deploy diagnostics only |
| `PRODUCTION_DEPLOY_BROWSER_CHECK` | optional boolean that enables the Chromium mount check when set instead of passing `--browser` | deploy diagnostics only |
| `PRODUCTION_DEPLOY_PUBLIC_API_CHECK` | optional boolean that enables public Pages Functions checks when set instead of passing `--public-api` | deploy diagnostics only |
| `PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN` | optional boolean that lets the deploy smoke check warn instead of fail when Cloudflare Pages Functions return fail-open SPA HTML for public API routes; only use when app-side public data fallbacks are enabled | deploy diagnostics only |
| `PRODUCTION_DEPLOY_CHECK_ATTEMPTS` | optional retry count for the production deploy smoke check; defaults to `8` | deploy diagnostics only |
| `PRODUCTION_DEPLOY_CHECK_DELAY_MS` | optional retry delay in milliseconds for the production deploy smoke check; defaults to `10000` | deploy diagnostics only |
| `PRODUCTION_DEPLOY_EXPECTED_SHA` | optional commit SHA that the production smoke check must observe in `/deploy-version.json` before browser/API checks run | deploy diagnostics only |
| `PRODUCTION_DEPLOY_VERSION_PATH` | optional path to the deployment version marker; defaults to `/deploy-version.json` | deploy diagnostics only |
| `PLAYWRIGHT_BASE_URL` | live or staging app origin used by Playwright suites that are skipped by default | E2E diagnostics only |
| `MAIPROP_RUNNING_PERF_GATE` | internal marker set by `playwright.config.ts` so Playwright workers run `test:perf` instead of skipping performance-gate specs; do not set manually | local/CI performance tests |
| `E2E_RUN_SUPERVISOR_NETWORK` | explicit `true` gate for the supervisor/agent live network E2E suite | E2E diagnostics only |
| `VITE_WEB_VITALS_SAMPLE_RATE` | optional browser-side Web Vitals Sentry sampling rate from `0` to `1`; defaults to `0.1` | production/staging build |
| `VITE_VIEW_TRACKING_SAMPLE_RATE` | optional browser-side listing-view sample rate; defaults to `1` | production/staging build |
| `VIEW_TRACKING_SAMPLE_RATE` | optional non-Vite alias for listing-view sampling in scripts or server-side diagnostics | diagnostics only |

Additional seeded E2E accounts:

| Variable | Purpose |
|---|---|
| `E2E_DEMO_PASSWORD` | default password for seeded demo users |
| `E2E_USE_SEEDED_DEMO_ACCOUNTS` | explicit marker that seeded demo-account E2E may use shared fixture accounts |
| `E2E_FORCE_CANONICAL_DEMO_ACCOUNTS` | optional `true` override that makes live smoke tests ignore stale per-account secret overrides and use the canonical seeded `@maiprop.demo` accounts repaired by the supervisor fixture |
| `E2E_ADMIN_SMOKE_ENABLED` | optional `true` opt-in that includes the admin fixture in the live role/tier smoke matrix after admin access has been explicitly validated |
| `E2E_BUYER_FREE_EMAIL` / `E2E_BUYER_FREE_PASSWORD` | free buyer fixture |
| `E2E_BUYER_PRO_EMAIL` / `E2E_BUYER_PRO_PASSWORD` | pro buyer fixture |
| `E2E_SELLER_PRO_EMAIL` / `E2E_SELLER_PRO_PASSWORD` | pro seller fixture |
| `E2E_AGENT_PRO_EMAIL` / `E2E_AGENT_PRO_PASSWORD` | pro agent fixture |
| `E2E_DEVELOPER_PRO_EMAIL` / `E2E_DEVELOPER_PRO_PASSWORD` | developer fixture |
| `E2E_INVESTOR_PRIVATE_EMAIL` / `E2E_INVESTOR_PRIVATE_PASSWORD` | private investor fixture |
| `E2E_INVESTOR_INSTITUTIONAL_EMAIL` / `E2E_INVESTOR_INSTITUTIONAL_PASSWORD` | institutional investor fixture |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | admin fixture |
| `INCLUDE_DEMO_ADMIN` | set to `yes` only to create the shared-password demo admin in private, non-production seed runs |
| `E2E_PROFESSIONAL_ARCHITECT_EMAIL` / `E2E_PROFESSIONAL_ARCHITECT_PASSWORD` | professional architect fixture |
| `E2E_PROFESSIONAL_LAWYER_EMAIL` / `E2E_PROFESSIONAL_LAWYER_PASSWORD` | professional lawyer fixture |
| `E2E_PROFESSIONAL_VALUER_EMAIL` / `E2E_PROFESSIONAL_VALUER_PASSWORD` | professional valuer fixture |

Destructive tests are disabled by default:

| Variable | Purpose |
|---|---|
| `E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS` | must be `true` before destructive live E2E can run |
| `E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS` | comma-separated allowlist of isolated Supabase refs for destructive E2E |
| `SAFE_SUPABASE_PROJECT_REFS` | comma-separated non-production project refs allowed by guarded seed scripts when the Supabase host does not contain `staging`, `dev`, `local`, or `test` |
| `I_KNOW_THIS_IS_PROD` | manual override for guarded production seed scripts; use only during an approved production operation |

Checkout redirect origin allowlists:

| Variable | Purpose |
|---|---|
| `CHECKOUT_ALLOWED_ORIGINS` | comma-separated allowed checkout redirect origins |
| `ALLOWED_CHECKOUT_ORIGINS` | legacy alias for `CHECKOUT_ALLOWED_ORIGINS` |

Release inventory can optionally compare repo functions with live Supabase:

```powershell
$env:RELEASE_SAFETY_LIVE_FUNCTIONS="true"
# Optional override. If omitted, the script reads supabase/config.toml project_id.
$env:RELEASE_SAFETY_SUPABASE_PROJECT_REF="<project-ref>"
npm run check:release-safety -- --live-functions
```

Live Supabase advisor checks use the same Management API token and project ref:

```powershell
$env:SUPABASE_ACCESS_TOKEN="<redacted>"
$env:SUPABASE_PROJECT_REF="<project-ref>"
npm run check:supabase-advisor -- --out supabase-advisor-summary.json
```

For local production telemetry verification, set a read-only Sentry token only in
the operator shell:

```powershell
$env:SENTRY_AUTH_TOKEN="<redacted>"
$env:SENTRY_ORG="<sentry-org-slug>"
$env:SENTRY_PROJECT="<sentry-project-slug>"
```

Do not commit Sentry auth tokens or add them to browser-visible `VITE_*`
variables. The app only needs `VITE_SENTRY_DSN` at build time and `SENTRY_DSN`
for edge-function error forwarding.

CI intentionally uses **stub** Supabase URL + key (format-valid placeholders in `.github/workflows/ci.yml`). Real keys must never be checked in.

---

## Troubleshooting

- **App boots but all requests fail with 401** — `VITE_SUPABASE_PUBLISHABLE_KEY` is wrong or mismatched with the URL's project ref.
- **"Invalid API key" during Stripe checkout** — `VITE_STRIPE_PRICE_*` was set to a price from the wrong mode (test vs live).
- **"No such price" during Stripe checkout** — the Stripe key is pointed at the wrong account for the configured price IDs. Run `npm run check:stripe-account`; test/staging prices must be from `acct_1TnuLbGfkWWBWEyh`, while live prices must be from `acct_1TnuLTGfOEgBOxtl`.
- **Sentry never receives events** — `VITE_SENTRY_DSN` must be set at **build** time; Vite inlines it. Re-deploy after changing.
- **Seed script refuses to run** — the prod guard triggered. See the script output for the override flag, and verify you actually meant to target that project.
