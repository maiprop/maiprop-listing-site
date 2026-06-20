# Lighthouse CI Setup Guide

The CI workflow runs Lighthouse CI on every push to `main` through the
`lighthouse` job in `.github/workflows/ci.yml`. The audit now covers public
routes plus authenticated app surfaces so regressions in the real listing
portal are caught before deploy.

## 1. Install the GitHub App

1. Visit <https://github.com/apps/lighthouse-ci> and click **Install**.
2. Select this repository only.
3. Approve the permissions for metadata read and commit status write access.

## 2. Generate the Token

1. After install, GitHub redirects to the Lighthouse CI app settings page.
2. Copy the displayed app token. It starts with `github_app_`.
3. Store it immediately because it is not shown again.

## 3. Store Required Secrets

Add these repository secrets under GitHub repository settings, **Secrets and
variables** -> **Actions**.

| Secret | Purpose |
|---|---|
| `LHCI_GITHUB_APP_TOKEN` | Posts Lighthouse CI commit statuses. |
| `STAGING_SUPABASE_URL` | Builds the audited app against staging Supabase. |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | Staging anon key used by the Vite bundle. |
| `STAGING_SUPABASE_PROJECT_ID` | Staging project id used by the app runtime. |
| `E2E_SELLER_PRO_EMAIL` | Seeded non-admin account for `/dashboard`. |
| `E2E_SELLER_PRO_PASSWORD` | Password for the seeded dashboard account. |
| `E2E_ADMIN_EMAIL` | Seeded admin account for `/admin` and `/platform-map`. |
| `E2E_ADMIN_PASSWORD` | Password for the seeded admin account. |

The workflow intentionally fails if an authenticated-audit secret is missing.
That keeps protected pages from silently being measured as the login screen.

## 4. Audited Routes

The route list lives in `.lighthouserc.json`.

| Route | Auth |
|---|---|
| `/` | Public |
| `/listings` | Public |
| `/auctions` | Public |
| `/open-houses` | Public |
| `/professionals` | Public |
| `/pricing` | Public |
| `/login` | Public |
| `/property/lighthouse-smoke-property` | Public route-shape audit |
| `/dashboard` | `E2E_SELLER_PRO_EMAIL` |
| `/admin` | `E2E_ADMIN_EMAIL` |
| `/platform-map` | `E2E_ADMIN_EMAIL` |

Authentication is handled by `scripts/lighthouse-auth.cjs`, which signs in
through `/login` before Lighthouse measures protected routes.

## 5. Current Assertions

| Metric | Level | Threshold |
|---|---|---:|
| `categories:performance` | error | min 0.75 |
| `categories:accessibility` | error | min 0.90 |
| `categories:best-practices` | error | min 0.85 |
| `categories:seo` | error | min 0.90 |
| `first-contentful-paint` | error | <= 2200 ms |
| `largest-contentful-paint` | error | <= 3500 ms |
| `total-blocking-time` | error | <= 400 ms |
| `max-potential-fid` | error | <= 200 ms |
| `cumulative-layout-shift` | error | <= 0.10 |

Tighten these thresholds as the product improves. Do not relax them without a
tracked performance decision.

## 6. Running Locally

Public-route collection can run with local or staging env vars:

```powershell
npm run lighthouse
```

Authenticated collection requires the same route credentials used by CI:

```powershell
$env:LIGHTHOUSE_AUTH_EMAIL="seller@example.test"
$env:LIGHTHOUSE_AUTH_PASSWORD="..."
$env:LIGHTHOUSE_ADMIN_EMAIL="admin@example.test"
$env:LIGHTHOUSE_ADMIN_PASSWORD="..."
npm run lighthouse
```

Reports land in `.lighthouseci/`. CI uploads reports to temporary public
storage and also persists the directory as the `lighthouse-reports` GitHub Actions artifact
for 30 days. Use that artifact for trend review when a route
gets close to a budget or a PR changes rendering, data loading, images, maps, or
dashboard code.

## 7. Rotation

Rotate the app token and seeded account passwords according to
`docs/SECRETS_ROTATION.md`.
