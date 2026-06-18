# DORA Tabletop Exercises

| Date | Scenario | Participants | Action items | Status |
|---|---|---|---|---|
| 2026-06-18 | Baseline scenario set created for database corruption, failed deployment, payment webhook failure, and AI provider outage | Platform, Operations, Security, Payments, AI owner | Schedule first live tabletop and record defects in this file | Pending operator execution |

## Required Scenario Set

1. Supabase corruption requiring restore from logical backup or PITR.
2. Cloudflare production deploy health check failure and rollback.
3. Stripe webhook secret rotation failure and event replay.
4. OpenAI outage causing AI valuation/report degradation.
5. Tenant data access anomaly requiring RLS investigation.

Each Tabletop entry must include decisions made, elapsed response time, missing evidence, and named action-item owners.
