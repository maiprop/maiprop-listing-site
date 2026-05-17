# Staging Environment Setup

Purpose: mirror production so migrations, Stripe webhook changes, and edge-function deploys are validated end-to-end before `main` → production.

## Architecture

- Git branch `staging` → Cloudflare Pages preview deploy
- Dedicated Supabase project `maiprop-staging` (separate ref, separate DB, separate auth users)
- Stripe in **test mode** — separate webhook endpoint, separate API keys
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
SUPABASE_SERVICE_ROLE_KEY=<staging-service-key> \
  VITE_SUPABASE_URL=https://<staging-ref>.supabase.co \
  npx tsx scripts/seed-demo-accounts.ts
```

### 2. Cloudflare Pages

- Project settings → Builds & deployments → Configure production branch as `main`.
- Project settings → Environment variables → add all vars from `.env.staging.example` for the `Preview` environment.

### 3. Stripe (test mode)

- Create a webhook endpoint at `https://<staging-ref>.supabase.co/functions/v1/stripe-webhook` listening to the same events as prod.
- Set the `STRIPE_WEBHOOK_SECRET` on the staging Supabase project (Settings → Edge Functions → Secrets), not the Cloudflare Pages env.

### 4. GitHub

- Settings → Environments → create `staging` env. No reviewers required.
- Add required `staging` secrets: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_PUBLISHABLE_KEY`, `STAGING_SUPABASE_PROJECT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, and seeded E2E account credentials.
- Optional but recommended: add `SUPABASE_STAGING_DB_URL`, the percent-encoded Postgres connection string used by CI to run `supabase db push --db-url` before deploying staging edge functions. Without it, CI skips the staging DB push and still deploys edge functions after the migration validation gate passes.

## Deployment flow

1. PR against `main` → CI runs `quality`, `e2e`, `migrations-validate`.
2. Merge to `main` → Cloudflare Pages deploys `main` to production.
3. To promote changes to staging first: push to `staging` branch (typically `git push origin HEAD:staging`).
4. Smoke-test staging using the checklist below.

## Manual smoke-test checklist (staging)

- [ ] Home page loads, hero video plays
- [ ] Sign in as `buyer.pro@maiprop.demo` (password `Demo2025!`)
- [ ] Navigate to `/listings`, apply a filter, open a detail page
- [ ] Pricing page → click upgrade → reach Stripe checkout (test card 4242…)
- [ ] Complete checkout → redirected back, profile shows Pro
- [ ] Stripe dashboard shows webhook delivered + 200 response
- [ ] `/settings` → delete account → user signed out, cannot sign back in
- [ ] Sentry staging env receives at least one transaction

## Troubleshooting

- **Edge functions not updated on branch deploy** — edge functions live on Supabase, not Cloudflare Pages. You must re-run `supabase functions deploy --project-ref <staging-ref>` manually or via a `deploy-edge-functions.yml` GH Action (not yet created).
- **Auth emails going to production URL** — set `VITE_APP_URL` in Cloudflare Pages staging env and configure Supabase Auth → URL Configuration to include the staging preview URL as an allowed redirect URL.
