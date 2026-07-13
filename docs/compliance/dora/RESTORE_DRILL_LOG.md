# DORA Restore Drill Log

Current status: a successful non-production app-schema restore drill was
recorded on 2026-06-27. This proves logical backup replay for the core
application schema and business-critical public tables. It does not replace a
Supabase-managed PITR restore drill for auth/storage internals on a paid restore
target.

| Date | Environment | Restore drill | RPO | RTO | Evidence status | Operator |
|---|---|---|---|---|---|---|
| 2026-06-18 | Documentation baseline | Logical backup and PITR procedures are source-controlled; production restore not executed in this Codex session. Required evidence fields: source backup timestamp, restore target, verified row counts, release SHA, and cleanup confirmation. | Target: <= 24h on free-tier logical backup, <= 5m with PITR | Target: <= 4h free-tier, <= 1h with PITR | Pending operator execution | Platform |
| 2026-06-27 | Disposable local Postgres app-schema restore | Created a linked Supabase logical backup and replayed a scoped `public` data plus `public,private` schema restore into disposable local Postgres. Source backup timestamp 2026-06-27T17:47:44.293Z; restore target local-postgres-127.0.0.1:56895; verified row counts for profiles=101, listings=15726, projects=8, subscriptions/investor_subscriptions=10, open_house_registrations=3; release SHA 58937eaf; cleanup confirmation complete: local Postgres stopped and plaintext dump/restore temp directories removed. | Actual: same-day logical backup fallback | Actual: local replay completed in under 1 minute after backup/dump creation | Successful | Codex |
| 2026-07-13 | Existing Supabase staging project, synthetic records only | Restored and verified a synthetic Auth user and identity, successful login, deprovisioned-login rejection, one private Storage object with matching SHA-256, one organization row, and a stable redacted Auth/Storage configuration snapshot. Cleanup confirmation complete: synthetic Auth, identity, profile, organization, and Storage object counts all returned zero. This complements the 2026-06-27 database replay but is not a managed whole-project PITR restore. | Synthetic hosted-layer proof; no production RPO claim | Synthetic hosted-layer proof completed in-session; no production RTO claim | Successful hosted-layer synthetic proof | Codex |

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
- `Successful hosted-layer synthetic proof`
- `Failed`
- `Pending operator execution`

Use `npm run check:dr-readiness` for runbook/document evidence and
`npm run check:dr-restore-proof` when procurement, DORA, or production promotion
requires a successful restore row.
