import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_STAGING_PROJECT = "xsiehskfgeoqyazcgauv";
const PRODUCTION_PROJECT = "qvvicunqcrwpioqnvzxf";
const EXPECTED_SPECS = [
  "gdpr-delete-account.spec.ts",
  "onboarding-role-selection.spec.ts",
  "rls-security.spec.ts",
];

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function requireHex(value, name, length) {
  const normalized = required(value, name).toLowerCase();
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(normalized)) {
    throw new Error(`${name} must be a ${length}-character hexadecimal digest`);
  }
  return normalized;
}

function collectSuiteCoverage(suites, output = new Map(), inheritedFile = null) {
  for (const suite of suites ?? []) {
    const suiteFile = suite?.file
      ? basename(String(suite.file).replaceAll("\\", "/"))
      : inheritedFile;
    if (suiteFile && !output.has(suiteFile)) output.set(suiteFile, 0);
    for (const spec of suite?.specs ?? []) {
      const specFile = spec?.file
        ? basename(String(spec.file).replaceAll("\\", "/"))
        : suiteFile;
      if (!specFile) continue;
      output.set(specFile, (output.get(specFile) ?? 0) + (spec?.tests?.length ?? 0));
    }
    collectSuiteCoverage(suite?.suites, output, suiteFile);
  }
  return output;
}

function requireCount(stats, name) {
  const value = stats?.[name];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Playwright stats.${name} must be a non-negative integer`);
  }
  return value;
}

export function buildStagingLiveSecurityEvidence({
  reportBytes,
  releaseSha,
  artifactSha256,
  stagingProjectRef,
  stagingAppUrl,
  createdAt = new Date().toISOString(),
}) {
  const release = requireHex(releaseSha, "RELEASE_SHA", 40);
  const artifact = requireHex(artifactSha256, "ARTIFACT_SHA256", 64);
  const projectRef = required(stagingProjectRef, "STAGING_SUPABASE_PROJECT_ID");
  if (
    projectRef !== EXPECTED_STAGING_PROJECT ||
    projectRef === PRODUCTION_PROJECT
  ) {
    throw new Error("Live security evidence is restricted to the designated staging project");
  }

  const appUrl = new URL(required(stagingAppUrl, "STAGING_APP_URL"));
  if (appUrl.protocol !== "https:") {
    throw new Error("STAGING_APP_URL must use HTTPS");
  }

  const bytes = Buffer.isBuffer(reportBytes)
    ? reportBytes
    : Buffer.from(reportBytes);
  const report = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(report.errors) || report.errors.length !== 0) {
    throw new Error("Playwright live security report contains top-level errors");
  }

  const expected = requireCount(report.stats, "expected");
  const skipped = requireCount(report.stats, "skipped");
  const unexpected = requireCount(report.stats, "unexpected");
  const flaky = requireCount(report.stats, "flaky");
  if (expected < EXPECTED_SPECS.length) {
    throw new Error("Playwright live security report contains too few passing tests");
  }
  if (skipped !== 0 || unexpected !== 0 || flaky !== 0) {
    throw new Error(
      "Staging live security tests must pass without skipped, unexpected, or flaky results",
    );
  }

  const suiteCoverage = collectSuiteCoverage(report.suites);
  const observedSpecs = [...suiteCoverage.keys()].sort();
  if (JSON.stringify(observedSpecs) !== JSON.stringify(EXPECTED_SPECS)) {
    throw new Error(
      `Staging live security report covered ${observedSpecs.join(", ") || "no specs"}`,
    );
  }
  for (const spec of EXPECTED_SPECS) {
    if ((suiteCoverage.get(spec) ?? 0) < 1) {
      throw new Error(`Staging live security report contains no tests for ${spec}`);
    }
  }

  const durationMs = Number(report.stats?.duration);
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    throw new Error("Playwright stats.duration must be a non-negative number");
  }

  return {
    schema_version: 1,
    evidence_type: "maiprop-staging-live-security",
    ok: true,
    release_sha: release,
    artifact_sha256: artifact,
    target: {
      supabase_project_ref: projectRef,
      app_origin: appUrl.origin,
    },
    playwright: {
      specs: observedSpecs,
      expected,
      skipped,
      unexpected,
      flaky,
      duration_ms: durationMs,
      report_sha256: createHash("sha256").update(bytes).digest("hex"),
    },
    created_at: required(createdAt, "createdAt"),
  };
}

function runCli() {
  const reportPath = resolve(
    process.env.PLAYWRIGHT_JSON_REPORT ?? "staging-live-security-playwright.json",
  );
  const outputPath = resolve(
    process.env.STAGING_LIVE_SECURITY_EVIDENCE ??
      "staging-live-security-proof.json",
  );
  const evidence = buildStagingLiveSecurityEvidence({
    reportBytes: readFileSync(reportPath),
    releaseSha: process.env.RELEASE_SHA,
    artifactSha256: process.env.ARTIFACT_SHA256,
    stagingProjectRef: process.env.STAGING_SUPABASE_PROJECT_ID,
    stagingAppUrl: process.env.STAGING_APP_URL,
  });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`);
}

const isCli =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) runCli();
