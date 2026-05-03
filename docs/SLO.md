# Service Level Objectives (SLOs)

> Last updated: 2026-04-27

## Availability

| Service | Target | Measurement | Error Budget (30d) |
|---------|--------|-------------|-------------------|
| Production site (`maiprop.co`) | 99.5% | UptimeRobot HTTP check, 5-min interval | 3h 36m downtime |
| Supabase Edge Functions (`/healthz`) | 99.5% | UptimeRobot HTTP check, 5-min interval | 3h 36m downtime |
| Supabase REST API | 99.9% | UptimeRobot HTTP check (managed by Supabase) | 43m downtime |

## Latency

| Endpoint | p50 Target | p95 Target | p99 Target |
|----------|-----------|-----------|-----------|
| Homepage load (FCP) | < 1.5s | < 3s | < 5s |
| Listing search (API) | < 200ms | < 500ms | < 1s |
| AI property valuation | < 3s | < 8s | < 15s |
| AI property chat | < 2s | < 5s | < 10s |
| Stripe checkout redirect | < 1s | < 2s | < 3s |

## Error Rate

| Scope | Target | Measurement |
|-------|--------|-------------|
| Frontend JS errors | < 1% of sessions | Sentry error rate |
| Edge function errors (5xx) | < 0.5% of invocations | Supabase dashboard |
| React Query failed queries | < 2% of queries | Sentry `queryObserver` breadcrumbs |

## Alerting Thresholds

| Metric | Warning | Critical | Channel |
|--------|---------|----------|---------|
| Site down | 2 consecutive failures (10 min) | 3 consecutive failures (15 min) | UptimeRobot → Email |
| Sentry error spike | > 50 events/hour | > 200 events/hour | Sentry alert rule |
| Edge function error rate | > 5% over 15 min | > 20% over 5 min | _TBD — requires Supabase alerting or custom_ |

## Review Cadence

- **Monthly:** Review error budgets, adjust targets if consistently over/under
- **Quarterly:** Review latency targets against Lighthouse CI trends
- **Post-incident:** Update SLOs if incident revealed unrealistic targets
