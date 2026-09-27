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

**Optional Redoc tooling (not installed by this repository; review installation separately)**
```powershell
npx @redocly/cli preview-docs docs/api/edge-functions.openapi.yaml
```

**Optional static HTML generation with that tooling**
```powershell
npx @redocly/cli build-docs docs/api/edge-functions.openapi.yaml -o docs/api/index.html
```

**Option 3 — Paste into [editor.swagger.io](https://editor.swagger.io)**

### Auth model

Gateway verify_jwt controls gateway JWT validation only. Individual handlers can require a verified actor and quota, cron/service credentials or signed webhooks even when that setting is false. The displayed AI generation endpoints require signed-in actors; listing-ai-assist has a separate availability ping branch. property-chat success is SSE, not JSON. Follow the operation contract rather than treating the public-function inventory as an anonymous-access list.

The website catalogue uses GET /api/public/listings on the selected website origin. It is not an Edge /listings function and its OpenAPI operation overrides the server base. Its page envelope contains data/hasMore/nextCursor/page/pageSize/offset/publicationId, not a total field.

Examples are synthetic source contracts. Select an isolated environment and public client credentials; never place service keys in browser code. AI requests consume quota and Checkout can create provider sessions. Source presence does not prove current deployed availability.

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
