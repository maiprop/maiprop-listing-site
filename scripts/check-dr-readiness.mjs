import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

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

export function checkDisasterRecoveryReadiness(root = process.cwd()) {
  const checks = [
    checkFreeTierBackupRunbook(root),
    checkProductionChecklistRecoveryEvidence(root),
    checkDisasterRecoveryRunbook(root),
  ];
  return result(checks.flatMap((check) => check.failures));
}

const main = () => {
  const check = checkDisasterRecoveryReadiness(process.cwd());
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
