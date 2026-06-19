import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const frameworks = [
  "OWASP ASVS 5.0",
  "NIST SSDF 1.1",
  "CIS Controls v8.1",
  "DORA",
  "SLSA 1.2",
  "WCAG 2.2",
];

const requiredEvidence = [
  "npm run check:live-security-posture",
  "npm run check:public-functions",
  "npm run check:mutation-validation",
  "npm run check:github-governance",
  "npm run check:dora-readiness",
  "npm run check:slsa-readiness",
  "npm run check:wcag-coverage",
  "npm run lighthouse",
  "e2e/accessibility.spec.ts",
  "docs/RLS_ACCESS_MATRIX.md",
  "docs/governance/PROCUREMENT_EVIDENCE_MATRIX.md",
  "docs/compliance/dora/ICT_RISK_REGISTER.md",
  "docs/compliance/SLSA_PROVENANCE.md",
  "Supabase leaked-password protection",
];

const result = (failures, summary = {}) => ({ ok: failures.length === 0, failures, summary });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

export function checkComplianceMatrix(root = process.cwd()) {
  const failures = [];
  const matrix = readText(root, "docs/compliance/control-matrix.md");

  if (matrix === null) {
    return result(["docs/compliance/control-matrix.md is missing"], { frameworks });
  }

  for (const framework of frameworks) {
    if (!matrix.includes(framework)) {
      failures.push(`control matrix must include ${framework}`);
    }
  }

  for (const header of ["| Control |", "| Evidence |", "| Verification |", "| Owner |"]) {
    if (!matrix.includes(header)) {
      failures.push(`control matrix must include table header ${header}`);
    }
  }

  for (const marker of requiredEvidence) {
    if (!matrix.includes(marker)) {
      failures.push(`control matrix must reference ${marker}`);
    }
  }

  if (!/External blocker/i.test(matrix)) {
    failures.push("control matrix must mark paid/provider items as External blocker");
  }

  return result(failures, {
    frameworks,
    requiredEvidence: requiredEvidence.length,
  });
}

const main = () => {
  const check = checkComplianceMatrix(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Compliance control matrix OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-compliance-matrix.mjs")
) {
  main();
}
