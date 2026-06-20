# Cloudflare Pages — first-time setup

This repo is deployed via GitHub Actions → Cloudflare Pages (replaced Netlify).
Every push to `main` builds + tests + deploys to production; every non-draft PR
gets a preview URL.

## 1. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git** is optional — we deploy via Wrangler in CI, so you can
   also use **Direct upload** once to initialise the project.
2. Project name: `maiprop-listing-site` (must match `CF_PROJECT` in
   `.github/workflows/ci.yml`).
3. Production branch: `main`.
4. Build output directory: `dist`. The repository also pins this in
   `wrangler.toml` with `pages_build_output_dir = "./dist"` so Git-connected
   or direct Wrangler deploys do not accidentally publish the repository root.
   The same file may contain stable non-secret public metadata such as
   `VITE_APP_URL`; Supabase bindings and `SITE_LOCK_PASSWORD` stay out of
   source control and are synced by CI into Cloudflare Pages environment
   variables.
5. Build settings may otherwise stay empty — the site is built in GitHub
   Actions and the pre-built `dist/` is uploaded by Wrangler.

## 2. GitHub Actions secrets

Add the following repo-level secrets
(**Settings → Secrets and variables → Actions**):

| Secret                  | How to obtain                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → **My Profile → API Tokens → Create Token**. Use the **Edit Cloudflare Pages** template, scoped to the correct account. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → **Workers & Pages** sidebar → right column shows **Account ID**.               |

> The previous `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets can be deleted.

## 3. Environment variables — two separate places

`VITE_*` variables are **baked into the bundle at build time**, so they must
be present when the CI deploy job runs `npm run build`. They live as
**GitHub Actions secrets**, not Pages env vars.

Only server-side vars (read by Pages Functions at runtime) live on the Pages
side.

### 3a. GitHub Actions secrets (for build-time `VITE_*`)

**Repo → Settings → Secrets and variables → Actions**:

| Secret                           | Required? | Notes                                                              |
| -------------------------------- | --------- | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`              | **yes**   | `https://<ref>.supabase.co`                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | **yes**   | anon JWT from Supabase → Settings → API                            |
| `VITE_SUPABASE_PROJECT_ID`       | **yes**   | the `<ref>` part above                                             |
| `VITE_TURNSTILE_SITE_KEY`        | optional  | if Turnstile is in use                                             |
| `VITE_MAPBOX_TOKEN`              | optional  | maps degrade gracefully without it                                 |
| `VITE_SENTRY_DSN`                | optional  | error reporting                                                    |
| `VITE_STRIPE_PRO_PRODUCT_ID`     | optional  | paid subscription flow                                             |
| `VITE_GOOGLE_MAPS_API_KEY`       | optional  | enhances auction cards + Places autocomplete                       |
| `VITE_PLAUSIBLE_DOMAIN`          | optional  | enables Plausible analytics                                        |
| `VITE_APP_URL`                   | **yes**   | canonical public origin (currently `https://portal.maiprop.co` — the only host whose DNS resolves to this Pages deployment). Used for OAuth redirects, password-reset links, Stripe checkout URLs and `navigator.share` URLs. The hardcoded fallback in `src/lib/config.ts` matches, so unsetting the secret does not silently break production, but keep both in sync. |

These are read by the **production** `deploy` job which rebuilds with real
values. The `quality` and `e2e` jobs keep using the placeholder values set in
the workflow's top-level `env:` block so tests don't hit live Supabase.

Quick-set with `gh` (interactive prompts — values never hit shell history):

```powershell
gh secret set VITE_SUPABASE_URL             --repo maiprop/maiprop-listing-site
gh secret set VITE_SUPABASE_PUBLISHABLE_KEY --repo maiprop/maiprop-listing-site
gh secret set VITE_SUPABASE_PROJECT_ID      --repo maiprop/maiprop-listing-site
# repeat for any optional ones you need
```

### 3b. Cloudflare Pages env vars (for runtime Pages Functions)

Pages Functions run on the Workers runtime; they read env vars from the
**Pages project settings**, NOT from the Vite bundle or GitHub Actions env.

