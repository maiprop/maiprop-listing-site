import { mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SUPPORTED_LOAD_PROFILES = [
  "smoke",
  "baseline_100",
  "growth_10x",
  "enterprise_soak",
];

const DEFAULT_SUMMARY_DIR = "artifacts/performance/k6";

const result = (failures, config = null) => ({
  ok: failures.length === 0,
  failures,
  ...(config ? { config } : {}),
});

function readArg(argv, name) {
  const eqPrefix = `${name}=`;
  const eq = argv.find((arg) => arg.startsWith(eqPrefix));
  if (eq) return eq.slice(eqPrefix.length);
  const index = argv.indexOf(name);
  if (index === -1) return "";
  return argv[index + 1] ?? "";
}

function clean(value) {
  return (value ?? "").trim();
}

function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("BASE_URL must use http or https.");
  }
  return parsed.toString().replace(/\/$/, "");
}

export function isProductionHost(hostname) {
  return hostname === "maiprop.co" || hostname.endsWith(".maiprop.co");
}

function isCloudflarePagesHost(hostname) {
  return (
    hostname === "maiprop-listing-site.pages.dev" ||
    hostname.endsWith(".maiprop-listing-site.pages.dev") ||
    isProductionHost(hostname)
  );
}

function isHighVolumeProfile(profile) {
  return profile === "growth_10x" || profile === "enterprise_soak";
}

export function validateK6RunConfig({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const failures = [];
  const requestedBaseUrl = clean(readArg(argv, "--base-url") || env.BASE_URL);
  const requestedProfile = clean(readArg(argv, "--profile") || env.ECAS_LOAD_PROFILE);
  const summaryDir = clean(readArg(argv, "--summary-dir") || env.LOAD_TEST_SUMMARY_DIR || DEFAULT_SUMMARY_DIR);
  const productionApproved = env.LOAD_TEST_APPROVED_PRODUCTION === "true";
  const cloudflareQuotaBurnApproved = env.LOAD_TEST_APPROVED_CLOUDFLARE_QUOTA_BURN === "true";

  if (!requestedBaseUrl) {
    failures.push("BASE_URL is required. Set BASE_URL or pass --base-url.");
  }

  if (!requestedProfile) {
    failures.push("ECAS_LOAD_PROFILE is required. Set ECAS_LOAD_PROFILE or pass --profile.");
  } else if (!SUPPORTED_LOAD_PROFILES.includes(requestedProfile)) {
    failures.push(`ECAS_LOAD_PROFILE must be one of: ${SUPPORTED_LOAD_PROFILES.join(", ")}.`);
  }

  let baseUrl = requestedBaseUrl;
  let productionHost = false;
  let cloudflarePagesHost = false;

  if (requestedBaseUrl) {
    try {
      baseUrl = normalizeBaseUrl(requestedBaseUrl);
      const hostname = new URL(baseUrl).hostname;
      productionHost = isProductionHost(hostname);
      cloudflarePagesHost = isCloudflarePagesHost(hostname);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : "BASE_URL is invalid.");
    }
  }

  if (productionHost && !productionApproved) {
    failures.push("Production load tests require LOAD_TEST_APPROVED_PRODUCTION=true.");
  }
  if (cloudflarePagesHost && isHighVolumeProfile(requestedProfile) && !cloudflareQuotaBurnApproved) {
    failures.push("Cloudflare Pages growth_10x/enterprise_soak runs require LOAD_TEST_APPROVED_CLOUDFLARE_QUOTA_BURN=true.");
  }

  return result(failures, {
    baseUrl,
    profile: requestedProfile,
    summaryDir,
    productionApproved,
    productionHost,
    cloudflarePagesHost,
    cloudflareQuotaBurnApproved,
  });
}

export function buildK6RunPlan(options = {}) {
  const validation = validateK6RunConfig(options);
  if (!validation.ok) return validation;

  const env = {
    ...process.env,
    ...(options.env ?? {}),
    BASE_URL: validation.config.baseUrl,
    ECAS_LOAD_PROFILE: validation.config.profile,
    LOAD_TEST_SUMMARY_DIR: validation.config.summaryDir,
  };

  if (validation.config.productionApproved) {
    env.LOAD_TEST_APPROVED_PRODUCTION = "true";
  } else {
    delete env.LOAD_TEST_APPROVED_PRODUCTION;
  }
  if (validation.config.cloudflareQuotaBurnApproved) {
    env.LOAD_TEST_APPROVED_CLOUDFLARE_QUOTA_BURN = "true";
  } else {
    delete env.LOAD_TEST_APPROVED_CLOUDFLARE_QUOTA_BURN;
  }

  return {
    ok: true,
    failures: [],
    command: "k6",
    args: ["run", "scripts/load-test/basic.js"],
    env,
    config: validation.config,
  };
}

function main() {
  const plan = buildK6RunPlan();
  if (!plan.ok) {
    for (const failure of plan.failures) process.stderr.write(`${failure}\n`);
    process.exitCode = 1;
    return;
  }

  mkdirSync(plan.config.summaryDir, { recursive: true });
  process.stdout.write(`Running k6 ${plan.config.profile} against ${plan.config.baseUrl}\n`);
  process.stdout.write(`Writing summaries to ${plan.config.summaryDir}\n`);

  const run = spawnSync(plan.command, plan.args, {
    env: plan.env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  process.exitCode = run.status ?? 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("perf-k6-run.mjs")
) {
  main();
}
