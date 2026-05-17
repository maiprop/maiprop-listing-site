# Observability Strategy

## Current Stack

| Layer | Tool | Status |
|-------|------|--------|
| **Error tracking** | Sentry (`@sentry/react`) | ✅ Active — frontend + edge functions |
| **Uptime monitoring** | UptimeRobot | ✅ 3 monitors (site, healthz, Supabase) |
| **Performance** | Sentry Browser Tracing | ✅ `tracesSampleRate: 0.1` |
| **CSP reporting** | `csp-report` edge function | ✅ Report-Only + enforced |
| **Edge function errors** | Sentry via `SENTRY_DSN` secret | ✅ Forwarded from Deno runtime |

## Verification Contract

Production telemetry is considered verifiable only when all of these pass:

1. Frontend build has `VITE_SENTRY_DSN` set for the deployed Cloudflare Pages
   environment.
2. Supabase Edge Function secrets include `SENTRY_DSN` for function-side error
   forwarding.
3. A local operator can run read-only Sentry issue/event checks with
   `SENTRY_AUTH_TOKEN` set in the shell. This token is an audit credential, not
   an app runtime secret, and must never be committed or exposed to the browser.

If `SENTRY_AUTH_TOKEN` is absent during an audit, record production telemetry as
**unknown**, not healthy. CI can prove that Sentry integration code builds, but
only an authenticated Sentry query proves that live events are flowing.

## Recommended Additions

### OpenTelemetry (H1)

**When to add:** Once traffic exceeds ~1,000 DAU or debugging distributed traces becomes necessary.

**Recommended setup:**
1. Add `@opentelemetry/sdk-trace-web` + `@opentelemetry/exporter-trace-otlp-http`
2. Configure OTLP exporter pointing to Sentry (Sentry supports OTLP ingest)
3. Instrument React Router transitions + Supabase RPC calls

**Why not now:** Sentry Browser Tracing already provides ~80% of what OTEL gives for a client-side SPA. The marginal value is low until we have server-side rendering or a multi-service architecture.

### Custom Metrics (H2)

**Recommended metrics:**
- `auth.signup.duration` — time from form submit to session created
- `listing.search.latency` — time from filter change to results rendered
- `auction.bid.latency` — time from bid submit to confirmation
- `i18n.translation.cache_hit_rate` — cache hits vs API calls
- `edge_function.invocation.duration` — per-function P50/P95/P99

**Implementation path:**
1. Use Sentry's `startSpan()` for transaction-level metrics
2. For custom counters/histograms, use Sentry's `metrics` API (beta) or push to a Prometheus-compatible endpoint

### Alerting

| Alert | Threshold | Channel |
|-------|-----------|---------|
| Error rate spike | >5% of requests in 5 min | Sentry → Slack |
| Healthz down | 2 consecutive failures | UptimeRobot → email + Slack |
| P95 latency | >3s for 10 min | Sentry Performance → Slack |
| CSP violation spike | >50 reports in 1 hour | Edge function → Slack webhook |

## Dashboard

Recommended Sentry dashboard widgets:
1. Error rate by page (last 24h)
2. Web Vitals (LCP, FID, CLS) by route
3. Edge function error rate by function name
4. Transaction duration P50/P95 by route
