# Edge Function Auth Rationale

Last verified: 2026-05-17

Sources: `supabase/config.toml`, `scripts/public-function-inventory.cjs`, local
Edge Function tests, and `npm run check:public-functions`.

`npm run check:public-functions` currently reports 25 functions configured with
`verify_jwt = false`, with no unclassified functions, missing source files,
missing required protection snippets, or missing required tests.

## Release Rule

`verify_jwt = false` is acceptable only when the function has a caller model
that cannot rely on Supabase platform JWT verification, or when the handler
must support public browser/CORS invocation and applies equivalent controls in
the function itself.

Every public function must keep at least one appropriate in-handler control:

- signed-in quota, bearer-user auth, role checks, or admin checks before private
  reads, private mutations, or paid provider work;
- Stripe, standard-webhook, HMAC, cron, or shared-secret verification before
  webhook or scheduled mutations;
- bounded input, rate limiting, allowlisted output, and no private response body
  for public read/report/proxy endpoints.

If a public function touches private data, mutates state, or invokes a paid
provider without one of those controls, treat it as a release blocker.

## Public Function Rationale

### Costly AI and Provider Endpoints

| Function | Why public invocation is acceptable | Required in-handler controls |
| --- | --- | --- |
| `ai-search` | Browser calls need CORS-compatible invocation, but AI work is user scoped. | `enforceAiQuota(req)`, `recordAiCall`, and fail-closed quota checks before provider work. |
| `ai-translate` | Browser translation requests are public at the platform layer for compatibility. | `requireAuthenticatedUser(req)`, request rate limiting, and `MAX_TRANSLATION_KEYS` payload bounds. |
| `smart-filters` | Same browser/AI pattern as search; platform JWT is replaced by handler quota enforcement. | `enforceAiQuota(req)`, `recordAiCall`, and fail-closed quota checks before provider work. |
| `neighbourhood-report` | Signed-in users request generated area reports through the browser. | `enforceAiQuota(req)`, `recordAiCall`, fail-closed rate/quota handling, and bounded request payloads. |
| `property-pois` | Browser calls request POI enrichment without relying on Supabase platform JWT. | `enforceAiQuota(req)`, `recordAiCall`, fail-closed rate/quota handling, and bounded request payloads. |
| `property-valuation` | Signed-in users request generated valuations through a browser-compatible endpoint. | `enforceAiQuota(req)`, `recordAiCall`, fail-closed rate/quota handling, and bounded request payloads. |

### Webhooks and External Callers

| Function | Why public invocation is acceptable | Required in-handler controls |
| --- | --- | --- |
| `auth-email-hook` | Supabase Auth hooks and preview flows cannot present a normal app-user JWT. | Standard Webhooks verification, `SEND_EMAIL_HOOK_SECRET`, and secret-protected preview behavior. |
| `oh-registration-notify` | Database-triggered notification path uses a webhook contract rather than user JWT. | `WEBHOOK_SECRET`, `verifyWebhookSecret`, and required authorization header checks before sending email. |
| `receive-from-os` | External OS webhook sender cannot use Supabase JWT. | `verifyHmacSignature`, `x-os-signature`, and `MAIPROP_OS_WEBHOOK_SECRET` before mutation. |
| `stripe-webhook` | Stripe sends signed webhook events without Supabase JWT. | `stripe-signature`, `STRIPE_WEBHOOK_SECRET`, and `constructEventAsync` before event handling. |

### Cron, Admin, and Internal Mutations

| Function | Why public invocation is acceptable | Required in-handler controls |
| --- | --- | --- |
| `invitation-notify` | Admin/operator notification sends are custom-authorized in the handler. | Rate limiting, `auth.getUser`, and `is_platform_admin` authorization. |
| `scheduled-followups` | Scheduled job is invoked by cron infrastructure, not an end-user session. | `CRON_SECRET` and `x-cron-secret`; browser callers must be rejected. |
| `send-saved-search-alerts` | Cron-only email job cannot use an interactive user JWT. | `CRON_SECRET`, `verifyCronSecret`, and authorization header checks before sending. |

### OS Sync, Diagnostics, and Read Proxies

| Function | Why public invocation is acceptable | Required in-handler controls |
| --- | --- | --- |
| `fetch-os-auctions` | Browser path proxies private OS data only for eligible signed-in users. | Fail-closed rate limiting, `auth.getUser`, and role/plan authorization such as `force_pro_access`. |
| `full-sync-from-os` | Bulk sync is custom-authorized for operators or cron. | Rate limiting, required authorization header, and `auth.getUser`; review logs after deploys. |
| `os-diagnose` | Operator diagnostic endpoint relies on handler auth so output can be sanitized centrally. | Rate limiting, `auth.getUser`, platform-admin authorization, and sanitized output only. |
| `os-sales-coordinates` | Public map/read endpoint intentionally exposes only bounded coordinate data. | Rate limiting, `radius` and `limit` bounds, and allowlisted response fields. |
| `poll-os-auctions` | Polling path is custom-authorized for operators or cron. | Rate limiting, required authorization header, and `auth.getUser`. |
| `sync-firesale-to-os` | Quick Sale sync is custom-authorized for admin/operator users. | Required authorization header, `auth.getUser`, and role authorization. |
| `sync-to-os` | High-impact sync path is custom-authorized for admin/operator users. | Required authorization header, `auth.getUser`, role authorization, and Deno tests for invalid auth. |

### Public Read, Reporting, Analytics, and Proxies

| Function | Why public invocation is acceptable | Required in-handler controls |
| --- | --- | --- |
| `csp-report` | Browser reporting API must be able to post violation reports anonymously. | Rate limiting, `MAX_REPORT_BYTES`, no private response body, and `tooManyRequestsResponse`. |
| `healthz` | Public monitors need coarse health status without user login. | Coarse public response only; detailed output requires `HEALTHZ_MONITOR_SECRET` or admin authorization. |
| `record-listing-view` | Anonymous view counts are expected public analytics events. | Rate limiting, body validation, and the `record_listing_view` RPC visibility guard for active/public listings. |
| `sitemap` | Crawlers need unauthenticated SEO XML. | Read-only public output; no private payloads or mutations. |
| `streetview-proxy` | Browser map views need a public proxy to avoid exposing provider secrets. | Rate limiting plus bounded `lat` and `lng` query validation before upstream calls. |

## Operational Checks

- Run `npm run check:public-functions` before release and after any
  `supabase/config.toml` auth change.
- Regenerate `docs/public-edge-function-inventory.json` with
  `npm run inventory:public-functions` whenever the public function set changes.
  The committed JSON inventory is a generated artifact; the live check above is
  the source of truth for this review.
- Keep local Deno tests for every public private-data, mutation, AI, webhook,
  cron, proxy, or analytics endpoint.
- Re-review this document whenever a required snippet is renamed, because the
  inventory gate intentionally keys on concrete handler controls.
