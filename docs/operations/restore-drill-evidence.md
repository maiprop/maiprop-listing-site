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
3. Include the SHA-256 of both the backup artifact and the backup manifest in
   that result. Then generate the evidence beside the retained artifact:

   ```powershell
   node scripts/capture-restore-drill-evidence.mjs `
     --backup-manifest C:\maiprop-backups\<backup>.manifest.json `
     --restore-result C:\maiprop-backups\restore-result.json `
     --out C:\maiprop-backups\restore-drill-evidence.json
   ```

4. Verify with the evidence and backup artifact available at their recorded
   paths:

   ```powershell
   node scripts/check-dr-readiness.mjs --require-successful-restore `
     --restore-evidence C:\maiprop-backups\restore-drill-evidence.json
   ```

The generated evidence intentionally contains the artifact path and checksum,
not the backup payload or credentials. Store it with the restricted DR evidence
packet, not in Git.
