# DORA Restore Drill Log

| Date | Environment | Restore drill | RPO | RTO | Evidence status | Operator |
|---|---|---|---|---|---|---|
| 2026-06-18 | Documentation baseline | Logical backup and PITR procedures are source-controlled; production restore not executed in this Codex session | Target: <= 24h on free-tier logical backup, <= 5m with PITR | Target: <= 4h free-tier, <= 1h with PITR | Pending operator execution | Platform |

Restore drill evidence must record source backup timestamp, restore target, verified row counts, release SHA, and cleanup confirmation.
