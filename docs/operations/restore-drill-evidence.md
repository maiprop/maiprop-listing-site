# Restore Drill Evidence

`npm run check:dr-restore-proof` no longer accepts a successful Markdown log
row as proof by itself. It requires a checksum-verified backup artifact and a
generated restore evidence document.

1. Run the logical backup outside the repository and retain its manifest next
   to the encrypted artifact. The manifest includes `artifact_sha256` and
   `artifact_bytes`.
2. Restore only to a disposable non-production target. Record the completion
   timestamp, target, row counts for `profiles`, `listings`, `projects`,
   `subscriptions`, and `open_house_registrations`, the tested release SHA,
   and cleanup confirmation in an operator-owned JSON result.
3. Restore and verify every hosted layer, not only the application schema:
   - Auth: restored users and identities, a successful login, and a verified
     deprovision/revocation path.
   - Storage: restored bucket definitions and object bytes with an object
     checksum comparison.
   - Configuration: a redacted Auth/Storage configuration snapshot with a
     SHA-256 checksum and explicit post-restore comparisons.
   The JSON fields are `auth_restore`, `storage_restore`, and
   `configuration_restore`; the evidence generator rejects missing layers.
4. Include the SHA-256 of both the backup artifact and the backup manifest in
   that result. Then generate the evidence beside the retained artifact:

   ```powershell
   node scripts/capture-restore-drill-evidence.mjs `
     --backup-manifest C:\maiprop-backups\<backup>.manifest.json `
     --restore-result C:\maiprop-backups\restore-result.json `
     --out C:\maiprop-backups\restore-drill-evidence.json
   ```

5. Verify with the evidence and backup artifact available at their recorded
   paths:

   ```powershell
   node scripts/check-dr-readiness.mjs --require-successful-restore `
     --restore-evidence C:\maiprop-backups\restore-drill-evidence.json
   ```

The generated v2 evidence intentionally contains the artifact path and checksum,
not the backup payload or credentials. Store it with the restricted DR evidence
packet, not in Git.

A schema-only logical restore remains useful recovery evidence but is not a
complete Supabase restore drill. A full drill requires a real non-production
database connection, service-role access for Auth and Storage, and a target that
can be cleaned after verification. Never use production as the restore target,
and never copy production PII into an uncontrolled environment.

## 2026-07-13 hosted-layer synthetic proof

The existing Supabase staging project was used with synthetic records only.
The drill verified the parts that a schema-only replay does not exercise:

- Auth: one synthetic user and identity were backed up, deleted, restored, and
  used for a successful password login. The user was then deprovisioned and a
  second login was rejected.
- Storage: one synthetic PDF was uploaded to the private `open-house-docs`
  bucket, downloaded, deleted, restored, and downloaded again. Both copies had
  SHA-256 `030788c767a573651d281d48d916b2a56e922896fc4892e45de96d8fc808a458`.
- Application data: one synthetic organization was backed up, deleted,
  restored, and then removed during cleanup.
- Configuration: redacted Auth settings and all nine Storage bucket definitions
  produced the same canonical snapshot twice. Snapshot SHA-256 was
  `08a8c9035471552afae2cdc1f2a5f8c7e3891631b9022454453d0afb59d24a7b`.
- Cleanup: the synthetic Auth user, identity, profile, organization, and Storage
  object all had zero remaining rows after the drill.

This is a successful hosted-layer synthetic recovery and deprovisioning proof.
It is deliberately not labelled a complete Supabase-managed project restore:
no encrypted whole-database backup or managed PITR snapshot was restored into a
new project, and no production data was copied.
