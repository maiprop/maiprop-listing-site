import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkDisasterRecoveryReadiness,
  checkChecksumVerifiedRestoreEvidence,
  checkFreeTierBackupRunbook,
  checkProductionChecklistRecoveryEvidence,
  checkRestoreDrillLog,
  hasSuccessfulRestoreDrill,
} from "./check-dr-readiness.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-dr-readiness-"));
  mkdirSync(join(root, "docs", "backups"), { recursive: true });
  mkdirSync(join(root, "docs", "compliance", "dora"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });

  writeFileSync(
    join(root, "docs", "DR_RUNBOOK.md"),
    [
      "# Disaster Recovery Runbook",
      "## Free-tier logical backup fallback",
      "supabase db dump",
      "MAIPROP_BACKUP_PASSPHRASE",
      "encrypted off-site backup",
      "restore drill",
      "RPO",
      "RTO",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "PRODUCTION_CHECKLIST.md"),
    [
      "# Production Deployment Checklist",
      "Supabase Free",
      "logical backup",
      "encrypted off-site backup",
      "restore drill",
      "Last restore test",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "compliance", "dora", "RESTORE_DRILL_LOG.md"),
    [
      "# DORA Restore Drill Log",
      "| Date | Environment | Restore drill | RPO | RTO | Evidence status | Operator |",
      "|---|---|---|---|---|---|---|",
      "| 2026-06-18 | Documentation baseline | Restore drill pending; source backup timestamp, restore target, verified row counts, release SHA, and cleanup confirmation are required. | Target: <= 24h | Target: <= 4h | Pending operator execution | Platform |",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "backups", "FREE_TIER_LOGICAL_BACKUPS.md"),
    [
      "# Free Tier Logical Backups",
      "supabase db dump",
      "MAIPROP_BACKUP_PASSPHRASE",
      "encrypted off-site backup",
      "restore drill",
      "RPO",
      "RTO",
    ].join("\n"),
  );
  writeFileSync(join(root, "scripts", "supabase-logical-backup.mjs"), "process.exit(0);\n");

  return root;
};

