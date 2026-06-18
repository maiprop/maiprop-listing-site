# DORA ICT Risk Register

| ICT risk | Risk owner | Impact | Control | Review cadence |
|---|---|---|---|---|
| Supabase database outage | Platform | Listings, auth, payments, and user workflows unavailable | `docs/DR_RUNBOOK.md`, logical backup fallback, Supabase status monitoring | Monthly |
| Cloudflare Pages deploy failure | Platform | Portal unavailable or stale | Production health check and rollback in `.github/workflows/reusable-cloudflare-production-deploy.yml` | Each release |
| Stripe webhook failure | Payments | Subscription state drift and failed upgrades | `docs/WEBHOOK_VERIFICATION.md`, Stripe replay procedure in `docs/DR_RUNBOOK.md` | Monthly |
| Sentry telemetry outage | Operations | Reduced incident visibility | `docs/OBSERVABILITY.md`, UptimeRobot fallback | Monthly |
| OpenAI provider degradation | AI owner | Slow or unavailable AI reports and valuations | AI quota/circuit breaker tests, graceful degradation messaging | Monthly |
| GitHub Actions outage | Platform | Deploy and migration gates blocked | Manual rollback path and provider-status check in incident playbook | Quarterly |

Risk owner review must update likelihood, impact, control status, and any action item owner.
