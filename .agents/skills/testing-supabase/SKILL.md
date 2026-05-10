---
name: testing-supabase
description: Testing Supabase RLS policies, edge functions, and security hardening. Covers local dev setup, key swaps, Deno test runner, and curl-based adversarial testing patterns.
---

# Testing Supabase RLS & Edge Functions

## Devin Secrets Needed

| Secret Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key for client-side operations |
| `SUPABASE_ANON_KEY` | **WARNING: Currently contains the SERVICE ROLE key** (`sb_secret_*`). Use this for admin operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | **WARNING: Currently contains the ANON JWT** (`eyJ...`, `role: "anon"`). Use this for anon testing. |
| `SUPABASE_ACCESS_TOKEN` | Personal access token for Supabase Management API (migrations, schema queries). Generate at https://supabase.com/dashboard/account/tokens |
| `ONBOARDING_TEST_EMAIL` | Email for test account login |
| `ONBOARDING_TEST_PASSWORD` | Password for test account login |
| `RLS_USER_A_EMAIL` | Email for RLS test user A |
| `RLS_USER_B_EMAIL` | Email for RLS test user B |
| `RLS_USER_PASSWORD` | Shared password for RLS test users |

> **Key gotcha**: The `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names are swapped. Always verify by decoding the JWT: `echo $KEY | python3 -c "import sys,base64,json; t=sys.stdin.read().strip().split('.'); print(json.loads(base64.urlsafe_b64decode(t[1]+'=='))['role'])"` — if it says `anon`, it's the anon key regardless of the env var name.

## Local Dev Server

```bash
cd /home/ubuntu/repos/maiprop-listing-site
npm run dev    # Starts on port 8080 (falls back to 8081 if 8080 is busy)
```

- The app connects to live Supabase (env vars from `.env` or shell environment)
- Homepage, listings, auctions, and login all work locally
- Login with `ONBOARDING_TEST_EMAIL` / `ONBOARDING_TEST_PASSWORD` redirects to `/dashboard`
- Admin pages (`/admin`) require `AdminRoute` — only accessible if the logged-in user has admin role

## Environment Access Constraints

- **Production site** (`maiprop.co`) may time out from testing VMs — use local dev server instead
- **Cloudflare Pages preview deploys** are behind Cloudflare Access (requires email login code). You cannot access preview URLs without the owner's Cloudflare Access credentials.
- **Local dev server** is the most reliable testing path — connects to live Supabase backend

## Testing RLS Policies

### Pattern: Anon access should be denied without recursion

```bash
export SB_URL="https://qvvicunqcrwpioqnvzxf.supabase.co"
REAL_ANON="${SUPABASE_SERVICE_ROLE_KEY}"  # JWT with role=anon
REAL_SRK="${SUPABASE_ANON_KEY}"           # sb_secret_* (actual service role)

# Test anon UPDATE — should return 204 (empty, denied), NOT 500
curl -s -w "\nHTTP: %{http_code}" "$SB_URL/rest/v1/TABLE?id=not.is.null" \
  -X PATCH \
  -H "apikey: ${REAL_ANON}" \
  -H "Authorization: Bearer ${REAL_ANON}" \
  -H "Content-Type: application/json" \
  -d '{"column": "value"}'
```

**Pass**: HTTP 204 or 200 with empty body (clean deny)  
**Fail**: HTTP 500 with `42P17` error code = infinite recursion in RLS policy

### Pattern: Service role should bypass RLS

```bash
# Insert via service role (bypasses RLS)
curl -s "$SB_URL/rest/v1/TABLE" \
  -H "apikey: ${REAL_SRK}" \
  -H "Authorization: Bearer ${REAL_SRK}" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{...}'
```

### Pattern: Verify policy guards via pg_policies

```bash
export SUPABASE_ACCESS_TOKEN="..."
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = '\''public'\'' AND cmd IN ('\''UPDATE'\'', '\''DELETE'\'') AND (qual ILIKE '\''%has_platform_admin%'\'' OR qual ILIKE '\''%has_role%'\'') ORDER BY tablename;"}'
```

## Deploying Migrations

Use the Supabase Management API to deploy SQL migrations:

```python
import json, subprocess, os
with open('path/to/migration.sql') as f:
    sql = f.read()
