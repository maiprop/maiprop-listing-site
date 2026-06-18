# DORA Third-Party Exit Plans

| Provider | Exit trigger | Exit plan | Data export path | Validation |
|---|---|---|---|---|
| Supabase | Sustained outage, unacceptable security risk, contract failure | Restore logical/PITR backup into replacement Postgres-compatible environment and redeploy Edge Functions from git | `supabase db dump`, storage export, committed migrations | Row counts, auth smoke, listings smoke, RLS checks |
| Cloudflare | Deploy/runtime outage or contract issue | Move static build to alternate static host and repoint DNS | `npm run build` output, Pages env inventory | Health check, security headers, route smoke |
| Stripe | Billing processor issue | Pause new billing actions, export customers/subscriptions, configure replacement provider | Stripe dashboard exports and webhook event history | Subscription reconciliation |
| Sentry | Telemetry outage or contract issue | Use Supabase logs, Cloudflare analytics, and UptimeRobot while migrating DSN | Sentry issue/export APIs where available | Synthetic error event and alert receipt |
| OpenAI | Provider outage, cost spike, or model risk | Disable AI calls behind feature flags, route to fallback provider or static fallback messaging | AI usage logs and prompt/schema inventory | Quota tests and user-facing degradation copy |
| Brevo | Email delivery failure | Rotate to alternate transactional email provider and replay queued messages | `email_send_log`, queued email payloads | Test delivery and suppression review |

Exit plans must be reviewed after material architecture or vendor changes.
