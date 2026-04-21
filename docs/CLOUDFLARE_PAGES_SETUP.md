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
4. Build settings: leave empty — the site is built in GitHub Actions and the
   pre-built `dist/` is uploaded by Wrangler.

## 2. GitHub Actions secrets

Add the following repo-level secrets
(**Settings → Secrets and variables → Actions**):

| Secret                  | How to obtain                                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Cloudflare dashboard → **My Profile → API Tokens → Create Token**. Use the **Edit Cloudflare Pages** template, scoped to the correct account. |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → **Workers & Pages** sidebar → right column shows **Account ID**.               |

> The previous `NETLIFY_AUTH_TOKEN` and `NETLIFY_SITE_ID` secrets can be deleted.

## 3. Pages project environment variables

Cloudflare Pages → **project** → **Settings → Environment variables** must be
set for **both Production and Preview** environments:

| Variable                         | Notes                                                              |
| -------------------------------- | ------------------------------------------------------------------ |
| `VITE_SUPABASE_URL`              | `https://<ref>.supabase.co`                                        |
| `VITE_SUPABASE_PUBLISHABLE_KEY`  | anon JWT from Supabase → Settings → API                            |
| `VITE_SUPABASE_PROJECT_ID`       | the `<ref>` part above                                             |
| `VITE_TURNSTILE_SITE_KEY`        | if Turnstile is in use                                             |
| `VITE_MAPBOX_TOKEN`              | optional — maps degrade gracefully without it                      |
| `VITE_SENTRY_DSN`                | optional                                                           |
| `VITE_STRIPE_PRO_PRODUCT_ID`     | optional                                                           |
| `VITE_APP_URL`                   | Production: `https://maiprop.co`; Preview: leave unset to auto-detect. |
| `SUPABASE_PROJECT_ID`            | **server-side only** — used by `functions/sitemap-dynamic.xml.ts` to proxy the dynamic sitemap. Same value as `VITE_SUPABASE_PROJECT_ID`. |

> See `.env.staging.example` for the canonical list.

## 4. Custom domain

Cloudflare Pages → **project** → **Custom domains** → add `maiprop.co`
(and `www.maiprop.co` if applicable). Cloudflare will auto-configure the DNS
records if the zone lives on the same account.

## 5. What gets deployed

- `dist/` — built by Vite in the `quality` job and uploaded as an artifact.
- `functions/` — Cloudflare Pages Functions (TypeScript), auto-bundled by
  Wrangler when present at the repo root. Currently hosts:
  - `functions/sitemap-dynamic.xml.ts` — proxies to the Supabase Edge Function
    that renders the SEO sitemap.
- `public/_headers` — security + cache headers (applied to every response).
- `public/_redirects` — SPA fallback (`/* → /index.html 200`) and static
  fallback for the dynamic sitemap route.

## 6. Rollback

The CI `deploy` job captures the previous production deployment ID via the
Cloudflare API before rolling out, and automatically rolls back if the
post-deploy health check against `https://maiprop.co` fails after 8 retries.

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
  `ENV_SETUP.md`, `AUDIT_RECONCILIATION.md`). Update when convenient.
