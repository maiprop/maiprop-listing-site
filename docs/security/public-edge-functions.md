# Public Edge Function Register

This register is the required review surface for Supabase Edge Functions with
`verify_jwt = false` in `supabase/config.toml`. Each public function must have a
business reason, an authentication or signature control where applicable, an
abuse control, and an owning area.

| Function | Public reason | Compensating controls | Abuse controls | Owner |
| --- | --- | --- | --- | --- |
| `ai-search` | Public search and discovery entrypoint. | Input validation, quota checks for enriched responses, no service-role data returned. | Rate-limit at Cloudflare/Supabase edge; monitor query volume. | search/ai |
| `property-valuation` | Public listing valuation request surface. | Schema validation, quota/entitlement enforcement, sanitized listing context. | Rate-limit and AI cost monitoring. | ai/valuation |
| `neighbourhood-report` | Public neighbourhood report request surface. | Schema validation, quota/entitlement enforcement, no privileged table writes. | Rate-limit and AI cost monitoring. | ai/market-data |
| `property-pois` | Public nearby-place lookup surface. | Coordinate/address validation and provider-key isolation in Edge Function secrets. | Rate-limit and cache common lookups. | maps/location |
| `smart-filters` | Public natural-language filter parsing. | Schema validation and bounded output contract. | Rate-limit and AI cost monitoring. | search/ai |
| `sync-to-os` | External OS integration callback. | Shared integration secret/header verification in function code. | Source allowlist and failure alerting. | integrations/os |
| `receive-from-os` | External OS inbound data receiver. | Shared integration secret/header verification and schema validation. | Source allowlist and payload size limits. | integrations/os |
| `poll-os-auctions` | Scheduled/public OS auction polling endpoint. | Internal scheduler token and idempotent writes. | Cron-only invocation policy and alerting. | auctions/integrations |
| `sync-firesale-to-os` | Quick Sale sync to OS integration. | Shared integration secret/header verification and schema validation. | Source allowlist and idempotency checks. | quick-sale/integrations |
| `full-sync-from-os` | Controlled full OS import endpoint. | Shared integration secret/header verification and admin-only operational use. | Manual runbook approval and logging. | integrations/os |
| `os-diagnose` | Integration diagnostics endpoint. | Redacted diagnostics; no secrets returned. | Admin/IP-gated operational invocation. | platform/integrations |
| `send-saved-search-alerts` | Scheduled saved-search notification worker. | Scheduler token and idempotent notification writes. | Cron-only invocation policy and alerting. | notifications/search |
| `invitation-notify` | Invitation email/webhook notifier. | Signed internal payload and limited recipient fields. | Idempotency and email abuse monitoring. | notifications/invitations |
| `os-sales-coordinates` | OS sales coordinate enrichment. | Input validation and provider-key isolation in Edge Function secrets. | Rate-limit and cache common lookups. | integrations/os |
| `ai-translate` | Public translation helper for listing content. | Bounded input validation and no service-role data reads. | Rate-limit and AI cost monitoring. | ai/localization |
| `stripe-webhook` | Stripe webhook receiver cannot require Supabase JWT. | Stripe signature verification and event idempotency. | Replay protection and event ledger monitoring. | billing/stripe |
| `oh-registration-notify` | Open-house registration notification callback. | Signed/internal payload validation and no public data mutation beyond notification path. | Idempotency and alerting on failures. | open-house/notifications |
| `auth-email-hook` | Supabase Auth email hook callback. | Supabase hook secret verification. | Minimal response body and error logging. | auth/platform |
| `streetview-proxy` | Public proxy for Street View assets without exposing provider secrets. | URL/coordinate validation and provider-key isolation. | Rate-limit and cache static responses. | maps/location |
| `sitemap` | Public SEO sitemap generation. | Read-only published listing/project access. | Cache and payload size limits. | seo/platform |
| `healthz` | Public health probe for deployment checks. | No sensitive body; returns only service health. | Monitor probe rate and uptime alerts. | platform/ops |
| `csp-report` | Browser CSP violation report receiver. | JSON schema validation and redaction before storage/logging. | Payload size limit and sampling. | security/platform |
| `fetch-os-auctions` | Public-facing auction fetch integration. | Source validation and sanitized published auction output. | Rate-limit and cache imported results. | auctions/integrations |
| `record-listing-view` | Anonymous listing view analytics. | Listing-id validation and aggregate-only writes. | Bot/rate controls and duplicate suppression. | analytics/listings |
| `scheduled-followups` | Scheduled follow-up notification worker. | Scheduler token and idempotent writes. | Cron-only invocation policy and alerting. | crm/notifications |
