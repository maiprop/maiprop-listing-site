# Edge Function Auth Audit

> Last updated: 2026-05-16
> Source: `supabase/config.toml`, local function source, Deno auth tests, and `npm run check:public-functions`.

The machine-readable inventory lives at
[`docs/public-edge-function-inventory.json`](./public-edge-function-inventory.json).
Regenerate it with `npm run inventory:public-functions`; enforce it with
`npm run check:public-functions`.

## Release Rule

Every `verify_jwt = false` function must be classified and must have a
mechanism appropriate to its blast radius:

- costly AI/proxy work: signed-in quota or rate limiting before provider work;
- webhooks: Stripe/standard-webhook/HMAC verification before parsing or mutation;
- cron/internal jobs: shared secret or explicit authenticated admin/operator path;
- public read/report endpoints: bounded input, allowlisted output, and no private response.

If a public function touches private user data or mutates state and has neither
JWT nor custom auth, it is a release blocker.

As of this audit there are 22 configured `verify_jwt = false` functions, all
classified by the inventory gate and all backed by local Deno tests.

## `verify_jwt = false` Functions

The current public-function set is grouped below. Per-function caller, status,
required snippets, and tests are enforced by the JSON inventory.

| Class | Functions | Required control |
| --- | --- | --- |
| Costly AI | `ai-search`, `smart-filters`, `ai-translate` | Signed-in quota/auth and bounded payload before provider work. |
| Webhooks | `stripe-webhook`, `receive-from-os`, `auth-email-hook` | Stripe signature, HMAC, or standard-webhook verification before mutation. |
| Cron/email/internal | `send-saved-search-alerts`, `scheduled-followups`, `oh-registration-notify`, `invitation-notify` | Cron/shared secret or admin bearer path. |
| OS sync/diagnostic | `sync-to-os`, `sync-firesale-to-os`, `poll-os-auctions`, `full-sync-from-os`, `fetch-os-auctions`, `os-diagnose`, `os-sales-coordinates` | Handler auth, role/plan checks, rate limits, and sanitized output. |
| Public read/report/analytics | `sitemap`, `healthz`, `csp-report`, `streetview-proxy`, `record-listing-view` | Bounded input, public-only output, rate limiting where appropriate, and no private response bodies. |

## `verify_jwt = true` Functions

These functions are platform JWT-gated in `supabase/config.toml`: `property-valuation`, `neighbourhood-report`, `property-pois`, `property-chat`, `pro-ai-tools`, `ai-service-match`, `fetch-report-from-os`, `listing-ai-assist`, `create-checkout`, `check-subscription`, `customer-portal`, `create-stripe-price`, `process-email-queue`, `sync-stripe-pricing`, `get-invoices`, `delete-account`, `fetch-past-deals-from-os`, `log-role-switch`, `agent-data-input`, `apply-data-input-credit`, `flag-auction-on-os`, `fetch-auction-enrichment`, `transfer-platform-admin`, `admin-review-invitation`, `complete-onboarding-role`, `owner-pro-status`, and `followup-lead`. `owner-pro-status` is JWT-gated because it resolves subscription-derived owner status with a service-role client; anonymous listing detail pages must degrade to no Pro badge rather than exposing arbitrary account status. Transfer/onboarding/admin-review functions verify the caller JWT in the Edge Function and then call service-role-only RPCs that take the verified caller id explicitly.

## Blocking Follow-Ups

1. Keep `npm run check:public-functions` required in CI so new public functions cannot ship unclassified.
2. Move scheduled/internal functions to a shared custom secret helper where they are not protected by Supabase JWT.
3. Review `os-diagnose` and `os-sales-coordinates` output for secret, location, or private-data leakage after any OS payload change.
4. Keep public AI/proxy endpoints rate limited and cost monitored.
