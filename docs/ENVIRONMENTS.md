# GitHub Environments & Deployment Strategy

## Current Setup

| Environment | Trigger | URL | Supabase |
|-------------|---------|-----|----------|
| **Preview** | PR (non-draft) | `<branch>.maiprop-listing-site.pages.dev` | Stub values (no backend) |
| **Production** | Push to `main` | `portal.maiprop.co` / `maiprop-listing-site.pages.dev` | Live project |

## Recommended GitHub Environments

### `preview` (existing behaviour)
- No approval required
- Uses CI stub Supabase values (build-time only)
- Cloudflare Pages preview deploy reuses the `dist` artifact from the quality job

### `production`
- **Approval gate:** Optional — enable when team grows
- **Secrets:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, etc.
- **Deploy:** Rebuilds with real secrets (Vite bakes env vars into the bundle at build time, so the CI-built artifact can't be reused — see `ci.yml` comments)

### `staging` (recommended future addition)
- Requires a **separate Supabase project** for full isolation
- Shares the same Cloudflare Pages project under a `staging` branch deploy
- Edge functions deployed separately: `supabase functions deploy --project-ref <staging-ref>`
- Database migrations applied independently: `supabase db push --project-ref <staging-ref>`

## Why Production Rebuilds (E10)

The `deploy` job rebuilds the app instead of reusing the `quality` job artifact. This is **intentional**:

```
quality job: builds with STUB env vars (format-valid but non-functional)
deploy job:  builds with REAL env vars (secrets from GitHub Environments)
```

Vite bakes `VITE_*` variables into the JavaScript bundle at build time. The quality job's artifact contains stub URLs that won't work in production. The production build must use real values.

### Alternative: Runtime Configuration
To enable artifact reuse, the app would need to read configuration at runtime (e.g., from `window.__CONFIG__` injected by a server). This is a non-trivial refactor and not worth the complexity for the current deploy frequency.

## Rollback Strategy (E6)

The CI already implements automatic rollback:

1. **Pre-deploy:** Captures the current production deployment ID via Cloudflare API
2. **Post-deploy:** Runs health checks against `portal.maiprop.co`
3. **On failure:** Rolls back to the previous deployment ID

See `ci.yml` lines 471–569 for the implementation.

## Canary/Gradual Rollout (E5)

Cloudflare Pages doesn't natively support traffic splitting. Options:

1. **Cloudflare Workers route:** Create a Worker that splits traffic between the current and new deployment URLs based on a percentage cookie
2. **Feature flags:** Use a feature flag service (LaunchDarkly, Unleash, or a simple Supabase table) to gate new features
3. **Manual canary:** Deploy to preview URL first, verify, then merge to main

**Recommendation:** Start with feature flags for high-risk changes. Full canary infrastructure is premature at current scale.
