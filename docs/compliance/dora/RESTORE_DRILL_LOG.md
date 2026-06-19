# DORA Restore Drill Log

Current status: no successful restore drill has been recorded in this repository
as of 2026-06-19. The runbooks and local readiness gate are in place, but ECAS,
DORA, procurement, and production-readiness reviews should treat restore proof
as pending until an operator executes the drill and records a successful row
below.

| Date | Environment | Restore drill | RPO | RTO | Evidence status | Operator |
|---|---|---|---|---|---|---|
| 2026-06-18 | Documentation baseline | Logical backup and PITR procedures are source-controlled; production restore not executed in this Codex session. Required evidence fields: source backup timestamp, restore target, verified row counts, release SHA, and cleanup confirmation. | Target: <= 24h on free-tier logical backup, <= 5m with PITR | Target: <= 4h free-tier, <= 1h with PITR | Pending operator execution | Platform |

Restore drill evidence must record source backup timestamp, restore target, verified row counts, release SHA, and cleanup confirmation.

## Evidence Template

When the drill is executed, append a dated row to the table using this minimum
evidence:

- source backup timestamp: UTC timestamp of the backup or PITR target used;
- restore target: disposable local database, staging project, or throwaway
  Supabase restore project;
- verified row counts: at minimum `profiles`, `listings`, `projects`,
  `subscriptions`, and `open_house_registrations`;
- release SHA: the application commit used for post-restore smoke tests;
- cleanup confirmation: target database/project deleted or isolated after the
  drill.

`Evidence status` must be one of:

- `Successful`
- `Failed`
- `Pending operator execution`

Use `npm run check:dr-readiness` for runbook/document evidence and
`npm run check:dr-restore-proof` when procurement, DORA, or production promotion
requires a successful restore row.
