import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_DIR = "artifacts/compliance/live-evidence";
const REQUIRED_PROVIDERS = ["sentry", "cloudflare", "github"];

const validateGithubEvidence = (item) => {
  const missing = [];
  const branchProtection = item.branchProtection ?? {};
  if (item.branch !== "main") missing.push("branch=main");
  if (branchProtection.requiredPullRequestReviews !== true) missing.push("requiredPullRequestReviews");
  if (branchProtection.requiredStatusChecks !== true) missing.push("requiredStatusChecks");
  if (branchProtection.allowsForcePushes !== false) missing.push("allowsForcePushes=false");
  if (branchProtection.allowsDeletions !== false) missing.push("allowsDeletions=false");
  return missing.length > 0
    ? [`github live evidence missing required branch protection proof: ${missing.join(", ")}`]
    : [];
};

const validateCloudflareEvidence = (item) => {
  const missing = [];
  const deployment = item.pagesProject?.latestProductionDeployment ?? item.latestProductionDeployment ?? {};
  if ((item.pagesProject?.name ?? item.project) !== "maiprop-listing-site") missing.push("project=maiprop-listing-site");
  if (deployment.status !== "success") missing.push("latestProductionDeployment.status=success");
  if (!deployment.commitHash) missing.push("latestProductionDeployment.commitHash");
  return missing.length > 0
    ? [`cloudflare live evidence missing production deployment proof: ${missing.join(", ")}`]
    : [];
};

const validateSentryEvidence = (item) => {
  const missing = [];
  if (item.environment !== "production") missing.push("environment=production");
  if (item.timeRange !== "24h") missing.push("timeRange=24h");
  if (item.querySucceeded !== true) missing.push("querySucceeded=true");
  return missing.length > 0
    ? [`sentry live evidence missing production query proof: ${missing.join(", ")}`]
    : [];
};

const validateCapturedEvidence = (item) => {
  if (item.provider === "github") return validateGithubEvidence(item);
  if (item.provider === "cloudflare") return validateCloudflareEvidence(item);
  if (item.provider === "sentry") return validateSentryEvidence(item);
  return [];
};

export function evaluateEcasLiveEvidence(evidenceItems, { strict = false } = {}) {
  const failures = [];
  const warnings = [];
  const byProvider = new Map(evidenceItems.map((item) => [item.provider, item]));

  for (const provider of REQUIRED_PROVIDERS) {
    const item = byProvider.get(provider);
    if (!item) {
      const message = `${provider} live evidence is missing`;
      if (strict) failures.push(message);
      else warnings.push(message);
      continue;
    }

    if (item.status !== "captured") {
      const message = `${provider} live evidence is ${item.status}`;
      if (strict) failures.push(message);
      else warnings.push(message);
      continue;
    }

    const proofFailures = validateCapturedEvidence(item);
    if (proofFailures.length > 0) {
      if (strict) failures.push(...proofFailures);
      else warnings.push(...proofFailures);
    }
  }

  return {
    ok: failures.length === 0,
    failures,
    warnings,
    summary: {
      requiredProviders: REQUIRED_PROVIDERS,
      capturedProviders: evidenceItems.filter((item) => item.status === "captured").map((item) => item.provider),
    },
  };
}

const readEvidenceItems = (root, relativeDir) => {
  const dir = join(root, relativeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(join(dir, name), "utf8")))
    .filter((item) => item?.provider);
};

const parseArgs = (argv) => {
  const args = { dir: DEFAULT_DIR, strict: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") args.strict = true;
    if (arg === "--dir") args.dir = argv[index + 1] ?? args.dir;
  }
  return args;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  const result = evaluateEcasLiveEvidence(readEvidenceItems(process.cwd(), args.dir), { strict: args.strict });

  for (const warning of result.warnings) process.stderr.write(`warning: ${warning}\n`);
  if (!result.ok) {
    for (const failure of result.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }

  process.stdout.write(`ECAS live evidence ${args.strict ? "strict" : "advisory"} check OK\n`);
};

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("check-ecas-live-evidence.mjs")
) {
  main();
}
