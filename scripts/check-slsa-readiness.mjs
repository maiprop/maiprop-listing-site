import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const result = (failures, summary = {}) => ({ ok: failures.length === 0, failures, summary });

const readText = (root, relativePath) => {
  const path = join(root, relativePath);
  if (!existsSync(path)) return null;
  return readFileSync(path, "utf8");
};

const workflowFiles = (root) => {
  const dir = join(root, ".github", "workflows");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `.github/workflows/${name}`);
};

export function checkSlsaReadiness(root = process.cwd()) {
  const failures = [];
  const workflows = workflowFiles(root);
  const workflowTexts = workflows.map((path) => ({ path, text: readText(root, path) ?? "" }));
  const attestationWorkflowFiles = workflowTexts
    .filter(({ text }) => text.includes("actions/attest-build-provenance@"))
    .map(({ path }) => path);
  const deployWorkflow = readText(root, ".github/workflows/reusable-cloudflare-production-deploy.yml");
  const ciWorkflow = readText(root, ".github/workflows/ci.yml");
  const provenanceDoc = readText(root, "docs/compliance/SLSA_PROVENANCE.md");

  if (attestationWorkflowFiles.length === 0) {
    failures.push("a GitHub workflow must use actions/attest-build-provenance pinned by commit SHA");
  }
  if (deployWorkflow === null) {
    failures.push(".github/workflows/reusable-cloudflare-production-deploy.yml is missing");
  } else {
    for (const marker of ["id-token: write", "attestations: write", "maiprop-production-dist.tgz"]) {
      if (!deployWorkflow.includes(marker)) failures.push(`production deploy workflow must include ${marker}`);
    }
    if (/actions\/attest-build-provenance@v\d/i.test(deployWorkflow)) {
      failures.push("attestation action must be pinned by commit SHA, not a floating version tag");
    }
  }
  if (ciWorkflow === null || !ciWorkflow.includes("npm sbom --sbom-format cyclonedx")) {
    failures.push("CI workflow must generate a CycloneDX SBOM");
  }
  if (provenanceDoc === null) {
    failures.push("docs/compliance/SLSA_PROVENANCE.md is missing");
  } else {
    for (const marker of ["Artifact Attestations", "SBOM", "SLSA 1.2", "Verification", "External blocker"]) {
      if (!provenanceDoc.includes(marker)) failures.push(`SLSA provenance doc must mention ${marker}`);
    }
  }

  return result(failures, { attestationWorkflowFiles });
}

const main = () => {
  const check = checkSlsaReadiness(process.cwd());
  if (!check.ok) {
    for (const failure of check.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write("SLSA provenance readiness OK\n");
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-slsa-readiness.mjs")
) {
  main();
}
