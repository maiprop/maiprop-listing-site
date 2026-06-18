# Supabase Unused Index Tracking

Unused index findings are telemetry signals, not drop approvals. A zero `idx_scan`
value can mean an index is unused, newly created, used only by rare workflows, or
protected by a primary-key, unique, exclusion, or foreign-key-support decision.

## Tracking Source

The weekly `Supabase Advisor Report` workflow captures:

- Supabase Security and Performance Advisor output.
- `pg_stat_user_indexes` scan counters for all user schemas.
- Index size, table write volume, table scan counters, and live-row estimates.
- Primary-key, unique, exclusion, and constraint-backed index flags.
- A 90-day GitHub Actions artifact history for trend review.

The production migration workflow and release-safety workflow also attach the
same index snapshot to release evidence.

## Decision Rules

- Never drop indexes from `auth`, `storage`, `realtime`, `pgmq`, `cron`, or
  `supabase_migrations` based only on Advisor output.
- Never drop primary-key, unique, exclusion, or constraint-backed indexes based
  only on Advisor output.
- Keep any index with production scans unless a query-plan review proves a
  better replacement.
- Treat public zero-scan indexes on tables with writes as write-path overhead
  candidates, not automatic drops.
- Require at least 30 days of production artifacts before proposing a drop for a
  non-protected public index.
- Before any `DROP INDEX` migration, compare the candidate against
  `pg_stat_statements`, slow query logs, active filters/search paths, and recent
  release history.

## Review Cadence

Review the weekly artifact after major listing, search, analytics, or admin-flow
changes. If the same non-protected public index remains zero-scan across the
observation window and no query path depends on it, open a small migration PR
that drops only that index and includes before/after query-plan evidence.