| Variable                    | Notes                                                              |
| --------------------------- | ------------------------------------------------------------------ |
| `SUPABASE_PROJECT_ID`       | server-side only; used by `functions/sitemap-dynamic.xml.ts`, SEO prerendering, and cached public API routes. Same value as `VITE_SUPABASE_PROJECT_ID`. |
| `SUPABASE_PUBLISHABLE_KEY`  | server-side public anon key for cached public listing/homepage API routes. Same value as `VITE_SUPABASE_PUBLISHABLE_KEY`. Do not use a service-role key in Pages Functions. |
| `SITE_LOCK_PASSWORD`        | **optional**; when set, `functions/_middleware.ts` locks every request behind a passcode splash. Leave unset to keep the site public. Stored as `secret_text` (encrypted at rest on Cloudflare). See section 8 below. |

The CI `deploy` job **automatically syncs** these variables into the Pages
production env on every deploy (step: *Sync Cloudflare Pages runtime
environment variables*), sourced from the `VITE_SUPABASE_PROJECT_ID`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, and `SITE_LOCK_PASSWORD` GitHub secrets.
The PR preview deploy job mirrors this for the Pages **Preview** runtime
environment, but it uses the isolated staging secrets:
`STAGING_SUPABASE_PROJECT_ID`, `STAGING_SUPABASE_URL`,
`STAGING_SUPABASE_PUBLISHABLE_KEY`, optional `STAGING_APP_URL`, and optional
`STAGING_SITE_LOCK_PASSWORD`. When `STAGING_APP_URL` is absent, CI derives the
Cloudflare Pages branch preview origin and bakes that into `VITE_APP_URL`. This
keeps preview browser bundles and preview Pages Functions on the same staging
backend.
You only need to touch Cloudflare Pages Settings > Environment variables if you add **new**
server-side bindings (and then extend that CI step accordingly).

> See `.env.staging.example` for the canonical list of Vite vars.

## 4. Custom domain

Cloudflare Pages → **project** → **Custom domains** → add `maiprop.co`
(and `www.maiprop.co` if applicable). Cloudflare will auto-configure the DNS
records if the zone lives on the same account.

### 4a. Canonical host + alias redirects

**Canonical host today: `portal.maiprop.co`.** It is the only domain whose
DNS currently points at this Pages deployment (`maiprop.co` resolves to
Namecheap parking, `www.maiprop.co` points at an unrelated AWS host). The
app's `APP_ORIGIN` (`src/lib/config.ts`) and the `VITE_APP_URL` CI secret
both resolve to `https://portal.maiprop.co`.

`functions/_middleware.ts` contains a `REDIRECT_HOSTS` `Map<alias, canonical>`
that returns a `301` (path + query preserved, `Cache-Control: public,
max-age=3600`) before the site-lock gate runs. The map is **empty** right
now — re-enable once DNS is aligned (e.g. after `CNAME maiprop.co →
maiprop-listing-site.pages.dev`). Rationale for the mechanism when active:

- **One canonical origin for auth/share URLs.** OAuth providers, Stripe and
  `navigator.share` callbacks all resolve against `VITE_APP_URL`. Serving
  the app on two hosts would split-brain half the callback links.
- **Single site-lock prompt.** Without the 301, a user with the passcode
  cookie for the canonical host hitting an alias would see the splash again
  (cookies are host-scoped).
- **Cache-friendly.** Browsers and Cloudflare's edge cache the 301 for an
  hour, so the redirect is effectively free after the first hit.

To switch the canonical host in future: update `APP_ORIGIN`, the
`VITE_APP_URL` secret, **and** any OAuth/Stripe redirect-URI allowlists at
the provider consoles *before* flipping DNS — otherwise auth flows break
between config change and provider update. `www.*` is intentionally left
out of any `REDIRECT_HOSTS` map because many OAuth providers register
apex and www as distinct origins.

## 5. What gets deployed

- `dist/` — built by Vite in the `quality` job and uploaded as an artifact.
- `functions/` — Cloudflare Pages Functions (TypeScript), auto-bundled by
  Wrangler when present at the repo root. Currently hosts:
  - `functions/sitemap-dynamic.xml.ts` — proxies to the Supabase Edge Function
    that renders the SEO sitemap.
- `public/_headers` — security + cache headers (applied to every response).
- `public/_routes.json` — routes dynamic Pages Functions, including
  `/api/public/*`, before static fallback handling.
- `public/_redirects` — static sitemap fallback only. Do not add a catch-all
  SPA rewrite; Cloudflare Pages handles SPA fallback and Wrangler rejects
  `/* -> /index.html` as an infinite loop.

