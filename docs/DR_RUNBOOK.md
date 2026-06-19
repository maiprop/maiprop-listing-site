# Disaster Recovery Runbook

This runbook documents backup, recovery, and failover procedures for the maiProp platform.

## Infrastructure overview

| Component | Provider | Recovery mechanism |
|-----------|----------|-------------------|
| Database | Supabase (Postgres) | PITR (point-in-time recovery) on Pro plan |
| Edge functions | Supabase | Redeployable from git (`supabase functions deploy`) |
| Frontend | Cloudflare Pages | Redeployable from git; instant rollback via dashboard |
| Auth | Supabase Auth | Backed by same Postgres PITR |
| Storage | Supabase Storage | Backed by same Postgres metadata + S3 object storage |
| Payments | Stripe | External; Stripe is source of truth for subscriptions |
| Email | Brevo | External; transactional only, no state to recover |

## 0. Free-tier logical backup fallback

The live project may run on Supabase Free during early production hardening.
Supabase Free is not equivalent to paid daily backups or PITR, so use this
fallback until the project is upgraded.

### Backup procedure

1. Set an operator-only Postgres connection string and encryption passphrase:
   ```powershell
   $env:SUPABASE_DB_URL = "<postgres-connection-string>"
   $env:MAIPROP_BACKUP_PASSPHRASE = "<long-random-passphrase>"
   ```
2. Run the logical backup:
   ```powershell
   npm run backup:supabase:logical -- --out-dir C:\maiprop-backups
   ```
   The backup script wraps `supabase db dump` for schema and data exports.
3. Move the encrypted off-site backup outside Supabase and outside the GitHub
   repository.
4. Keep the manifest next to the encrypted file.

### Restore drill

Run a restore drill at least monthly while using this fallback:

1. Decrypt the latest backup with `MAIPROP_BACKUP_PASSPHRASE`.
2. Restore it into a disposable local Postgres database.
3. Verify critical row counts: `profiles`, `listings`, `projects`,
   `subscriptions`, and `open_house_registrations`.
4. Record date, operator, and result in `docs/PRODUCTION_CHECKLIST.md`.
5. Append the evidence row to `docs/compliance/dora/RESTORE_DRILL_LOG.md` with
   source backup timestamp, restore target, verified row counts, release SHA,
   and cleanup confirmation.
6. Run `npm run check:dr-restore-proof` when the drill is required for
   production promotion, DORA evidence, or enterprise procurement.

### RPO and RTO

This is a logical backup mitigation, not PITR. The RPO is the age of the latest
successful backup. For daily backups, assume up to 24 hours of data loss. The
RTO target for this fallback is less than 4 hours from incident declaration to a
verified restored database and repointed runtime configuration.

Detailed runbook: `docs/backups/FREE_TIER_LOGICAL_BACKUPS.md`.

## 1. Database recovery (Supabase PITR)

### When to use

- Accidental data deletion or corruption
- Failed migration that damaged data
- Security breach requiring rollback to known-good state

### Procedure

1. **Identify the target timestamp** — check Supabase logs, Sentry, or `admin_audit_log` to determine the last-known-good point.
2. **Open Supabase Dashboard** → Project → Settings → Database → Point in Time Recovery.
3. **Select recovery point** — choose a timestamp before the incident.
4. **Initiate recovery** — Supabase creates a new project with the restored database.
5. **Verify the restored data** — connect to the new project and run sanity checks:
   ```bash
   # Check row counts on critical tables
   psql "$NEW_DB_URL" -c "SELECT 'listings' AS tbl, count(*) FROM listings
     UNION ALL SELECT 'profiles', count(*) FROM profiles
     UNION ALL SELECT 'subscriptions', count(*) FROM subscriptions;"
   ```
6. **Swap DNS / environment** — update `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in Cloudflare Pages to point to the restored project.
7. **Redeploy edge functions** against the new project ref:
   ```bash
   supabase functions deploy --project-ref <new-ref>
   ```
8. **Update Stripe webhook endpoint** to point to the new Supabase project URL.
9. **Verify end-to-end** — sign in, view listings, attempt a checkout.
10. **Record the incident** in `docs/incidents/YYYY-MM-DD-<slug>.md`.

### Recovery time objective (RTO)

Target: **< 1 hour** from decision to restore to full service restoration.

### Recovery point objective (RPO)

Supabase PITR on Pro plan: **up to the last WAL segment** (typically < 5 minutes of data loss).

## 2. Frontend rollback (Cloudflare Pages)

### When to use

- Broken production deploy (white screen, JS errors, CSP violations)

### Procedure

1. Open **Cloudflare Pages dashboard** → Deployments.
2. Find the last green production deployment.
3. Click **Rollback to this deploy** — takes effect within seconds.
4. Investigate and fix the issue on a branch before re-deploying.

### RTO

**< 2 minutes** (Cloudflare edge propagation).

## 3. Edge function rollback

### When to use

- Broken edge function causing 500 errors or payment failures

### Procedure

1. **Identify the broken function** via Supabase logs or Sentry.
2. **Revert to the last known-good commit**:
   ```bash
   git log --oneline supabase/functions/<function-name>/
   git checkout <good-commit> -- supabase/functions/<function-name>/
   ```
3. **Redeploy the single function**:
   ```bash
   supabase functions deploy <function-name> --project-ref qvvicunqcrwpioqnvzxf
   ```
4. **Verify** with a smoke request to the function endpoint.

### RTO

**< 5 minutes** per function.

## 4. Stripe webhook recovery

### When to use

- Webhook endpoint returns non-200 for > 1 hour
- Subscriptions not syncing to database

### Procedure

1. Check **Stripe Dashboard** → Developers → Webhooks → find the endpoint.
2. Review failed deliveries — Stripe retries for up to 3 days.
3. If the endpoint URL changed (e.g., after DB recovery to a new project):
   - Create a new webhook endpoint pointing to the new URL.
   - Copy the new `STRIPE_WEBHOOK_SECRET` to Supabase edge function secrets.
   - Redeploy `stripe-webhook`.
4. **Replay missed events** — in Stripe Dashboard, select failed events and click "Resend".
5. **Reconcile subscriptions** — run `sync-stripe-pricing` to ensure DB matches Stripe state.

## 5. Communication template

Use this template for incident communication:

```
Subject: [maiProp] Service disruption — <component>

Status: Investigating / Identified / Resolved
Impact: <describe user-facing impact>
Start time: <UTC timestamp>
Current status: <what's happening now>
Next update: <when>

Timeline:
- HH:MM UTC — <event>
- HH:MM UTC — <action taken>
```

## 6. Post-incident

After every incident:

1. Create `docs/incidents/YYYY-MM-DD-<slug>.md` with a blameless timeline.
2. Identify contributing factors and action items.
3. Update this runbook if any procedure was unclear or incorrect.
4. Update the restore-test log in `PRODUCTION_CHECKLIST.md`.

## 7. Quarterly restore test

Schedule a quarterly test to verify PITR works:

1. Initiate a PITR restore to a throwaway project.
2. Verify data integrity (row counts, recent records present).
3. Record the result in `PRODUCTION_CHECKLIST.md` -> "Last restore test" table.
4. Record the detailed evidence in `docs/compliance/dora/RESTORE_DRILL_LOG.md`.
5. Run `npm run check:dr-restore-proof`.
6. Delete the throwaway project.
