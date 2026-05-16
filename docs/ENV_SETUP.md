# Environment Variables — Setup Guide

This repo runs in three environments. Each has its own variables and its own source of truth.

| Env | Source of truth | Who edits |
|---|---|---|
| Local dev | `.env` at repo root (gitignored) | every developer |
| Staging | Cloudflare Pages → Environment variables, scoped to `staging` branch | platform lead |
| Production | Cloudflare Pages → Environment variables, scoped to `production` context | platform lead |
| CI (GH Actions) | Repo → Settings → Secrets and variables → Actions | repo admin |

Edge-function secrets (Stripe keys, service role, OpenAI) live in **Supabase → Project Settings → Edge Functions → Secrets**, **not** in Cloudflare Pages. They never reach the browser.

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

Find these in Supabase → Project Settings → API.

### 3. Optional for specific features

| Feature | Variable | Where to get it |
|---|---|---|
| Maps | `VITE_MAPBOX_TOKEN` | mapbox.com → Account → Access Tokens |
| AI search / assist | `GEMINI_API_KEY` or `OPENAI_API_KEY` | Gemini or OpenAI dashboard (set in Supabase Edge Function secrets) |
| Stripe checkout | `VITE_STRIPE_PRO_PRODUCT_ID` + all `VITE_STRIPE_PRICE_*` | Stripe dashboard → Products |
| Error monitoring | `VITE_SENTRY_DSN` | sentry.io → Project → Client Keys |
| Production telemetry audit | `SENTRY_AUTH_TOKEN` | sentry.io → User Settings → Auth Tokens; local/read-only audit only |
| Analytics | `VITE_PLAUSIBLE_DOMAIN` | plausible.io → Sites |
| Street view / Places | `VITE_GOOGLE_MAPS_API_KEY` | Google Cloud Console; restrict to local/staging domains |

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
| `VITE_SUPABASE_URL` | ✅ | Production Supabase ref |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ | Anon key, public |
| `VITE_SUPABASE_PROJECT_ID` | ✅ | Used by sitemap redirect |
| `VITE_SENTRY_DSN` | strongly recommended | See audit item #4 |
| `VITE_PLAUSIBLE_DOMAIN` | optional | GDPR analytics |
| `VITE_MAPBOX_TOKEN` | optional | Needed for map UIs |
| `VITE_STRIPE_PRO_PRODUCT_ID` | required for billing | Production product |
| `VITE_STRIPE_PRICE_*` | required for billing | Production prices |
| `VITE_TURNSTILE_SITE_KEY` | optional | Cloudflare Turnstile |
| `VITE_GOOGLE_MAPS_API_KEY` | optional | Restricted to prod domain |

### In Supabase (edge functions)

Dashboard → Project Settings → Edge Functions → Secrets.

