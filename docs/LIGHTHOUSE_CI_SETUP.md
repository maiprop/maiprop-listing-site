# Lighthouse CI — Setup Guide

The CI workflow runs Lighthouse CI on every push to `main` (see `.github/workflows/ci.yml` → `lighthouse` job). Without the GitHub App token it still runs and uploads reports to temporary public storage, but commit statuses will not be posted.

## 1. Install the GitHub App

1. Visit <https://github.com/apps/lighthouse-ci> and click **Install**.
2. Select this repository only (not all).
3. Approve the permissions (read metadata, write commit statuses).

## 2. Generate the token

1. After install, GitHub redirects to the Lighthouse CI app's settings page.
2. Copy the displayed **App token** (it starts with `github_app_`).
3. You will not be able to view this token again — regenerate if lost.

## 3. Store the token in GitHub

1. Repo → Settings → Secrets and variables → **Actions**.
2. **New repository secret**:
   - Name: `LHCI_GITHUB_APP_TOKEN`
   - Value: `github_app_...`

The workflow already passes it:

```yaml
env:
  LHCI_GITHUB_APP_TOKEN: ${{ secrets.LHCI_GITHUB_APP_TOKEN }}
```

## 4. Configuration

Thresholds and audited URLs live in `.lighthouserc.json`. Current assertions (post-audit hardening):

| Metric | Level | Threshold |
|---|---|---|
| `categories:performance` | error | min 0.70 |
| `categories:accessibility` | error | min 0.90 |
| `first-contentful-paint` | error | ≤ 2500 ms |
| `largest-contentful-paint` | error | ≤ 4000 ms |
| `cumulative-layout-shift` | error | ≤ 0.15 |
| `total-blocking-time` | error | ≤ 400 ms |

A regression on any `error`-level assertion fails the CI job. Bump the numbers down as the product improves; never relax them silently.

## 5. Running locally

```powershell
npm run lighthouse
# or just collect without asserting:
npm run lighthouse:collect
```

Reports land in `./.lighthouseci/`. The workflow uploads them to temporary public storage — check the CI log for the link.

## 6. Rotation

The token is treated as a long-lived credential. Rotation cadence is in [`SECRETS_ROTATION.md`](./SECRETS_ROTATION.md).
