# Edge Function Auth Audit

> Last updated: 2026-04-27

## Functions with `verify_jwt = false`

These functions do NOT require a valid Supabase JWT. Each must have an alternative authentication mechanism or a documented reason for being public.

| Function | Alt Auth | Justification |
|----------|----------|---------------|
| `ai-search` | Rate limiter | Public search — rate limited per IP |
| `property-valuation` | Rate limiter | Public tool — rate limited per IP |
| `neighbourhood-report` | Rate limiter | Public tool — rate limited per IP |
| `property-pois` | Rate limiter | Public tool — rate limited per IP |
| `smart-filters` | Rate limiter | Public UI helper — rate limited per IP |
| `ai-translate` | Rate limiter | Public i18n helper — rate limited per IP |
| `streetview-proxy` | Rate limiter | Proxies Google API — rate limited per IP |
| `sitemap` | None (read-only) | Public SEO endpoint — serves XML sitemap |
| `healthz` | None (read-only) | Public health check — returns `{ ok: true }` |
| `csp-report` | None (write-only) | Receives CSP violation reports from browsers |
| `stripe-webhook` | Stripe signature (`stripe.webhooks.constructEvent`) | Verified via `STRIPE_WEBHOOK_SIGNING_SECRET` |
| `auth-email-hook` | Supabase hook secret (`SEND_EMAIL_HOOK_SECRET`) | Triggered by Supabase Auth system |
| `sync-to-os` | Service role key check | Internal — called by admin dashboard |
| `receive-from-os` | API key header (`X-OS-API-KEY`) | External webhook from mAI Prop OS |
| `poll-os-auctions` | pg_cron (no external access) | Scheduled task — runs server-side only |
| `sync-firesale-to-os` | Service role key check | Internal — called by admin dashboard |
| `full-sync-from-os` | Service role key check | Internal — called by admin dashboard |
| `fetch-report-from-os` | Service role key check | Internal — called by admin dashboard |
| `os-diagnose` | Service role key check | Internal — called by admin dashboard |
| `os-sales-coordinates` | Service role key check | Internal — called by admin dashboard |
| `fetch-past-deals-from-os` | Service role key check | Internal — called by admin dashboard |
| `send-saved-search-alerts` | pg_cron (no external access) | Scheduled task — runs server-side only |
| `invitation-notify` | Database webhook (internal) | Triggered by DB insert, not externally callable |
| `oh-registration-notify` | Database webhook (internal) | Triggered by DB insert, not externally callable |
| `process-email-queue` | pg_cron (no external access) | Scheduled task — runs server-side only |

## Risk Assessment

**No unprotected write endpoints found.** All `verify_jwt=false` functions either:
1. Are rate-limited public read endpoints (AI tools, search, sitemap)
2. Have alternative auth (Stripe signature, OS API key, hook secret)
3. Are server-triggered only (pg_cron, database webhooks)
4. Are write-only receivers with validation (CSP reports, OS webhooks)

## Recommendations

1. ~~Add rate limiting to `streetview-proxy`~~ — ✅ Already rate limited
2. Monitor `csp-report` for abuse (high volume could be used for log flooding)
3. Consider adding IP allowlisting for OS webhook functions if OS has static IPs
