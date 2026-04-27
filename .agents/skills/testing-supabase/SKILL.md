# Testing Supabase RLS & Edge Functions

## Devin Secrets Needed

| Secret Name | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon/publishable key for client-side operations |
| `SUPABASE_ANON_KEY` | **WARNING: Currently contains the SERVICE ROLE key** (`sb_secret_*`). Use this for admin operations. |
| `SUPABASE_SERVICE_ROLE_KEY` | **WARNING: Currently contains the ANON JWT** (`eyJ...`, `role: "anon"`). Use this for anon testing. |
| `SUPABASE_ACCESS_TOKEN` | Personal access token for Supabase Management API (migrations, schema queries). Generate at https://supabase.com/dashboard/account/tokens |

> **Key gotcha**: The `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` names are swapped. Always verify by decoding the JWT: `echo $KEY | python3 -c "import sys,base64,json; t=sys.stdin.read().strip().split('.'); print(json.loads(base64.urlsafe_b64decode(t[1]+'=='))['role'])"` — if it says `anon`, it's the anon key regardless of the env var name.

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
