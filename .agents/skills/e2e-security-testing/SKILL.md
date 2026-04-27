# E2E Security Testing (RLS + GDPR + Onboarding)

Run the `e2e-security-staging` Playwright test suite against a live Supabase database (staging or production).

## Test Files

- `e2e/rls-security.spec.ts` — RLS cross-user isolation (API-only, no browser UI)
- `e2e/onboarding-role-selection.spec.ts` — Onboarding form validation guards (browser)
- `e2e/gdpr-delete-account.spec.ts` — GDPR account deletion flow (browser + service role)

## Devin Secrets Needed

| Secret Name | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key (`sb_publishable_...` format) |
| `SUPABASE_ANON_KEY` | Supabase service role key (`sb_secret_...` format — despite the name, this is the working service role key in the new Supabase key format) |
| `RLS_USER_A_EMAIL` | Email for RLS test user A |
| `RLS_USER_B_EMAIL` | Email for RLS test user B |
| `RLS_USER_PASSWORD` | Shared password for both RLS test users |
| `ONBOARDING_TEST_EMAIL` | Email for onboarding test user |
| `ONBOARDING_TEST_PASSWORD` | Password for onboarding test user |

## Key Format Note

Supabase uses two key formats:
- **New format**: `sb_publishable_...` (anon key) and `sb_secret_...` (service role key)
- **Legacy format**: `eyJ...` JWT tokens

The `SUPABASE_ANON_KEY` secret (org-level) contains the `sb_secret_...` service role key. The `SUPABASE_SERVICE_ROLE_KEY` secret (if present as a legacy `eyJ...` JWT) may not work — always verify with `admin.auth.admin.listUsers()` before running tests.

When setting GitHub repo secrets, map `SUPABASE_SERVICE_ROLE_KEY` → the `sb_secret_...` value from `SUPABASE_ANON_KEY`.

## Seeding Test Users

Test users may not exist in the target database. Seed them before running:

```js
const { createClient } = require('@supabase/supabase-js');
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {auth:{persistSession:false}});
await admin.auth.admin.createUser({ email, password, email_confirm: true });
```

Verify sign-in works after seeding:
```js
const client = createClient(SUPABASE_URL, ANON_KEY, {auth:{persistSession:false}});
await client.auth.signInWithPassword({ email, password });
```

## Running Locally

```bash
# 1. Install deps + Playwright
npm ci
npx playwright install --with-deps chromium

# 2. Build (required — CI mode uses preview server)
VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
VITE_SUPABASE_PROJECT_ID="<project-id>" \
npm run build

# 3. Run tests
VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
VITE_SUPABASE_PROJECT_ID="<project-id>" \
RLS_USER_A_EMAIL="$RLS_USER_A_EMAIL" \
RLS_USER_B_EMAIL="$RLS_USER_B_EMAIL" \
RLS_USER_PASSWORD="$RLS_USER_PASSWORD" \
ONBOARDING_TEST_EMAIL="$ONBOARDING_TEST_EMAIL" \
ONBOARDING_TEST_PASSWORD="$ONBOARDING_TEST_PASSWORD" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_ANON_KEY" \
CI=true \
npx playwright test --project=chromium \
  e2e/rls-security.spec.ts \
  e2e/onboarding-role-selection.spec.ts \
  e2e/gdpr-delete-account.spec.ts
```

**Important**: `CI=true` is required — it tells the Playwright config to use the preview server (`localhost:4173`) from the build output. Without it, Playwright expects a dev server on `localhost:8080`.

## Triggering via CI (workflow_dispatch)

The `e2e-security-staging` job in `.github/workflows/ci.yml` runs on `schedule` and `workflow_dispatch`. To trigger manually:

```bash
curl -X POST \
  -H "Authorization: token <CLASSIC_PAT>" \
  -H "Accept: application/vnd.github+json" \
  https://api.github.com/repos/maiprop/maiprop-listing-site/actions/workflows/ci.yml/dispatches \
  -d '{"ref":"<branch-name>"}'
```

**PAT requirements**: Must be a **classic PAT** with `repo` + `workflow` scopes. Fine-grained PATs need explicit "Secrets: Read and write" + "Actions: Read and write" permissions. The Devin integration token (`ghs_...`) cannot set secrets or trigger workflows.

### Setting repo secrets via API

The `gh secret set` command may fail through the Devin git proxy. Use `curl` + `PyNaCl` instead:
1. Fetch public key: `GET /repos/{owner}/{repo}/actions/secrets/public-key`
2. Encrypt with `nacl.public.SealedBox`
3. PUT encrypted value to `/repos/{owner}/{repo}/actions/secrets/{name}`

## Required GitHub Repo Secrets

| Secret | Maps to |
|---|---|
| `STAGING_SUPABASE_URL` | Production/staging Supabase URL |
| `STAGING_SUPABASE_PUBLISHABLE_KEY` | Production/staging publishable key |
| `STAGING_SUPABASE_PROJECT_ID` | Project ref ID (subdomain of the URL) |
| `RLS_USER_A_EMAIL` | RLS test user A email |
| `RLS_USER_B_EMAIL` | RLS test user B email |
| `RLS_USER_PASSWORD` | Shared RLS test user password |
| `ONBOARDING_TEST_EMAIL` | Onboarding test user email |
| `ONBOARDING_TEST_PASSWORD` | Onboarding test user password |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (`sb_secret_...` format) |

## Known Issues

- **Cookie Consent Banner blocks GDPR test**: `CookieConsentBanner` (`src/components/CookieConsentBanner.tsx`) renders as `fixed bottom-0 z-[100]` for new users without `localStorage` consent. It intercepts pointer events on the Delete Account button at the bottom of `/dashboard/settings`. Workaround: set `localStorage.setItem('maiprop_cookie_consent', JSON.stringify({accepted:true, functional:true, analytics:true, mapping:true, timestamp:Date.now()}))` via `page.evaluate()` before navigating to settings.

- **Onboarding tests skip for onboarded users**: The onboarding spec skips if the user is redirected to `/dashboard` instead of `/onboarding`. To run these tests, seed a fresh user or reset the existing one's onboarding state in the `profiles` table.

- **RLS tests are API-only**: `rls-security.spec.ts` doesn't use the browser — it calls Supabase JS directly. It will run even without a web server, but the Playwright config requires one when `CI=true`.
