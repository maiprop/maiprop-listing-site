# Environment Variables — Setup Guide

This repo runs in three environments. Each has its own variables and its own source of truth.

| Env | Source of truth | Who edits |
|---|---|---|
| Local dev | `.env` at repo root (gitignored) | every developer |
| Staging | Netlify → Environment variables, scoped to branch `staging` | platform lead |
| Production | Netlify → Environment variables, scoped to `production` context | platform lead |
| CI (GH Actions) | Repo → Settings → Secrets and variables → Actions | repo admin |

Edge-function secrets (Stripe keys, service role, OpenAI) live in **Supabase → Project Settings → Edge Functions → Secrets**, **not** in Netlify. They never reach the browser.

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
| AI search / assist | `VITE_OPENAI_API_KEY` **or** `VITE_ANTHROPIC_API_KEY` | respective vendor dashboard |
| Stripe checkout | `VITE_STRIPE_PRO_PRODUCT_ID` + all `VITE_STRIPE_PRICE_*` | Stripe dashboard → Products |
| Error monitoring | `VITE_SENTRY_DSN` | sentry.io → Project → Client Keys |
| Analytics | `VITE_PLAUSIBLE_DOMAIN` | plausible.io → Sites |
| Street view | `VITE_GOOGLE_STREETVIEW_KEY` | Google Cloud Console |

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

### In Netlify

1. Site settings → Environment variables.
2. Add each variable from the table below with scope = `production`.
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
| `STRIPE_SECRET_KEY` | `stripe-webhook`, `create-checkout`, `customer-portal`, `get-invoices`, `create-stripe-price`, `sync-stripe-pricing` |
| `STRIPE_WEBHOOK_SECRET` | `stripe-webhook` |
| `OS_WEBHOOK_SECRET` | `receive-from-os` (HMAC, see `WEBHOOK_VERIFICATION.md`) |
| `OPENAI_API_KEY` | `ai-search`, `property-chat`, `pro-ai-tools`, `listing-ai-assist`, `ai-translate`, `smart-filters`, `neighbourhood-report`, `ai-service-match`, `property-valuation` |
| `MAPBOX_TOKEN` | `property-pois`, `location-poi` |
| `RESEND_API_KEY` | `process-email-queue`, `notify-*` |

Rotation cadence for each is documented in [`SECRETS_ROTATION.md`](./SECRETS_ROTATION.md).

---

## CI (GitHub Actions)

Under Settings → Secrets and variables → Actions:

| Secret | Purpose | Scope |
|---|---|---|
| `E2E_TEST_EMAIL` | auth E2E spec sign-in | repo or `production` env |
| `E2E_TEST_PASSWORD` | same | same |
| `LHCI_GITHUB_APP_TOKEN` | Lighthouse CI status checks | repo. See `LIGHTHOUSE_CI_SETUP.md` |

CI intentionally uses **stub** Supabase URL + key (format-valid placeholders in `.github/workflows/ci.yml`). Real keys must never be checked in.

---

## Troubleshooting

- **App boots but all requests fail with 401** — `VITE_SUPABASE_PUBLISHABLE_KEY` is wrong or mismatched with the URL's project ref.
- **"Invalid API key" during Stripe checkout** — `VITE_STRIPE_PRICE_*` was set to a price from the wrong mode (test vs live).
- **Sentry never receives events** — `VITE_SENTRY_DSN` must be set at **build** time; Vite inlines it. Re-deploy after changing.
- **Seed script refuses to run** — the prod guard triggered. See the script output for the override flag, and verify you actually meant to target that project.
