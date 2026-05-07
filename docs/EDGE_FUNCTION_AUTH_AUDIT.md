# Edge Function Auth Audit

> Last updated: 2026-05-07
> Source: `supabase/config.toml`, local function source, and Deno auth tests.

## Release Rule

Every `verify_jwt = false` function must be either intentionally public, protected by custom authentication, or callable only by a trusted platform trigger. If it touches private user data and has neither JWT nor custom auth, it is a release blocker.

## `verify_jwt = false` Functions

| Function | Auth model | Data touched | Release status |
| --- | --- | --- | --- |
| `ai-search` | Public endpoint plus local rate limiter; tests reject missing/wrong `Authorization` where configured in handler. | Listing/search data and AI API. | Conditional: keep rate limit and abuse monitoring. |
| `property-valuation` | Public endpoint plus rate limiter. | User-provided valuation inputs and AI/external data. | Conditional: monitor cost and abuse. |
| `neighbourhood-report` | Public endpoint plus rate limiter. | Public location/report data and AI/external data. | Conditional: monitor cost and abuse. |
| `property-pois` | Public endpoint plus rate limiter. | Public POI/location data. | Conditional: monitor cost and abuse. |
| `smart-filters` | Public endpoint plus rate limiter. | Search/filter helper data. | Conditional: monitor cost and abuse. |
| `ai-translate` | Public endpoint plus rate limiter. | User-provided text for translation. | Conditional: no private payloads. |
| `streetview-proxy` | Public proxy plus rate limiter. | Google Street View requests. | Conditional: cost-control risk remains. |
| `sitemap` | Public read-only endpoint. | Public SEO URLs. | Ready. |
| `healthz` | Public read-only endpoint. | Health status only. | Ready. |
| `csp-report` | Public write-only browser report receiver. | CSP violation reports. | Conditional: log-flood risk. |
| `record-listing-view` | Public endpoint with body validation, CORS allowlist, and rate limiting; uses service role for the service-role-only atomic RPC. | Listing view counters/events. | Ready: no private data returned. |
| `owner-pro-status` | Public endpoint with listing UUID validation, CORS allowlist, and rate limiting; resolves the listing owner server-side before checking subscription status. | Boolean owner Pro status only. | Conditional: public boolean is intentional for listing contact/calendar UI. |
| `stripe-webhook` | Stripe signature verification with webhook signing secret. | Stripe events and billing state. | Ready if signature tests stay green. |
| `auth-email-hook` | Supabase Auth hook secret via `SEND_EMAIL_HOOK_SECRET`. | Auth email payloads. | Ready if secret is configured in prod. |
| `sync-to-os` | Custom Bearer/user authorization in handler; not Supabase JWT-gated by platform config. | Listing sync data. | Conditional: keep tests for missing/invalid auth. |
| `receive-from-os` | External API key header (`X-OS-API-KEY`). | Incoming OS webhook data. | Conditional: rotate key and consider IP allowlist. |
| `poll-os-auctions` | Scheduled/internal caller model plus rate limiter. | Auction sync data. | Conditional: do not expose as browser feature. |
| `sync-firesale-to-os` | Custom Bearer/user authorization in handler. | Firesale sync data. | Conditional: keep tests for missing/invalid auth. |
| `full-sync-from-os` | Custom `requireAgent` Bearer/user authorization in handler; tests reject missing auth. | Bulk OS sync data. | Conditional: high blast radius. |
| `os-diagnose` | Internal diagnostic endpoint; not JWT-gated by config. | OS connectivity/config status. | Needs review: diagnostic output must not expose secrets. |
| `os-sales-coordinates` | Custom auth/rate limit expected by handler. | Sales coordinates. | Needs review before release due location sensitivity. |
| `send-saved-search-alerts` | Scheduled/internal caller model. | Saved search and email data. | Conditional: must not be browser-callable without custom secret. |
| `invitation-notify` | Handler checks `Authorization`; tests reject missing auth. | Invitation notification data. | Conditional: document trigger secret/caller. |
| `oh-registration-notify` | Handler checks `Authorization`; database trigger/webhook model. | Open-house registration data. | Conditional: document trigger secret/caller. |

## `verify_jwt = true` Functions

These functions are platform JWT-gated in `supabase/config.toml`: `property-chat`, `pro-ai-tools`, `ai-service-match`, `fetch-report-from-os`, `listing-ai-assist`, `create-checkout`, `check-subscription`, `customer-portal`, `create-stripe-price`, `process-email-queue`, `sync-stripe-pricing`, `get-invoices`, `delete-account`, `fetch-past-deals-from-os`, `log-role-switch`, `agent-data-input`, `apply-data-input-credit`, `flag-auction-on-os`, `fetch-auction-enrichment`, `transfer-platform-admin`, and `complete-onboarding-role`.

## Blocking Follow-Ups

1. Add or keep Deno tests for every `verify_jwt = false` function that writes, syncs, emails, diagnoses, or reads private data.
2. Move scheduled/internal functions to a shared custom secret helper where they are not protected by Supabase JWT.
3. Review `os-diagnose` and `os-sales-coordinates` output for secret, location, or private-data leakage.
4. Keep public AI/proxy endpoints rate limited and cost monitored.
