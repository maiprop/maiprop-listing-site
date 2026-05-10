---
name: testing-supabase
description: Test Supabase RLS policies, edge functions, CORS configuration, and RPC calls. Use when verifying database security, edge function behavior, or CORS changes.
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
  -d '{"query": "SELECT tablename, policyname, cmd, qual FROM pg_policies WHERE schemaname = '\''public'\'' AND cmd IN ('\''UPDATE'\'',' \''DELETE'\''') AND (qual ILIKE '\''%has_platform_admin%'\'' OR qual ILIKE '\''%has_role%'\'') ORDER BY tablename;"}'
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

- Edge functions auto-deploy via `.github/workflows/deploy-edge-functions.yml` on push to `main` when `supabase/functions/**` changes. No manual `supabase functions deploy` needed after merge.
- Rate limiting and timeouts only take effect after deployment.
- Functions with `verify_jwt = false` in `supabase/config.toml` are publicly accessible.
- Webhook/cron functions (`process-email-queue`, `oh-registration-notify`, `receive-from-os`, `stripe-webhook`) should NOT have IP-based rate limiting — they're called from infrastructure with shared IPs.

### CORS Testing

The shared CORS config is at `supabase/functions/_shared/cors.ts`. When adding new headers that the frontend sends (e.g., from Sentry tracing, analytics SDKs), they must be added to `BASE_ALLOWED_HEADERS`.

**Common CORS issue**: Sentry's performance tracing automatically adds `baggage` and `sentry-trace` headers to all fetch requests. If these aren't in the edge function CORS allowlist, ALL browser-to-edge-function calls fail with a preflight error. The error appears as "Failed to send a request to the Edge Function" in the UI — check browser DevTools Network tab for the specific CORS preflight failure.

```bash
# Run CORS unit tests
cd supabase/functions && deno test --allow-env --allow-net --allow-read _shared/cors.test.ts
```

Key assertions in CORS tests:
- `baggage` and `sentry-trace` are in allowed headers
- Production origins are reflected
- Localhost dev origins are allowed in non-production mode
- Unknown origins fall back to first production origin

### RPC Testing With All 3 Available Keys

The project has 3 available keys with different formats. All work as the `apikey` header when paired with a user JWT in the `Authorization` header:

```bash
# Step 1: Get a user JWT
USER_JWT=$(curl -s "${VITE_SUPABASE_URL}/auth/v1/token?grant_type=password" \
  -H "apikey: ${VITE_SUPABASE_PUBLISHABLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"email": "agent.pro@maiprop.demo", "password": "Demo2025!"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Step 2: Test each key with an edge function
for KEY_NAME in SUPABASE_SERVICE_ROLE_KEY SUPABASE_ANON_KEY VITE_SUPABASE_PUBLISHABLE_KEY; do
  KEY_VAL=$(printenv $KEY_NAME)
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    "${VITE_SUPABASE_URL}/functions/v1/agent-data-input/status" \
    -H "apikey: ${KEY_VAL}" \
    -H "Authorization: Bearer ${USER_JWT}" \
    -H "Content-Type: application/json")
  echo "${KEY_NAME}: HTTP ${HTTP_CODE}"
done
```

**Pass**: All 3 keys return HTTP 200 with JSON containing `quota` and `submissions`
**Fail**: Any key returns HTTP 401/403/500

### Data Input Form Testing (UI)

The Data Input form (`/dashboard` → Data Input tab) calls the `agent-data-input` edge function via RPC.

1. Log in as `agent.pro@maiprop.demo` / `Demo2025!`
2. Navigate to Dashboard → Data Input tab
3. Verify: quota display (0/20 or current count), form fields (closing date, price, address, city, property type dropdown, transaction type, KAEK, buyer/seller names, notes)
4. Fill required fields and click "Submit closing"
5. **Pre-merge**: Expect "Failed to send a request to the Edge Function" (CORS error if fix not deployed yet)
6. **Post-merge**: Should succeed and show success toast, quota increments

## Running Tests

```bash
# Vitest (frontend unit tests) — ~1138+ tests
npm test

# Deno tests (edge function tests) — ~260+ tests
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

## DB State Verification via Management API

Useful queries to verify migration state without applying them:

```bash
# Check if a specific RLS policy exists
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT policyname FROM pg_policies WHERE schemaname='\''public'\'' AND policyname='\''POLICY_NAME'\'';"}'

# Check if a CHECK constraint exists
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='\''TABLE_NAME'\'' AND constraint_type='\''CHECK'\'';"}'

# Check if a trigger exists
curl -s -X POST "https://api.supabase.com/v1/projects/qvvicunqcrwpioqnvzxf/database/query" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT tgname FROM pg_trigger WHERE tgname='\''TRIGGER_NAME'\'';"}'
```

## Migration Testing Gotchas

- **Never edit already-applied production migrations** — `supabase db push` validates hashes. If a migration was already applied, its content is immutable.
- **Conditional migration pattern**: Use `schema_migrations` table detection to differentiate CI (fresh DB) from production:
  ```sql
  DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='supabase_migrations' AND table_name='schema_migrations') THEN
      -- CI/fresh build: safe to drop/recreate
    END IF;
  END $$;
  ```
- **Migration ordering**: Ensure migrations that reference tables run AFTER the migration that creates those tables. Split migrations if needed.

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
