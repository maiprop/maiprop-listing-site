# MaiProp API Documentation

## Edge Functions (Supabase / Deno)

The authoritative API specification lives in
[`edge-functions.openapi.yaml`](./edge-functions.openapi.yaml).

### Viewing the spec

**Option 1 — Swagger UI (local)**
```powershell
npx @redocly/cli preview-docs docs/api/edge-functions.openapi.yaml
```

**Option 2 — Static HTML (generate once)**
```powershell
npx @redocly/cli build-docs docs/api/edge-functions.openapi.yaml -o docs/api/index.html
```

**Option 3 — Paste into [editor.swagger.io](https://editor.swagger.io)**

### Auth model

| Security scheme | Functions using it |
|-----------------|--------------------|
| `SupabaseJWT`   | All `verify_jwt = true` functions (see `supabase/config.toml`) |
| `HMACSignature` | Webhooks from MaiProp-OS (verified via `_shared/webhookHmac.ts`) |
| `StripeSignature` | `stripe-webhook` only |
| _none_ | Public endpoints (AI search, valuations, sitemap, street-view proxy) |

### Environments

| Env | Base URL |
|-----|----------|
| Production | `https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1` |
| Local dev  | `http://127.0.0.1:54321/functions/v1` (via `supabase start`) |

### Keeping the spec in sync

When adding / removing / changing an edge function:
1. Update `supabase/config.toml` with the correct `verify_jwt` value.
2. Add/update the corresponding path in `edge-functions.openapi.yaml`.
3. Regenerate any client SDKs (if used).
4. Commit both changes together.
