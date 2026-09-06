#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const STAGING_PROJECT_REF = "xsiehskfgeoqyazcgauv";
const STRIPE_PAYMENT_SPEC = "stripe-payment-complete.spec.ts";
const STRIPE_PAYMENT_TEST_TITLE =
  "completes test-card subscription checkout and observes synced entitlement";
const STRIPE_PAYMENT_PROJECT = "chromium";

function fail(message) {
  throw new Error(`Staging Stripe payment evidence ${message}`);
}

function normalizeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    fail("requires a valid HTTPS origin.");
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/"
  ) {
    fail("requires a normalized HTTPS origin without credentials, path, query, or fragment.");
  }
  return parsed.origin;
}

function collectSpecs(suites, rows = []) {
  for (const suite of Array.isArray(suites) ? suites : []) {
    for (const spec of Array.isArray(suite?.specs) ? suite.specs : []) {
      rows.push(spec);
    }
    collectSpecs(suite?.suites, rows);
  }
  return rows;
}

function isExactPaymentSpecFile(value) {
  const file = String(value ?? "").replaceAll("\\", "/");
  return file === STRIPE_PAYMENT_SPEC ||
    file.endsWith(`/e2e/${STRIPE_PAYMENT_SPEC}`);
}

function exactPaymentTest(report) {
  const matches = collectSpecs(report?.suites).filter((spec) =>
    isExactPaymentSpecFile(spec?.file) &&
    spec?.title === STRIPE_PAYMENT_TEST_TITLE
  );
  if (matches.length !== 1) {
    fail("must contain exactly one exact Stripe payment test identity.");
  }
  const spec = matches[0];
  const tests = Array.isArray(spec.tests) ? spec.tests : [];
  if (tests.length !== 1) {
    fail("exact Stripe payment test must contain one browser project result.");
  }
  const test = tests[0];
  const results = Array.isArray(test.results) ? test.results : [];
  const statuses = results.map((result) => String(result?.status ?? ""));
  if (
    spec.ok !== true ||
    test.projectName !== STRIPE_PAYMENT_PROJECT ||
    test.expectedStatus !== "passed" ||
    test.status !== "expected" ||
    statuses.length === 0 ||
    statuses.some((status) => status !== "passed")
  ) {
    fail("exact Stripe payment test has a non-passing recorded result.");
  }
  return {
    file: STRIPE_PAYMENT_SPEC,
    title: spec.title,
    projectName: test.projectName,
    statuses,
  };
}

export function createStagingStripePaymentEvidence({
  report,
  reportBytes,
  releaseSha,
  artifactSha256,
  supabaseProjectRef,
  appOrigin,
}) {
  const normalizedSha = String(releaseSha ?? "").trim().toLowerCase();
  const normalizedArtifact = String(artifactSha256 ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(normalizedSha)) fail("requires a full release SHA.");
  if (!SHA256.test(normalizedArtifact)) fail("requires a valid artifact digest.");
  if (supabaseProjectRef !== STAGING_PROJECT_REF) {
    fail(`must target staging Supabase ${STAGING_PROJECT_REF}.`);
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    fail("report must be a JSON object.");
  }
  const stats = report.stats ?? {};
  if (stats.expected !== 1) {
    fail("must contain exactly one expected browser test.");
  }
  if (stats.skipped !== 0 || stats.unexpected !== 0 || stats.flaky !== 0) {
    fail("requires zero skipped, unexpected, and flaky browser tests.");
  }
  const paymentTest = exactPaymentTest(report);
  const bytes = Buffer.isBuffer(reportBytes)
    ? reportBytes
    : Buffer.from(reportBytes ?? JSON.stringify(report));

  return {
    schema_version: 1,
    evidence_type: "maiprop-staging-stripe-payment",
    ok: true,
    release_sha: normalizedSha,
    artifact_sha256: normalizedArtifact,
    target: {
      supabase_project_ref: STAGING_PROJECT_REF,
      app_origin: normalizeOrigin(appOrigin),
      stripe_mode: "test",
    },
    playwright: {
      spec: paymentTest.file,
      test_title: paymentTest.title,
      project_name: paymentTest.projectName,
      outcome: "passed",
      result_statuses: paymentTest.statuses,
      expected: stats.expected,
      skipped: stats.skipped,
      unexpected: stats.unexpected,
      flaky: stats.flaky,
      report_sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      fail("arguments must be --name value pairs.");
    }
    args[key.slice(2)] = value;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const reportPath = resolve(args.report ?? "");
  const reportBytes = readFileSync(reportPath);
  const evidence = createStagingStripePaymentEvidence({
    report: JSON.parse(reportBytes.toString("utf8")),
    reportBytes,
    releaseSha: args["release-sha"],
    artifactSha256: args["artifact-sha256"],
    supabaseProjectRef: args["supabase-project-ref"],
    appOrigin: args["app-origin"],
  });
  writeFileSync(
    resolve(args.out ?? "staging-stripe-payment-proof.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
