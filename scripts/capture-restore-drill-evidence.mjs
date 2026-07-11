#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REQUIRED_TABLES = ["profiles", "listings", "projects", "subscriptions", "open_house_registrations"];

export const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const readJson = (path, label) => {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const requireIsoTimestamp = (value, name) => {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error(`${name} must be an ISO timestamp.`);
  }
  return value;
};

const requireRowCounts = (rowCounts) => {
  if (!rowCounts || typeof rowCounts !== "object") throw new Error("restore result must include row_counts.");
  const normalized = {};
  for (const table of REQUIRED_TABLES) {
    if (!Number.isInteger(rowCounts[table]) || rowCounts[table] < 0) {
      throw new Error(`restore result must include a non-negative integer row count for ${table}.`);
    }
    normalized[table] = rowCounts[table];
  }
  return normalized;
};

export function buildRestoreDrillEvidence({ backupManifestPath, restoreResultPath, now = () => new Date() }) {
  const manifestPath = resolve(backupManifestPath);
  const restorePath = resolve(restoreResultPath);
  const manifest = readJson(manifestPath, "backup manifest");
  const restoreResult = readJson(restorePath, "restore result");

  if (typeof manifest.backup_file !== "string" || basename(manifest.backup_file) !== manifest.backup_file) {
    throw new Error("backup manifest must provide a local backup_file name.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(manifest.artifact_sha256 ?? ""))) {
    throw new Error("backup manifest must include artifact_sha256.");
  }
  if (!Number.isInteger(manifest.artifact_bytes) || manifest.artifact_bytes < 1) {
    throw new Error("backup manifest must include artifact_bytes.");
  }

  const artifactPath = join(dirname(manifestPath), manifest.backup_file);
  if (!existsSync(artifactPath)) throw new Error(`Backup artifact is missing: ${artifactPath}`);

  const artifactSha256 = sha256File(artifactPath);
  const artifactBytes = statSync(artifactPath).size;
  if (artifactSha256 !== manifest.artifact_sha256) throw new Error("Backup artifact checksum does not match manifest.");
  if (artifactBytes !== manifest.artifact_bytes) throw new Error("Backup artifact size does not match manifest.");

  const manifestSha256 = sha256File(manifestPath);
  if (restoreResult.source_backup_sha256 !== artifactSha256) {
    throw new Error("restore result source_backup_sha256 does not match the verified backup artifact.");
  }
  if (restoreResult.source_manifest_sha256 !== manifestSha256) {
    throw new Error("restore result source_manifest_sha256 does not match the backup manifest.");
  }
  if (typeof restoreResult.restore_target !== "string" || /\bproduction\b/i.test(restoreResult.restore_target)) {
    throw new Error("restore result must identify a non-production restore_target.");
  }
  if (restoreResult.cleanup_confirmed !== true) throw new Error("restore result must set cleanup_confirmed=true.");
  if (!/^[a-f0-9]{7,40}$/i.test(String(restoreResult.release_sha ?? ""))) {
    throw new Error("restore result must include release_sha.");
  }

  return {
    schemaVersion: "maiprop.restore-drill-evidence.v1",
    status: "verified",
    verifiedAt: now().toISOString(),
    backup: {
      artifactPath,
      artifactSha256,
      artifactBytes,
      manifestPath,
      manifestSha256,
    },
    restore: {
      completedAt: requireIsoTimestamp(restoreResult.completed_at, "restore result completed_at"),
      target: restoreResult.restore_target,
      rowCounts: requireRowCounts(restoreResult.row_counts),
      releaseSha: restoreResult.release_sha,
      cleanupConfirmed: true,
    },
  };
}

const parseArgs = (argv) => {
  const args = { out: "artifacts/compliance/dora/restore-drill-evidence.json" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--backup-manifest") args.backupManifest = argv[index + 1];
    if (arg === "--restore-result") args.restoreResult = argv[index + 1];
    if (arg === "--out") args.out = argv[index + 1] ?? args.out;
  }
  if (!args.backupManifest) throw new Error("--backup-manifest is required.");
  if (!args.restoreResult) throw new Error("--restore-result is required.");
  return args;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const evidence = buildRestoreDrillEvidence({
    backupManifestPath: args.backupManifest,
    restoreResultPath: args.restoreResult,
  });
  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`Checksum-verified restore evidence written to ${out}\n`);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("capture-restore-drill-evidence.mjs")
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