payload = json.dumps({'query': sql})
result = subprocess.run(
    ['curl', '-s', '-X', 'POST',
     'https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query',
     '-H', f'Authorization: Bearer {os.environ["SUPABASE_ACCESS_TOKEN"]}',
     '-H', 'Content-Type: application/json',
     '-d', payload],
    capture_output=True, text=True, env={**os.environ}
)
```

After deploying, mark the migration as applied:
```bash
npx supabase migration repair TIMESTAMP --status applied --linked
```

## Edge Function Testing

- Edge functions are NOT auto-deployed from git. After code changes, run `supabase functions deploy FUNCTION_NAME` to deploy.
- Rate limiting and timeouts only take effect after deployment.
- Functions with `verify_jwt = false` in `supabase/config.toml` are publicly accessible.
- Webhook/cron functions (`process-email-queue`, `oh-registration-notify`, `receive-from-os`, `stripe-webhook`) should NOT have IP-based rate limiting — they're called from infrastructure with shared IPs.

### Testing Undeployed Edge Function Changes (PR Code)

When testing edge function changes that haven't been deployed yet (e.g., in a PR branch), use the **Deno test runner** which exercises the handler directly:

```bash
export PATH="$HOME/.deno/bin:$PATH"
cd /home/ubuntu/repos/maiprop-listing-site
deno test --allow-net --allow-env --allow-read supabase/functions/FUNCTION_NAME/index.test.ts
```

The test harness uses `captureHandler` from `supabase/functions/_shared/testUtils.ts` to intercept the `Deno.serve` call and invoke the handler directly. This lets you test the full request/response cycle without deploying.

### Before/After Contrast Pattern

When hardening edge functions, test both the **live deployed (unhardened)** and **local (hardened)** code to show the gap:

```bash
# Live endpoint (deployed from main — may have old code)
curl -s -w "\nHTTP: %{http_code}" -X POST \
  "https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/FUNCTION_NAME" \
  -H "Content-Type: application/json" \
  -d 'MALICIOUS_PAYLOAD'

# Then compare with Deno handler test results for the same payload
```

This proves: (a) the vulnerability exists in production, and (b) the PR code fixes it.

### Adversarial Payloads for Input Validation

When testing edge function input validation, use these payload categories:

| Category | Example Payload | Expected Behavior |
|----------|----------------|-------------------|
| Null body | `null` | 400 "Request body must be a JSON object" |
| Array body | `[{"lat":37}]` | 400 "Request body must be a JSON object" |
| Non-numeric fields | `{"lat":"abc"}` | 400 with type error message |
| Out-of-range values | `{"lat":91}` | 400 with bounds error |
| Negative numeric caps | `{"radius_km":-5}` | Clamped to positive minimum |
| Excessive values | `{"limit":99999}` | Clamped to server-side max |
| Boolean type confusion | `{"lat":true}` | 400 with type error |
| Invalid JSON | `not-json` | 400 "Invalid JSON body" |

## Running Tests

```bash
# Vitest (frontend unit tests) — ~1254 tests
npm test

# Deno tests (edge function tests)
export PATH="$HOME/.deno/bin:$PATH"
cd supabase/functions && deno test --allow-env --allow-net --allow-read .

# Single Vitest file
npx vitest run src/test/SomeFile.test.ts
```

## Seed Script Testing

```bash
# Should fail fast with exit code 1 when env vars missing:
env -u VITE_SUPABASE_URL -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY npx tsx scripts/seed-mock-users.ts
# Expected: "Missing SUPABASE_URL..." error, exit code 1

# Should succeed with env vars set:
VITE_SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=key npx tsx scripts/seed-mock-users.ts
```

## Key Tables for Testing

- `articles` — requires: slug (text, NOT NULL), topic (text), title, meta_description, content (jsonb), category, read_time
- `pricing_configs` — admin-only, uses `has_platform_admin()`
- `profiles` — the original recursion bug table (A1). Anon PATCH used to cause HTTP 500.
- Most tables may be empty in production — RLS policy evaluation still occurs on empty tables, so anon UPDATE/DELETE tests work even without data.

## Two `has_role` Overloads

The database has two `has_role` function signatures with different behavior:
- `has_role(uuid, app_role)` → queries `user_roles` table directly
- `has_role(uuid, user_role)` → delegates to `authoritative_role()` which queries `profiles.role`

Existing policies use `app_role`. Changing to `user_role` changes behavior — should be done as a dedicated migration, not bundled with other fixes.

## UI Navigation for Testing

| Page | Route | Auth Required | Notes |
|------|-------|---------------|-------|
| Homepage | `/` | No | Hero, live market, featured properties |
| Listings | `/listings` | No | Filterable property grid |
| Auctions | `/auctions` | No | Uses `useAuctionListings` hook with staleTime |
| Login | `/login` | No | Email + password form |
| Dashboard | `/dashboard` | Yes (any user) | Sidebar with Overview, Saved, Messages, etc. |
| Admin | `/admin` | Yes (admin role) | Tabs: pipeline, subscribers, pricing, etc. |
| CRM Contacts | `/dashboard` → Contacts tab | Yes | Uses `useContacts` hook |
| Firesale Admin | `/admin?tab=pipeline` | Yes (admin) | Uses `AdminFiresalePipeline` |
| Pro Verification | `/admin?tab=pro-verification` | Yes (admin) | Uses `AdminProfessionalVerification` |

## CI Notes

- **DeepSource: JavaScript** and **Codacy** may fail on PRs even when code is correct — both flag Deno globals as unrecognized and may have pre-existing failures on `main`. Check if the failure exists on the base branch before investigating.
- **Build · Lint · Test** is the primary CI gate — this runs ESLint + Vitest.
- All CI checks are marked `[optional]` but Build · Lint · Test should always pass.