describe("disaster recovery readiness check", () => {
  it("accepts free-tier backup docs, script, and restore evidence markers", () => {
    const result = checkDisasterRecoveryReadiness(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when the free-tier logical backup runbook is missing encryption evidence", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "backups", "FREE_TIER_LOGICAL_BACKUPS.md"),
      ["# Free Tier Logical Backups", "supabase db dump"].join("\n"),
    );

    const result = checkFreeTierBackupRunbook(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("MAIPROP_BACKUP_PASSPHRASE");
  });

  it("fails when the production checklist only mentions paid PITR", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "PRODUCTION_CHECKLIST.md"),
      ["# Production Deployment Checklist", "Supabase PITR enabled"].join("\n"),
    );

    const result = checkProductionChecklistRecoveryEvidence(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("Supabase Free");
  });

  it("requires the DORA restore drill log evidence schema", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "compliance", "dora", "RESTORE_DRILL_LOG.md"),
      ["# DORA Restore Drill Log", "Restore drill", "RPO", "RTO"].join("\n"),
    );

    const result = checkRestoreDrillLog(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("source backup timestamp");
    expect(result.failures.join("\n")).toContain("cleanup confirmation");
  });

  it("can enforce successful restore proof for procurement gates", () => {
    const root = makeFixture();

    expect(hasSuccessfulRestoreDrill(root)).toBe(false);
    expect(checkDisasterRecoveryReadiness(root, { requireSuccessfulRestore: true }).ok).toBe(false);

    writeFileSync(
      join(root, "docs", "compliance", "dora", "RESTORE_DRILL_LOG.md"),
      [
        "# DORA Restore Drill Log",
        "| Date | Environment | Restore drill | RPO | RTO | Evidence status | Operator |",
        "|---|---|---|---|---|---|---|",
        "| 2026-06-19 | Disposable staging restore | Restored backup; source backup timestamp 2026-06-19T00:00:00Z; restore target local; verified row counts for profiles, listings, projects, subscriptions, open_house_registrations; release SHA abc123; cleanup confirmation complete. | Actual: 1h | Actual: 45m | Successful | Platform |",
      ].join("\n"),
    );

    expect(hasSuccessfulRestoreDrill(root)).toBe(true);
    const result = checkDisasterRecoveryReadiness(root, { requireSuccessfulRestore: true });

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("checksum-verified restore evidence");
  });

  it("accepts restore proof only when the referenced backup artifact checksum matches", () => {
    const root = makeFixture();
    const backupDir = join(root, "backup");
    const evidenceDir = join(root, "artifacts", "compliance", "dora");
    mkdirSync(backupDir, { recursive: true });
    mkdirSync(evidenceDir, { recursive: true });
    const artifactPath = join(backupDir, "drill.sql.enc");
    const artifact = "checksum-backed backup";
    const checksum = createHash("sha256").update(artifact).digest("hex");
    writeFileSync(artifactPath, artifact);
    writeFileSync(
      join(evidenceDir, "restore-drill-evidence.json"),
      `${JSON.stringify({
        schemaVersion: "maiprop.restore-drill-evidence.v2",
        status: "verified",
        backup: { artifactPath, artifactSha256: checksum, artifactBytes: Buffer.byteLength(artifact) },
        restore: {
          completedAt: "2026-07-11T12:00:00.000Z",
          target: "disposable-local-postgres",
          rowCounts: { profiles: 1, listings: 2, projects: 3, subscriptions: 4, open_house_registrations: 5 },
          releaseSha: "66326673d2eea057f16584795655572974f97f99",
          cleanupConfirmed: true,
          auth: {
            usersRestored: 1,
            identitiesRestored: 1,
            loginVerified: true,
            deprovisionVerified: true,
          },
          storage: {
            bucketsRestored: 1,
            objectsRestored: 1,
            objectChecksumVerified: true,
          },
          configuration: {
            snapshotSha256: checksum,
            authConfigVerified: true,
            storageConfigVerified: true,
          },
        },
      })}\n`,
    );

    expect(checkChecksumVerifiedRestoreEvidence(root).ok).toBe(true);

    writeFileSync(artifactPath, "modified backup");
    expect(checkChecksumVerifiedRestoreEvidence(root).failures.join("\n")).toContain("checksum does not match");
  });

  it("rejects database-only evidence that omits Auth, Storage, or configuration restore proof", () => {
    const root = makeFixture();
    const backupDir = join(root, "backup");
    const evidenceDir = join(root, "artifacts", "compliance", "dora");
    mkdirSync(backupDir, { recursive: true });
    mkdirSync(evidenceDir, { recursive: true });
    const artifactPath = join(backupDir, "drill.sql.enc");
    const artifact = "database-only backup";
    const checksum = createHash("sha256").update(artifact).digest("hex");
    writeFileSync(artifactPath, artifact);
    writeFileSync(
      join(evidenceDir, "restore-drill-evidence.json"),
      `${JSON.stringify({
        schemaVersion: "maiprop.restore-drill-evidence.v2",
        status: "verified",
        backup: { artifactPath, artifactSha256: checksum, artifactBytes: Buffer.byteLength(artifact) },
        restore: {
          completedAt: "2026-07-13T08:00:00.000Z",
          target: "staging",
          rowCounts: { profiles: 1, listings: 2, projects: 3, subscriptions: 4, open_house_registrations: 5 },
          releaseSha: "66326673d2eea057f16584795655572974f97f99",
          cleanupConfirmed: true,
        },
      })}\n`,
    );

    const failures = checkChecksumVerifiedRestoreEvidence(root).failures.join("\n");
    expect(failures).toContain("Auth users and identities");
    expect(failures).toContain("Storage buckets and objects");
    expect(failures).toContain("configuration snapshot");
  });
});
