# On-Call & Incident Response

> Last updated: 2026-05-17

## Monitoring Stack

| Service | Purpose | Dashboard |
|---------|---------|-----------|
| UptimeRobot | Uptime monitoring (5-min interval) | https://dashboard.uptimerobot.com |
| Sentry | Error tracking + performance | https://maiprop.sentry.io |
| Supabase Dashboard | DB metrics, edge function logs | https://supabase.com/dashboard/project/qvvicunqcrwpioqnvzxf |
| Cloudflare Pages | Deployment status, analytics | Cloudflare Dashboard |

## Monitored Endpoints

| Monitor | URL | Interval | Alert |
|---------|-----|----------|-------|
| Production site | `https://maiprop.co` | 5 min | Email |
| Healthz (edge functions) | `https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/healthz` | 5 min | Email |
| Supabase REST API | `https://qvvicunqcrwpioqnvzxf.supabase.co/rest/v1/` | 5 min | Email |

## Rotation

| Role | Primary | Backup |
|------|---------|--------|
| On-call engineer | `ops-primary@maiprop.co` | `ops-backup@maiprop.co` |
| Escalation contact | `platform-lead@maiprop.co` | `security-oncall@maiprop.co` |

These aliases are monitored distribution groups. PagerDuty/Opsgenie can be
connected later without changing the incident playbooks.

## Severity Levels

| Level | Definition | Response Time | Example |
|-------|-----------|---------------|---------|
| **SEV1** | Complete outage — users cannot access the platform | 15 min | Site down, Supabase unreachable |
| **SEV2** | Major feature broken — revenue-impacting | 1 hour | Payments failing, search broken |
| **SEV3** | Minor feature degraded — workaround exists | 4 hours | AI valuations slow, map tiles stale |
| **SEV4** | Cosmetic or non-user-facing | Next business day | CI flaky, doc typo |

## Incident Playbooks

### Site Down (SEV1)

1. Check UptimeRobot dashboard for which monitor is failing
2. Check Cloudflare status: https://www.cloudflarestatus.com
3. Check Supabase status: https://status.supabase.com
4. If Cloudflare Pages deployment failed → redeploy from Cloudflare dashboard
5. If Supabase is down → wait for resolution; post status update to users

### Stripe Webhook Failure (SEV2)

1. Check Stripe dashboard → Developers → Webhooks → Recent deliveries
2. Look for HTTP 4xx/5xx responses from `stripe-webhook` edge function
3. Check Supabase edge function logs for the `stripe-webhook` function
4. Common causes: expired webhook signing secret, Supabase function cold start timeout
5. Retry failed webhooks from Stripe dashboard

### AI Service Degradation (SEV3)

1. Check OpenAI status: https://status.openai.com
2. Check edge function logs for `ai-search`, `property-valuation`, `property-chat`
3. Circuit breaker should auto-trip after 5 failures — check logs for `[circuit-breaker] OPEN`
4. If OpenAI is down: circuit breaker handles graceful degradation, no action needed
5. If circuit breaker is stuck open: wait for half-open retry (30s default) or redeploy function

### Supabase Outage (SEV2)

1. Check https://status.supabase.com
2. If planned maintenance: no action, wait for completion
3. If unplanned: check Supabase dashboard for affected services (Auth, Storage, Edge Functions, Database)
4. Auth outage: users can't login, existing sessions continue working (JWT cached)
5. DB outage: all queries fail, app shows error toasts — nothing to do except wait

### Email Delivery Failure (SEV3)

1. Check Brevo dashboard for delivery failures
2. Check `email_send_log` table for recent `failed` status entries
3. Check `suppressed_emails` table — recipient may be suppressed due to bounces
4. Common cause: Brevo API key rotation, rate limit hit
5. Retry: process-email-queue runs on pg_cron (5s interval), will auto-retry pending emails

## Post-Incident

1. Create a brief incident report (what happened, timeline, root cause, fix)
2. Add to `docs/incidents/YYYY-MM-DD-title.md`
3. Update this playbook if the incident revealed a gap