## 6. Rollback

The CI `deploy` job captures the previous production deployment ID via the
Cloudflare API before rolling out, and automatically rolls back if the
post-deploy health check against `https://portal.maiprop.co` fails after 8 retries.

To manually roll back:

```bash
curl -X POST \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/maiprop-listing-site/deployments/<DEPLOYMENT_ID>/rollback"
```

Or use the dashboard: **Pages → project → Deployments → ⋯ → Rollback**.

## 7. Known follow-ups (not in this migration)

- `POST /api/event` (Plausible analytics proxy) — previously configured in the
  Netlify UI. To restore, add `functions/api/event.ts` that forwards to
  `https://plausible.io/api/event`.
- `docs/*.md` still mentions Netlify in operational runbooks
  (`PRODUCTION_CHECKLIST.md`, `STAGING_SETUP.md`, `SECRETS_ROTATION.md`,
  `ENV_SETUP.md`, `archive/audits/AUDIT_RECONCILIATION.md`). Update when convenient.

## 8. Pre-launch site lock (passcode gate)

`functions/_middleware.ts` implements a site-wide passcode gate. Every
request — HTML, JS/CSS assets, Pages Functions — is intercepted at the edge.
Visitors without a valid cookie see a branded splash form; submitting the
correct passcode sets an `HttpOnly`, `Secure`, `SameSite=Lax` cookie valid
for 30 days and redirects to the originally requested URL.

The gate is **fully disabled** when `SITE_LOCK_PASSWORD` is unset. The Vite
bundle is never touched — the password only lives in the Cloudflare Pages
runtime environment, so nothing leaks into the shipped JS.

### Enable the lock

Choose one:

**Option A — CI-managed (recommended).**

1. Pick a strong passcode.
2. Add it as a GitHub repo secret:
   ```powershell
   gh secret set SITE_LOCK_PASSWORD --repo maiprop/maiprop-listing-site
   ```
3. Push any commit to `main` (or re-run the latest `deploy` job). The
   *Sync Cloudflare Pages runtime environment variables* step will push the
   value into the Pages project as `secret_text`. On the next request the
   middleware picks it up.

**Option B — Cloudflare dashboard (one-off).**

Cloudflare dashboard → Workers & Pages → `maiprop-listing-site` → Settings
→ Environment variables → **Production** → add `SITE_LOCK_PASSWORD`
(type: *Encrypt*). Trigger a redeploy (or the next CI run) so the Function
runtime picks up the new binding.

> Note: if you set the value via the dashboard only, the next CI deploy
> will still preserve it — the sync step does a partial PATCH and only
> touches keys it explicitly sends.

### Disable the lock

- **CI-managed:** delete the GitHub secret (`gh secret delete SITE_LOCK_PASSWORD`)
  and re-run the production deploy. The CI sync step sends
  `SITE_LOCK_PASSWORD: null` to Cloudflare Pages, which removes any previously
  stored production binding before the new deployment is uploaded.
- **Dashboard-only:** delete the variable on Cloudflare Pages and redeploy.

### Rotate the passcode

Update the GitHub secret and redeploy, or change the value in the Pages
dashboard. All previously-issued cookies are invalidated automatically
(they store `sha256(password)`, which no longer matches).

### Troubleshooting

- **Health check (`curl https://portal.maiprop.co`) fails after deploy.**
  The production deploy smoke check is site-lock-aware. When
  `SITE_LOCK_PASSWORD` is configured in GitHub Actions, CI passes it to the
  health check as `PRODUCTION_DEPLOY_SITE_LOCK_PASSWORD` and the script sends
  the same `maiprop_unlock` cookie as the middleware. If the health check
  reports a site-lock page, confirm the GitHub secret exists and matches the
  Cloudflare runtime binding, or clear `SITE_LOCK_PASSWORD` before production
  deploy checks.
- **Preview deploys are also locked.** Production and preview use separate
  passcode secrets. The production sync writes `SITE_LOCK_PASSWORD` only to
  `deployment_configs.production`; PR previews write `STAGING_SITE_LOCK_PASSWORD`
  to `deployment_configs.preview` when that staging secret exists, otherwise
  they remove the preview lock binding.
- **I'm seeing the splash on localhost.** You shouldn't — the middleware
  runs only on Cloudflare Pages. `npm run dev` and `npm run preview` don't
  go through the Workers runtime.
