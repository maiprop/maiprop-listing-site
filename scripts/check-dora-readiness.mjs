#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredDocuments = [
  {
    path: "docs/compliance/dora/ICT_RISK_REGISTER.md",
    markers: ["ICT risk", "Risk owner", "Control", "Review cadence"],
  },
  {
    path: "docs/compliance/dora/THIRD_PARTY_REGISTER.md",
    markers: ["Provider", "Service", "Exit plan", "Data handled"],
  },
  {
    path: "docs/compliance/dora/INCIDENT_REPORTING_TAXONOMY.md",
    markers: ["SEV1", "DORA incident criteria", "Regulatory clock", "Customer notice"],
  },
  {
    path: "docs/compliance/dora/RESTORE_DRILL_LOG.md",
    markers: ["Restore drill", "RPO", "RTO", "Evidence status"],
  },
  {
    path: "docs/compliance/dora/TABLETOP_EXERCISES.md",
    markers: ["Tabletop", "Scenario", "Participants", "Action items"],
  },
  {
    path: "docs/compliance/dora/THIRD_PARTY_EXIT_PLANS.md",
    markers: ["Supabase", "Cloudflare", "Stripe", "Sentry", "OpenAI"],
  },
];

const result = (failures, summary = {}) => ({ ok: failures.length === 0, failures, summary });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

export function checkDoraReadiness(root = process.cwd()) {
  const failures = [];

  for (const doc of requiredDocuments) {
    const text = readText(root, doc.path);
    if (text === null) {
      failures.push(`${doc.path} is missing`);
      continue;
    }
    for (const marker of doc.markers) {
      if (!text.includes(marker)) failures.push(`${doc.path} must mention ${marker}`);
    }
  }

  for (const existingDoc of ["docs/DR_RUNBOOK.md", "docs/SLO.md", "docs/ON_CALL.md"]) {
    if (!existsSync(join(root, existingDoc))) failures.push(`${existingDoc} is missing`);
  }

  return result(failures, { requiredDocuments: requiredDocuments.length });
}

const main = () => {
  const check = checkDoraReadiness(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("DORA readiness evidence OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-dora-readiness.mjs")
) {
  main();
}
