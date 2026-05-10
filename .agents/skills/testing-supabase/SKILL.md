---
name: testing-supabase
description: Supabase RLS policy testing, edge function deployment, CORS debugging, and DB verification patterns for maiprop-listing-site.
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

- **Production site** (`portal.maiprop.co`) is behind a passcode gate — use `SITE_LOCK_PASSWORD` secret to unlock
- **Cloudflare Pages preview deploys** are behind Cloudflare Access (requires email login code). You cannot access preview URLs without the owner's Cloudflare Access credentials.
- **Local dev server** is the most reliable testing path — connects to live Supabase backend
- For CORS-specific testing, use `portal.maiprop.co` (production origin) rather than localhost

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
  -d '{"query": "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = '\''public'\'' AND cmd IN ('\''UPDATE'\''', '\''DELETE'\''') AND (qual ILIKE '\''%has_platform_admin%'\'' OR qual ILIKE '\''%has_role%'\''') ORDER BY tablename;"}'
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

## Edge Function Deployment

- Edge functions are NOT auto-deployed from git (unless the `deploy-edge-functions.yml` workflow is set up). After code changes on a branch, deploy manually.
- **Bulk deploy gotcha**: `npx supabase functions deploy` (without a function name) may silently skip some functions. Always verify by deploying critical functions individually:
  ```bash
  npx supabase functions deploy FUNCTION_NAME --project-ref qvvicunqcrwpioqnvzxf
  ```
- Rate limiting and timeouts only take effect after deployment.
- Functions with `verify_jwt = false` in `supabase/config.toml` are publicly accessible.
- Webhook/cron functions (`process-email-queue`, `oh-registration-notify`, `receive-from-os`, `stripe-webhook`) should NOT have IP-based rate limiting — they're called from infrastructure with shared IPs.

## CORS Debugging for Edge Functions

CORS config lives in `supabase/functions/_shared/cors.ts`. Common issues:

### Sentry tracing headers
If the frontend uses Sentry with `browserTracingIntegration`, it automatically injects `baggage` and `sentry-trace` headers on ALL fetch requests. These MUST be in the edge function CORS `Access-Control-Allow-Headers` list, or the browser preflight will fail with a CORS error.

**Symptom**: "Failed to send a request to the Edge Function" error in the UI. Curl works fine (no preflight), but browser calls fail.

**Fix**: Add `baggage, sentry-trace` to `BASE_ALLOWED_HEADERS` in `cors.ts`.

### Origin allowlist
The CORS config reflects the request's `Origin` header if it's in the allowed list, otherwise falls back to the first production origin. Check:
- Production origins: `maiprop.co`, `portal.maiprop.co`, `www.maiprop.co`
- Local dev: `localhost:8080`, `localhost:8081`, etc.
- Cloudflare Pages previews: matched by regex pattern `CF_PAGES_PATTERN`

**Testing CORS via curl** (simulates browser preflight):
```bash
curl -s -I -X OPTIONS \
  "https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/agent-data-input" \
  -H "Origin: https://portal.maiprop.co" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: authorization, apikey, content-type, baggage, sentry-trace"
```

**Pass**: `Access-Control-Allow-Origin: https://portal.maiprop.co` in response  
**Fail**: Origin doesn't match → falls back to `https://maiprop.co`

### RPC testing with all 3 key types
The `agent-data-input` edge function accepts 3 different key types as the `apikey` header (paired with a user JWT in `Authorization`):
1. `SUPABASE_SERVICE_ROLE_KEY` (JWT with role="anon")
2. `SUPABASE_ANON_KEY` (sb_secret_* format — actual service role)
3. `VITE_SUPABASE_PUBLISHABLE_KEY` (sb_publishable_* format)

All three should return HTTP 200 when paired with a valid user Bearer token.

## Running Tests

```bash
# Vitest (frontend unit tests) — ~1179 tests
npm test

# Deno tests (edge function tests) — ~238 tests
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
| Data Input | `/dashboard` → Data Input tab | Yes (agent) | Edge function RPC — tests CORS |
| Admin | `/admin` | Yes (admin role) | Tabs: pipeline, subscribers, pricing, etc. |
| CRM Contacts | `/dashboard` → Contacts tab | Yes | Uses `useContacts` hook |
| Firesale Admin | `/admin?tab=pipeline` | Yes (admin) | Uses `AdminFiresalePipeline` |
| Pro Verification | `/admin?tab=pro-verification` | Yes (admin) | Uses `AdminProfessionalVerification` |
