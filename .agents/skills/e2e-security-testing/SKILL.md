# E2E Security Testing (RLS + GDPR + Onboarding)

How to run the Playwright security test suites against a live Supabase instance.

## Devin Secrets Needed

- `VITE_SUPABASE_URL` — Supabase project URL (e.g. `https://<ref>.supabase.co`)
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/publishable key
- `SUPABASE_ANON_KEY` — Supabase service role key (may use `sb_secret_...` format)
- `RLS_USER_A_EMAIL`, `RLS_USER_B_EMAIL`, `RLS_USER_PASSWORD` — RLS test user credentials
- `ONBOARDING_TEST_EMAIL`, `ONBOARDING_TEST_PASSWORD` — Onboarding test user credentials
- A GitHub PAT with `repo` + `workflow` scopes (classic PAT, not fine-grained) for setting repo secrets and triggering `workflow_dispatch`

## Running Tests Locally

```bash
# 1. Build first — CI mode uses vite preview on port 4173
npm run build

# 2. Run all 3 suites
VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
VITE_SUPABASE_PUBLISHABLE_KEY="$VITE_SUPABASE_PUBLISHABLE_KEY" \
VITE_SUPABASE_PROJECT_ID="<project-id>" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_ANON_KEY" \
CI=true \
npx playwright test --project=chromium \
  e2e/rls-security.spec.ts \
  e2e/onboarding-role-selection.spec.ts \
  e2e/gdpr-delete-account.spec.ts
```

## Expected Results

- **RLS**: 4/4 passed (cross-user isolation, anon access, admin audit log)
- **Onboarding**: 2/2 skipped if test user already onboarded (expected)
- **GDPR**: 1/1 passed (account deletion + auth removal + PII scrubbing)

## Key Gotchas

### Supabase Key Formats
Supabase has two key formats:
- **Legacy**: `eyJ...` JWT tokens
- **New**: `sb_publishable_...` / `sb_secret_...` prefixed keys

The service role key might be stored under `SUPABASE_ANON_KEY` env var with `sb_secret_` prefix. Verify with `admin.auth.admin.listUsers()` before relying on it.

### Cookie Consent Banner
The `CookieConsentBanner` component (`src/components/CookieConsentBanner.tsx`) renders as a `fixed bottom-0 z-[100]` overlay after 1200ms if no `localStorage` consent exists. New test users will always trigger it.

**Fix**: Set localStorage before navigating to pages with interactive elements at the bottom:
```typescript
await page.evaluate(() =>
  localStorage.setItem(
    'maiprop_cookie_consent',
    JSON.stringify({ accepted: true, functional: true, analytics: true, mapping: true, timestamp: Date.now() }),
  ),
);
```

### CORS for CI Preview Port
The edge function CORS allowlist (`supabase/functions/_shared/cors.ts`) might not include `localhost:4173` (Vite preview port used in CI). If browser-initiated edge function calls fail with CORS errors:

**Fix**: Use `page.route()` to proxy the call through Node.js:
```typescript
await page.route('**/functions/v1/<function-name>', async (route) => {
  const req = route.request();
  const origin = req.headers()['origin'] ?? '*';
  if (req.method() === 'OPTIONS') {
    await route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
    return;
  }
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers())) {
    if (!k.startsWith('sec-') && k !== 'origin' && k !== 'referer') headers[k] = v;
  }
  const res = await fetch(req.url(), { method: req.method(), headers, body: req.postData() ?? undefined });
  const body = await res.text();
  const resHeaders: Record<string, string> = {};
  res.headers.forEach((v, k) => { resHeaders[k] = v; });
  resHeaders['access-control-allow-origin'] = origin;
  await route.fulfill({ status: res.status, headers: resHeaders, body });
});
```

### CI vs Local
- `CI=true` → Playwright uses `vite preview` on port **4173** (requires `npm run build` first)
- Without `CI` → Playwright expects dev server on port **8080** (`npm run dev`)

### Seeding Test Users
If test users don't exist in the target Supabase instance, create them via service role:
```javascript
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
await admin.auth.admin.createUser({
  email: 'user@example.com',
  password: 'TestPass2025!',
  email_confirm: true,
});
```

### Setting GitHub Repo Secrets
Fine-grained PATs may not support the secrets API. Use a **classic PAT** with `repo` + `workflow` scopes. Secrets must be encrypted with the repo's public key via PyNaCl before PUTting to `/repos/{owner}/{repo}/actions/secrets/{name}`.

## Triggering via CI

After merging, trigger the `e2e-security-staging` workflow via `workflow_dispatch` on `main`:
```bash
curl -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/maiprop/maiprop-listing-site/actions/workflows/ci.yml/dispatches" \
  -d '{"ref": "main"}'
```
