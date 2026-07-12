import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const readJson = (root, relativePath, failures) => {
  const text = readText(root, relativePath);
  if (text === null) {
    failures.push(`${relativePath} is missing`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(`${relativePath} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
};

const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");

const requiredRestoreTables = [
  "profiles",
  "listings",
  "projects",
  "subscriptions",
  "open_house_registrations",
];

export function checkChecksumVerifiedRestoreEvidence(
  root = process.cwd(),
  relativePath = "artifacts/compliance/dora/restore-drill-evidence.json",
) {
  const failures = [];
  const evidence = readJson(root, relativePath, failures);
  if (!evidence) return result(failures);

  if (evidence.schemaVersion !== "maiprop.restore-drill-evidence.v1") {
    failures.push("restore evidence must use schemaVersion maiprop.restore-drill-evidence.v1");
  }
  if (evidence.status !== "verified") failures.push("restore evidence must have status=verified");

  const backup = evidence.backup ?? {};
  if (typeof backup.artifactPath !== "string" || backup.artifactPath.length === 0) {
    failures.push("restore evidence must include backup.artifactPath");
  } else if (!existsSync(backup.artifactPath)) {
    failures.push(`restore evidence backup artifact is missing: ${backup.artifactPath}`);
  } else {
    const actualSha256 = sha256File(backup.artifactPath);
    if (backup.artifactSha256 !== actualSha256) {
      failures.push("restore evidence backup artifact checksum does not match backup.artifactSha256");
    }
    if (backup.artifactBytes !== statSync(backup.artifactPath).size) {
      failures.push("restore evidence backup artifact byte size does not match backup.artifactBytes");
    }
  }
  if (!/^[a-f0-9]{64}$/i.test(String(backup.artifactSha256 ?? ""))) {
    failures.push("restore evidence must include a SHA-256 backup artifact checksum");
  }
  if (!Number.isInteger(backup.artifactBytes) || backup.artifactBytes < 1) {
    failures.push("restore evidence must include backup artifact byte size");
  }

  const restore = evidence.restore ?? {};
  if (typeof restore.completedAt !== "string" || Number.isNaN(Date.parse(restore.completedAt))) {
    failures.push("restore evidence must include restore.completedAt as an ISO timestamp");
  }
  if (typeof restore.target !== "string" || /\bproduction\b/i.test(restore.target)) {
    failures.push("restore evidence must identify a non-production restore target");
  }
  if (restore.cleanupConfirmed !== true) failures.push("restore evidence must confirm cleanup");
  if (!/^[a-f0-9]{7,40}$/i.test(String(restore.releaseSha ?? ""))) {
    failures.push("restore evidence must include a release SHA");
  }
  for (const table of requiredRestoreTables) {
    if (!Number.isInteger(restore.rowCounts?.[table]) || restore.rowCounts[table] < 0) {
      failures.push(`restore evidence must include an integer row count for ${table}`);
    }
  }

  return result(failures);
}

const requireMarkers = (root, relativePath, markers) => {
  const failures = [];
  const text = readText(root, relativePath);
  if (text === null) return [`${relativePath} is missing`];
  for (const marker of markers) {
    if (!text.includes(marker)) failures.push(`${relativePath} must mention ${marker}`);
  }
  return failures;
};

export function checkFreeTierBackupRunbook(root = process.cwd()) {
  return result([
    ...requireMarkers(root, "docs/backups/FREE_TIER_LOGICAL_BACKUPS.md", [
      "supabase db dump",
      "MAIPROP_BACKUP_PASSPHRASE",
      "encrypted off-site backup",
      "restore drill",
      "RPO",
      "RTO",
    ]),
    ...(existsSync(join(root, "scripts", "supabase-logical-backup.mjs"))
      ? []
      : ["scripts/supabase-logical-backup.mjs is missing"]),
  ]);
}

export function checkProductionChecklistRecoveryEvidence(root = process.cwd()) {
  return result(requireMarkers(root, "docs/PRODUCTION_CHECKLIST.md", [
    "Supabase Free",
    "logical backup",
    "encrypted off-site backup",
    "restore drill",
    "Last restore test",
  ]));
}

export function hasSuccessfulRestoreDrill(root = process.cwd()) {
  const text = readText(root, "docs/compliance/dora/RESTORE_DRILL_LOG.md") ?? "";
  return text
    .split(/\r?\n/)
    .some((line) => /^\|\s*\d{4}-\d{2}-\d{2}\s+\|/.test(line) && /\|\s*Successful\s*\|/.test(line));
}

export function checkRestoreDrillLog(root = process.cwd(), options = {}) {
  const failures = requireMarkers(root, "docs/compliance/dora/RESTORE_DRILL_LOG.md", [
    "Restore drill",
    "RPO",
    "RTO",
    "Evidence status",
    "source backup timestamp",
    "restore target",
    "verified row counts",
    "release SHA",
    "cleanup confirmation",
  ]);

  if (options.requireSuccessfulRestore && !hasSuccessfulRestoreDrill(root)) {
    failures.push(
      "docs/compliance/dora/RESTORE_DRILL_LOG.md must include a dated restore drill row with Evidence status `Successful`",
    );
  }

  if (options.requireSuccessfulRestore) {
    failures.push(
      ...checkChecksumVerifiedRestoreEvidence(root, options.restoreEvidencePath).failures.map(
        (failure) => `checksum-verified restore evidence: ${failure}`,
      ),
    );
  }

  return result(failures);
}

export function checkDisasterRecoveryRunbook(root = process.cwd()) {
  return result(requireMarkers(root, "docs/DR_RUNBOOK.md", [
    "Free-tier logical backup fallback",
    "supabase db dump",
    "MAIPROP_BACKUP_PASSPHRASE",
    "encrypted off-site backup",
    "restore drill",
    "RPO",
    "RTO",
  ]));
}

export function checkDisasterRecoveryReadiness(root = process.cwd(), options = {}) {
  const checks = [
    checkFreeTierBackupRunbook(root),
    checkProductionChecklistRecoveryEvidence(root),
    checkDisasterRecoveryRunbook(root),
    checkRestoreDrillLog(root, {
      requireSuccessfulRestore: options.requireSuccessfulRestore === true,
      restoreEvidencePath: options.restoreEvidencePath,
    }),
  ];
  return result(checks.flatMap((check) => check.failures));
}

const main = () => {
  const restoreEvidenceIndex = process.argv.indexOf("--restore-evidence");
  if (restoreEvidenceIndex !== -1 && !process.argv[restoreEvidenceIndex + 1]) {
    throw new Error("--restore-evidence requires a path.");
  }
  const check = checkDisasterRecoveryReadiness(process.cwd(), {
    requireSuccessfulRestore: process.argv.includes("--require-successful-restore"),
    restoreEvidencePath:
      restoreEvidenceIndex === -1 ? undefined : (process.argv[restoreEvidenceIndex + 1] ?? undefined),
  });
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Disaster recovery readiness evidence OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-dr-readiness.mjs")
) {
  main();
}
