import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildRestoreDrillEvidence } from "./capture-restore-drill-evidence.mjs";

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-restore-evidence-"));
  const backupDir = join(root, "backup");
  mkdirSync(backupDir, { recursive: true });
  const artifact = Buffer.from("encrypted logical backup payload");
  const manifestPath = join(backupDir, "backup.manifest.json");
  const artifactPath = join(backupDir, "backup.sql.enc");
  writeFileSync(artifactPath, artifact);
  writeFileSync(
    manifestPath,
    `${JSON.stringify({
      backup_file: "backup.sql.enc",
      artifact_sha256: sha256(artifact),
      artifact_bytes: artifact.length,
    })}\n`,
  );
  const restoreResultPath = join(root, "restore-result.json");
  writeFileSync(
    restoreResultPath,
    `${JSON.stringify({
      completed_at: "2026-07-11T12:00:00.000Z",
      restore_target: "disposable-local-postgres",
      row_counts: {
        profiles: 1,
        listings: 2,
        projects: 3,
        subscriptions: 4,
        open_house_registrations: 5,
      },
      release_sha: "66326673d2eea057f16584795655572974f97f99",
      cleanup_confirmed: true,
      source_backup_sha256: sha256(artifact),
      source_manifest_sha256: sha256(readFileSync(manifestPath)),
    })}\n`,
  );
  return { artifactPath, manifestPath, restoreResultPath };
};

describe("restore drill evidence capture", () => {
  it("ties restore evidence to a checksum-verified backup artifact", () => {
    const fixture = makeFixture();
    const evidence = buildRestoreDrillEvidence({
      backupManifestPath: fixture.manifestPath,
      restoreResultPath: fixture.restoreResultPath,
      now: () => new Date("2026-07-11T13:00:00.000Z"),
    });

    expect(evidence).toMatchObject({
      schemaVersion: "maiprop.restore-drill-evidence.v1",
      status: "verified",
      backup: { artifactPath: fixture.artifactPath, artifactBytes: 32 },
      restore: { target: "disposable-local-postgres", cleanupConfirmed: true },
    });
  });

  it("rejects a restore result that is not tied to the current backup manifest", () => {
    const fixture = makeFixture();
    writeFileSync(
      fixture.restoreResultPath,
      `${JSON.stringify({
        completed_at: "2026-07-11T12:00:00.000Z",
        restore_target: "disposable-local-postgres",
        row_counts: { profiles: 1, listings: 2, projects: 3, subscriptions: 4, open_house_registrations: 5 },
        release_sha: "66326673d2eea057f16584795655572974f97f99",
        cleanup_confirmed: true,
        source_backup_sha256: "0".repeat(64),
        source_manifest_sha256: "0".repeat(64),
      })}\n`,
    );

    expect(() =>
      buildRestoreDrillEvidence({
        backupManifestPath: fixture.manifestPath,
        restoreResultPath: fixture.restoreResultPath,
      }),
    ).toThrow("source_backup_sha256 does not match");
  });
});
