# Audit Reconciliation — April 2026

This document reconciles the 25-item external audit against the actual repository state as of this commit, and records what was addressed in which PR.

## Legend

- ✅ **Done** — already implemented, audit finding was stale.
- 🟡 **Partial** — implemented but can be hardened.
- 🔧 **Addressed in this change** — see linked file.
- 🧭 **Requires decision / external action** — cannot be resolved by code alone.

---

## Item-by-item status

| # | Item | Status | Evidence / Action |
|---|------|:---:|---|
| 1 | Production deployment pipeline | 🧭 | Cloudflare Pages auto-deploys from Git via GitHub Actions. See `CLOUDFLARE_PAGES_SETUP.md`. |
| 2 | Main branch unprotected | 🧭 | GitHub UI: Settings → Branches → add rule for `main`: require 1 review, require status checks (`quality`, `e2e`), dismiss stale approvals, no force-push. |
| 3 | No GitHub environments | 🧭 | GitHub UI: Settings → Environments → create `staging` + `production`. Move production secrets into `production` env with required reviewer gates. |
| 4 | Sentry missing | ✅ | `@sentry/react` 10.47 installed; initialised in `src/main.tsx:1-26` behind `VITE_SENTRY_DSN`. Staging example already documents it. Action: set DSN in Cloudflare Pages env. |
| 5 | Secrets in git history | 🧭 | Run `gh secret-scanning alerts list` or `trufflehog git file://.` locally. All production credentials must be rotated at least once on a documented schedule regardless of findings. |
| 6 | RLS not E2E-tested | 🔧 | Added `e2e/rls-security.spec.ts` using two seeded demo users + direct Supabase JS client. |
| 7 | Payment checkout not tested | 🔧 | Added `e2e/payment-checkout.spec.ts` (skip-graceful when Stripe env not set). |
| 8 | Rate limiting unverified | 🧭 | Supabase dashboard → Authentication → Rate Limits. Confirm defaults (30/h sign-in, 4/h sign-up). For public edge functions add per-IP token-bucket in `_shared/`. |
| 9 | CSP truncated | ✅ | False positive. Full CSP present in `public/_headers` — the auditor's tool truncated its own output. |
| 10 | GDPR delete/export tests | 🔧 | Added `e2e/gdpr-delete-account.spec.ts`. |
| 11 | Admin role audit trail | 🔧 | Added migration `supabase/migrations/20260418120000_admin_audit_log.sql`: `admin_audit_log` table + trigger on `user_roles` INSERT/UPDATE/DELETE capturing actor, target, old/new role. |
| 12 | Secret rotation policy | 🔧 | Documented in `docs/SECRETS_ROTATION.md`. |
| 13 | Coverage thresholds missing | ✅ 🟡 | Thresholds already configured in `vitest.config.ts:28-33` (10% lines / 20% functions baseline) and `test:coverage` runs in CI. Raise incrementally per `docs/testing.md`. |
| 14 | Edge function E2E missing | 🟡 | `deno test supabase/functions/_shared/` runs in CI. Per-function integration tests (property-chat, pro-ai-tools, etc.) still thin — not addressed here. |
| 15 | Dark mode E2E | 🧭 | Low risk; add one spec toggling `next-themes` and asserting `html.dark` class on key routes. Not included in this batch. |
| 16 | Error boundary tests | 🧭 | Would require a dev-only `/throw-error` route. Not included. |
| 17 | Stripe webhook testing | 🔧 | Added `supabase/functions/stripe-webhook/webhook.test.ts` (Deno) — signature validation + idempotency case with mocked Stripe. |
| 18 | Mobile E2E | 🟡 | `playwright.config.ts` already has mobile project. Not expanded here. |
| 19 | Lighthouse thresholds weak | 🔧 | `.lighthouserc.json`: elevated LCP/CLS/TBT/FCP + performance category from `warn` to `error`. |
| 20 | a11y automation | 🔧 | Added `@axe-core/playwright` devDep and integrated axe scan into `e2e/accessibility.spec.ts` on home, listings, login. |
| 21 | Staging setup guide | 🔧 | Added `docs/STAGING_SETUP.md`. |
| 22 | DB backup/recovery | 🧭 | Supabase Pro provides PITR. Confirm plan tier; document recovery runbook in `docs/DR_RUNBOOK.md` once quarterly test is scheduled. |
| 23 | Canary/blue-green | 🧭 | Cloudflare Pages supports preview deploys per branch. Feature-flag gating (LaunchDarkly / OpenFeature) recommended; architectural. |
| 24 | Seed scripts prod-safety | 🔧 | Added `scripts/_prod-guard.ts` and gated `seed-demo-accounts.ts` + `seed-mock-users.ts`. |
| 25 | Migration validation in CI | 🔧 | Added `migrations-validate` job in `.github/workflows/ci.yml` that boots Postgres 15 and applies every `supabase/migrations/*.sql` in order. |
| 26 | Env variable setup guide missing | 🔧 | Added `docs/ENV_SETUP.md` covering local / staging / prod / CI plus edge-function secrets. |
| 27 | Lighthouse CI setup undocumented | 🔧 | Added `docs/LIGHTHOUSE_CI_SETUP.md` (GH App install, token, thresholds, local run). |
| 28 | OpenAPI not hosted | 🔧 | Added `public/api-docs.html` (Redoc via CDN) + `prebuild` script that copies the spec into `public/docs/`. CSP in `public/_headers` updated to allow `cdn.redoc.ly`. README + `docs/api/README.md` updated. |
| 29 | Webhook verification guide missing | 🔧 | Added `docs/WEBHOOK_VERIFICATION.md` covering Stripe and the MaiProp-OS HMAC scheme, with links to existing tests. |
| 30 | Production checklist missing | 🔧 | Added `docs/PRODUCTION_CHECKLIST.md` — 10-section gate covering code, secrets, DB, billing, observability, headers, DNS, a11y, GDPR, post-deploy. |

---

## Required operator actions (cannot be completed in code)

1. GitHub → Branch protection for `main` (#2)
2. GitHub → Environments `staging` + `production` with required reviewers (#3)
3. Cloudflare Pages → set `VITE_SENTRY_DSN` for production context (#4)
4. Supabase dashboard → enable PITR backups (#22) and verify auth rate limits (#8)
5. Run `npm i` after pulling to install `@axe-core/playwright` (#20)
6. Run `supabase db push` to apply new audit-log migration (#11)
7. Rotate all production secrets and record date in `docs/SECRETS_ROTATION.md` (#5, #12)
