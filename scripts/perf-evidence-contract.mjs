import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const requiredDocuments = [
  {
    path: "docs/performance/LOAD_TEST_EVIDENCE.md",
    markers: [
      "Pending operator execution",
      "normalized summary artifact",
      "artifact SHA256",
      "release SHA",
      "monitoring window",
      "production approval record",
    ],
  },
  {
    path: "docs/compliance/dora/PERFORMANCE_PROOF_LOG.md",
    markers: [
      "Pending operator execution",
      "normalized summary artifact",
      "artifact SHA256",
      "approval reference for production hosts",
    ],
  },
];

const result = (failures) => ({ ok: failures.length === 0, failures });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const claimedSuccess = (line) => /\|\s*(?:Successful|Passed|Complete|Completed)\s*\|/i.test(line);

const hasArtifactSha = (line) =>
  /\b(?:artifact\s*)?SHA256\s*[:=]\s*[a-f0-9]{64}\b/i.test(line) ||
  /\bsha256-[A-Za-z0-9+/=]{32,}\b/.test(line);

const hasReleaseSha = (line) => /\brelease SHA\s*[:=]\s*[a-f0-9]{7,40}\b/i.test(line);

const hasRunTimestamp = (line) => /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z\b/.test(line);

const hasNamedOperator = (line) =>
  /\|\s*(?!Pending operator execution|Platform|Codex)([A-Z][A-Za-z .'-]{2,}|@[A-Za-z0-9_.-]+)\s*\|/.test(line);

const hasProductionHost = (line) => /\bhttps:\/\/(?:[A-Za-z0-9-]+\.)*maiprop\.co\b/i.test(line);

function checkMarkers(root, doc) {
  const text = readText(root, doc.path);
  if (text === null) return { text: null, failures: [`${doc.path} is missing`] };

  const failures = [];
  for (const marker of doc.markers) {
    if (!text.includes(marker)) failures.push(`${doc.path} must mention ${marker}`);
  }
  return { text, failures };
}

function checkClaimedSuccessRows(relativePath, text) {
  const failures = [];
  const rows = text.split(/\r?\n/).filter((line) => line.trim().startsWith("|") && claimedSuccess(line));

  for (const row of rows) {
    if (!hasArtifactSha(row)) {
      failures.push(`${relativePath} successful performance evidence rows must include artifact SHA256`);
    }
    if (!hasReleaseSha(row)) {
      failures.push(`${relativePath} successful performance evidence rows must include release SHA`);
    }
    if (!hasRunTimestamp(row)) {
      failures.push(`${relativePath} successful performance evidence rows must include a UTC run timestamp`);
    }
    if (!hasNamedOperator(row)) {
      failures.push(`${relativePath} successful performance evidence rows must include a named human operator`);
    }
    if (/codex|placeholder|template only|not proof/i.test(row)) {
      failures.push(`${relativePath} successful performance evidence rows must not cite Codex-generated placeholder evidence`);
    }
    if (hasProductionHost(row) && !/\b(?:approval|change)\s*(?:ref|record|ticket)\s*[:=]\s*[A-Za-z0-9._/-]+\b/i.test(row)) {
      failures.push(`${relativePath} successful production rows must include an approval reference for production hosts`);
    }
  }

  return failures;
}

export function checkPerformanceEvidenceContract(root = process.cwd()) {
  const failures = [];

  for (const doc of requiredDocuments) {
    const check = checkMarkers(root, doc);
    failures.push(...check.failures);
    if (check.text !== null) failures.push(...checkClaimedSuccessRows(doc.path, check.text));
  }

  return result(failures);
}

function main() {
  const check = checkPerformanceEvidenceContract(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("Performance evidence contract OK\n");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("perf-evidence-contract.mjs")
) {
  main();
}