| Secret | Used by |
|---|---|
| `BILLING_MODE=mock` | Temporary billing mode for health, checkout, billing portal, and invoice surfaces while real Stripe IDs/secrets are unavailable. Remove before real paid launch. |
| `STRIPE_MODE=mock` | Alternate explicit mock billing-mode flag; prefer `BILLING_MODE=mock` for new environments. |
| `STRIPE_MOCK_MODE=true` | Legacy equivalent of `BILLING_MODE=mock`; prefer `BILLING_MODE=mock`. |
| `STRIPE_SECRET_KEY` | `stripe-webhook`, `create-checkout`, `customer-portal`, `get-invoices`, `create-stripe-price`, `sync-stripe-pricing` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` |
| `MAIPROP_OS_WEBHOOK_SECRET` | `receive-from-os` (HMAC, see `WEBHOOK_VERIFICATION.md`) |
| `MAIPROP_OS_URL` | OS import/sync functions |
| `MAIPROP_OS_EMAIL` | OS import/sync functions |
| `MAIPROP_OS_PASSWORD` | OS import/sync functions |
| `GOOGLE_MAPS_API_KEY` | `streetview-proxy` and OS image enrichment |
| `CRON_SECRET` | `send-saved-search-alerts` scheduled invocation guard |
| `WEBHOOK_SECRET` | `oh-registration-notify` |
| `SENTRY_DSN` | edge-function structured logger forwarding |
| `ENVIRONMENT` | edge-function environment tag and CORS tightening |
| `GEMINI_API_KEY` | Preferred AI provider for report/search/assist functions when configured |
| `GEMINI_MODEL` | Optional Gemini model override; defaults to `gemini-2.5-flash` |
| `OPENAI_API_KEY` | Fallback AI provider for `ai-search`, `property-chat`, `pro-ai-tools`, `listing-ai-assist`, `ai-translate`, `smart-filters`, `neighbourhood-report`, `ai-service-match`, `property-valuation`, `property-pois` |
| `OPENAI_MODEL` | Optional OpenAI model override for non-translation AI functions |
| `OPENAI_TRANSLATION_MODEL` | Optional OpenAI model override for translation |
| `OPENAI_REASONING_EFFORT` | Optional OpenAI reasoning effort override for supported models |
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
| `VITE_SUPABASE_URL` | production Vite build Supabase URL | production environment |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | production Vite build anon/publishable key | production environment |
| `VITE_SUPABASE_PROJECT_ID` | production Supabase project ref | production environment |
| `VITE_SUPABASE_PROJECT_URL` | legacy alias for `VITE_SUPABASE_URL`; prefer `VITE_SUPABASE_URL` | local/test only |
| `VITE_MAPBOX_TOKEN` | optional map token for production build | production environment |
| `VITE_SENTRY_DSN` | optional browser Sentry DSN | production environment |
| `VITE_STRIPE_PRO_PRODUCT_ID` | optional Stripe product id for subscription checks | production environment |
| `VITE_TURNSTILE_SITE_KEY` | optional Turnstile site key | production environment |
| `VITE_GOOGLE_MAPS_API_KEY` | optional browser Google Maps key | production environment |
| `VITE_PLAUSIBLE_DOMAIN` | optional analytics domain | production environment |
| `VITE_APP_URL` | canonical app origin for production build | production environment |
| `SITE_LOCK_PASSWORD` | optional Cloudflare Pages runtime passcode gate | production environment |
| `STAGING_SUPABASE_URL` | staging Supabase URL for security/E2E jobs | repo or staging environment |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | staging anon/publishable key | repo or staging environment |
| `STAGING_SUPABASE_PROJECT_ID` | staging Supabase project ref | repo or staging environment |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI deploy/list token | repo or environment scoped to deploy jobs |
| `SUPABASE_PROJECT_REF` | optional project ref alias used by release-safety live inventory | manual release certification |
| `RELEASE_SAFETY_SUPABASE_PROJECT_REF` | optional project ref override for release-safety live inventory; defaults to `supabase/config.toml` `project_id` when unset | manual release certification |
| `SENTRY_AUTH_TOKEN` | optional read-only token for local production telemetry checks; never required by app runtime | local operator shell only |
| `RLS_USER_A_EMAIL` | staging RLS test user A | repo or staging environment |
| `RLS_USER_B_EMAIL` | staging RLS test user B | repo or staging environment |
| `RLS_USER_PASSWORD` | shared staging RLS test password | repo or staging environment |
| `ONBOARDING_TEST_EMAIL` | staging onboarding E2E user | repo or staging environment |
| `ONBOARDING_TEST_PASSWORD` | staging onboarding E2E password | repo or staging environment |
| `SUPABASE_SERVICE_ROLE_KEY` | staging-only service role for security tests and fixtures | staging environment only |

Additional seeded E2E accounts:

| Variable | Purpose |
|---|---|
| `E2E_DEMO_PASSWORD` | default password for seeded demo users |
| `E2E_USE_SEEDED_DEMO_ACCOUNTS` | explicit marker that seeded demo-account E2E may use shared fixture accounts |
| `E2E_BUYER_FREE_EMAIL` / `E2E_BUYER_FREE_PASSWORD` | free buyer fixture |
| `E2E_BUYER_PRO_EMAIL` / `E2E_BUYER_PRO_PASSWORD` | pro buyer fixture |
| `E2E_SELLER_PRO_EMAIL` / `E2E_SELLER_PRO_PASSWORD` | pro seller fixture |
| `E2E_AGENT_PRO_EMAIL` / `E2E_AGENT_PRO_PASSWORD` | pro agent fixture |
| `E2E_DEVELOPER_PRO_EMAIL` / `E2E_DEVELOPER_PRO_PASSWORD` | developer fixture |
| `E2E_INVESTOR_PRIVATE_EMAIL` / `E2E_INVESTOR_PRIVATE_PASSWORD` | private investor fixture |
| `E2E_INVESTOR_INSTITUTIONAL_EMAIL` / `E2E_INVESTOR_INSTITUTIONAL_PASSWORD` | institutional investor fixture |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | admin fixture |
| `E2E_PROFESSIONAL_ARCHITECT_PASSWORD`, `E2E_PROFESSIONAL_LAWYER_PASSWORD`, `E2E_PROFESSIONAL_VALUER_PASSWORD` | professional fixture passwords |

Destructive tests are disabled by default:

| Variable | Purpose |
|---|---|
| `E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS` | must be `true` before destructive live E2E can run |
| `E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS` | comma-separated allowlist of isolated Supabase refs for destructive E2E |
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

For local production telemetry verification, set a read-only Sentry token only in
the operator shell:

```powershell
$env:SENTRY_AUTH_TOKEN="<redacted>"
```

Do not commit Sentry auth tokens or add them to browser-visible `VITE_*`
variables. The app only needs `VITE_SENTRY_DSN` at build time and `SENTRY_DSN`
for edge-function error forwarding.

CI intentionally uses **stub** Supabase URL + key (format-valid placeholders in `.github/workflows/ci.yml`). Real keys must never be checked in.

---

## Troubleshooting

- **App boots but all requests fail with 401** — `VITE_SUPABASE_PUBLISHABLE_KEY` is wrong or mismatched with the URL's project ref.
- **"Invalid API key" during Stripe checkout** — `VITE_STRIPE_PRICE_*` was set to a price from the wrong mode (test vs live).
- **Sentry never receives events** — `VITE_SENTRY_DSN` must be set at **build** time; Vite inlines it. Re-deploy after changing.
- **Seed script refuses to run** — the prod guard triggered. See the script output for the override flag, and verify you actually meant to target that project.
