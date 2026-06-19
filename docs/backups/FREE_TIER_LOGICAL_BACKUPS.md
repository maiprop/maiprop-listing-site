# Free Tier Logical Backups

Supabase Free projects do not provide the same production recovery posture as
paid daily backups or PITR. Until the project is upgraded, run encrypted logical
backups and prove a restore drill on a fixed cadence.

## Backup Command

Set a database connection string and encryption passphrase in the operator shell:

```powershell
$env:SUPABASE_DB_URL = "<postgres-connection-string>"
$env:MAIPROP_BACKUP_PASSPHRASE = "<long-random-passphrase>"
npm run backup:supabase:logical -- --out-dir C:\maiprop-backups
```

For a locally linked project, use:

```powershell
$env:MAIPROP_BACKUP_PASSPHRASE = "<long-random-passphrase>"
npm run backup:supabase:logical -- --linked --out-dir C:\maiprop-backups
```

The script runs `supabase db dump` for schema and data, combines the dumps,
encrypts the result with `MAIPROP_BACKUP_PASSPHRASE`, and writes a manifest next
to the backup file. Store the encrypted off-site backup somewhere separate from
Supabase and GitHub.

## Restore Drill

Run this restore drill at least monthly while the project remains on Supabase
Free:

1. Copy the latest encrypted off-site backup to a local workstation.
2. Decrypt it with the same `MAIPROP_BACKUP_PASSPHRASE`.
3. Restore into a disposable local Postgres database.
4. Verify row counts for `profiles`, `listings`, `projects`, `subscriptions`,
   and `open_house_registrations`.
5. Record the date and outcome in `docs/PRODUCTION_CHECKLIST.md`.
6. Append the drill evidence to `docs/compliance/dora/RESTORE_DRILL_LOG.md`,
   including source backup timestamp, restore target, verified row counts,
   release SHA, and cleanup confirmation.
7. Run `npm run check:dr-restore-proof` and keep the passing output with the
   release or procurement evidence packet.

## RPO And RTO

This fallback is not PITR. The RPO is the time since the last successful logical
backup. If backups run daily, the expected RPO is up to 24 hours. The RTO is the
time to decrypt, restore, verify, and repoint runtime configuration; target less
than 4 hours for this free-tier fallback.

## Acceptance

- Encrypted off-site backup exists for the latest production day.
- Restore drill completed in the last 30 days.
- `npm run check:dr-readiness` passes.
- `npm run check:dr-restore-proof` passes when a successful restore drill is
  required for production promotion, DORA evidence, or enterprise procurement.
- Operators understand that this does not replace Supabase PITR.
