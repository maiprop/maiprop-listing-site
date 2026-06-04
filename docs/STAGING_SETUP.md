# Staging Environment Setup

Purpose: mirror production so migrations, Stripe webhook changes, and edge-function deploys are validated end-to-end before `main` -> production.

## Architecture

- Pull requests from repo branches -> Cloudflare Pages preview deploy, only after CI confirms the Supabase staging runtime is isolated from production
- Dedicated Supabase project `maiprop-staging` (separate ref, separate DB, separate auth users)
- Stripe in **test mode** - separate webhook endpoint, separate API keys
- Sentry environment tag `staging` (same DSN or separate project, your call)

## One-time setup

### 1. Supabase staging project

```bash
# On supabase.com dashboard: create project "maiprop-staging", copy the ref
supabase link --project-ref <staging-ref>
supabase db push                              # apply all migrations
supabase functions deploy --project-ref <staging-ref>
```

Seed demo accounts into staging:

```bash
SUPABASE_SERVICE_ROLE_KEY=<staging-service-role-jwt> \
E2E_ALLOWED_DESTRUCTIVE_PROJECT_REFS=<staging-ref> \
  VITE_SUPABASE_URL=https://<staging-ref>.supabase.co \
  npx tsx scripts/seed-demo-accounts.ts
```

### 2. Cloudflare Pages

- Project settings -> Builds & deployments -> Configure production branch as `main`.
- Project settings -> Environment variables -> add all vars from `.env.staging.example` for the `Preview` environment.
- CI also syncs the required Preview runtime bindings before every eligible PR preview deploy: `SUPABASE_URL`, `SUPABASE_PROJECT_ID`, `SUPABASE_PUBLISHABLE_KEY`, their `VITE_*` aliases, and optional `SITE_LOCK_PASSWORD` from `STAGING_SITE_LOCK_PASSWORD`.
- Do not manually point Preview runtime bindings at production. The preview job is allowed to run only when isolated staging Supabase secrets are configured and verified.

### 3. Stripe (test mode)

- Create a webhook endpoint at `https://<staging-ref>.supabase.co/functions/v1/stripe-webhook` listening to the same events as prod.
- Set the `STRIPE_WEBHOOK_SECRET` on the staging Supabase project (Settings -> Edge Functions -> Secrets), not the Cloudflare Pages env.

### 4. GitHub

- Settings -> Environments -> create `staging` env. No reviewers required.
- Add required `staging` secrets: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and seeded E2E account credentials.
- Optional: add `STAGING_APP_URL` when previews must use a fixed staging origin. If it is absent, CI derives the Cloudflare Pages branch preview URL and uses it as `VITE_APP_URL`.
- Optional: add `STAGING_SITE_LOCK_PASSWORD` only when PR preview deployments should be passcode-protected.
- Use the staging `service_role` JWT API key for `SUPABASE_SERVICE_ROLE_KEY`; the newer `sb_secret_*` key is not accepted by the PostgREST fixture paths used by live E2E.
- Required when migrations change: add `SUPABASE_STAGING_DB_URL`, the percent-encoded Postgres connection string used by CI to run `supabase db push --db-url` before deploying staging edge functions. Without it, CI fails the staging migration path instead of deploying functions against a stale schema.
- `STAGING_SUPABASE_PROJECT_ID`, `STAGING_SUPABASE_URL`, and `STAGING_SUPABASE_PUBLISHABLE_KEY` must all point to the same non-production project. CI skips staging DB/function deploys and Cloudflare preview deploys when any staging secret matches production or the URL project ref does not match the configured project id.

## Deployment flow

1. PR against `main` -> CI runs `quality`, `e2e`, `migrations-validate`, and a Cloudflare preview deploy only when isolated Supabase staging is configured.
2. Merge to `main` -> Cloudflare Pages deploys `main` to production.
3. To promote changes to staging first: push to `staging` branch, typically `git push origin HEAD:staging`.
4. Smoke-test staging using the checklist below.

## Manual smoke-test checklist (staging)

- [ ] Home page loads, hero video plays
- [ ] Sign in as `buyer.pro@maiprop.demo` (password `Demo2025!`)
- [ ] Navigate to `/listings`, apply a filter, open a detail page
- [ ] Pricing page -> click upgrade -> reach Stripe checkout (test card 4242...)
- [ ] Complete checkout -> redirected back, profile shows Pro
- [ ] Stripe dashboard shows webhook delivered + 200 response
- [ ] `/settings` -> delete account -> user signed out, cannot sign back in
- [ ] Sentry staging env receives at least one transaction

## Troubleshooting

- **Edge functions not updated on branch deploy** - edge functions live on Supabase, not Cloudflare Pages. Re-run `supabase functions deploy --project-ref <staging-ref>` manually or through the production edge-function deployment workflow adapted for staging.
- **Auth emails going to production URL** - set the GitHub `STAGING_APP_URL` secret to the preview/staging origin when you need a fixed redirect host, and configure Supabase Auth -> URL Configuration to include that origin. When the secret is absent, the preview workflow derives the Cloudflare Pages branch preview URL and uses it as `VITE_APP_URL`.
