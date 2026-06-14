# mAI prop API Documentation

## Edge Functions (Supabase / Deno)

The authoritative API specification lives in
[`edge-functions.openapi.yaml`](./edge-functions.openapi.yaml).

### Hosted reference

Once the site is deployed, the spec is rendered via Redoc at:

- **Production**: hosted at `/api-docs.html` on the configured deployment domain
- **Staging**: available via Cloudflare Pages preview deploy

The YAML is copied into `public/docs/` at build time by the `prebuild` hook
(`npm run api-docs:copy`). Do not edit `public/docs/edge-functions.openapi.yaml`
directly — it is gitignored and regenerated.

> **CSP note**: the Redoc CDN script is loaded from `https://cdn.redoc.ly`.
> If you tighten `script-src` in `public/_headers` to a strict allow-list, add
> `https://cdn.redoc.ly` or self-host `redoc.standalone.js` under `/assets/`.

### Viewing the spec locally

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
2. Update docs/api/edge-functions.openapi.yaml with the corresponding path.
3. Regenerate any client SDKs (if used).
4. Commit both changes together.

Public Edge Functions listed in `docs/public-edge-function-inventory.json` must
also be represented in the OpenAPI paths. Verify before release:

```powershell
npm run check:openapi-coverage
```
