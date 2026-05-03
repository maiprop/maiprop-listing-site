# WAF & DDoS Protection

> Last updated: 2026-04-27

## Current Stack

| Layer | Provider | Configuration |
|-------|----------|---------------|
| CDN / Edge | Cloudflare Pages | Automatic DDoS mitigation (included) |
| API | Supabase (Cloudflare-fronted) | Supabase's built-in rate limiting + our edge function rate limiters |
| Application | Edge function rate limiters | Per-IP sliding window (see `_shared/rateLimit.ts`) |

## Cloudflare Pages Protection

Cloudflare Pages includes automatic DDoS protection at no additional cost:
- Layer 3/4 DDoS mitigation (volumetric attacks)
- Layer 7 basic bot management
- SSL/TLS termination with automatic certificate management
- HTTP/2 and HTTP/3 support

**Not included** (requires Cloudflare Pro/Business/Enterprise):
- WAF managed rulesets (OWASP Core Rule Set)
- Bot management (advanced)
- Rate limiting rules (at CDN edge)
- Custom firewall rules

## Supabase Protection

Supabase projects are fronted by Cloudflare and include:
- Automatic DDoS mitigation
- Connection pooling via PgBouncer (protects DB from connection exhaustion)
- Built-in rate limiting on Auth endpoints (configurable in dashboard)

## Application-Level Rate Limiting

Edge functions use a shared rate limiter (`_shared/rateLimit.ts`):
- **Public AI endpoints** (`ai-search`, `property-valuation`, etc.): rate limited per IP
- **Webhook endpoints** (`stripe-webhook`, `receive-from-os`): signature-verified, no rate limit needed
- **Internal endpoints** (`process-email-queue`, `poll-os-auctions`): pg_cron only, not externally accessible

## Recommendations

1. **Cloudflare Pro upgrade** — if traffic grows, WAF managed rules would add OWASP protection
2. **Supabase Auth rate limits** — verify current settings in Supabase Dashboard → Auth → Rate Limits
3. **Geo-blocking** — consider blocking traffic from regions where maiprop doesn't operate (if needed)
4. **API key rotation** — documented in `docs/SECRETS_ROTATION.md`
