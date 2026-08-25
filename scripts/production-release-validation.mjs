#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  reconcileMigrationHistories,
  validateLegacyMigrationSchemaEvidence,
} from "./legacy-migration-reconciliation.mjs";
import { validateReleaseAuthorization } from "./production-break-glass-validation.mjs";

export {
  reconcileMigrationHistories,
  validateLegacyMigrationSchemaEvidence,
};

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const PROJECT_REF = /^[a-z0-9]{20}$/;
const STAGING_PROJECT_REF = "xsiehskfgeoqyazcgauv";
const PRODUCTION_PROJECT_REF = "qvvicunqcrwpioqnvzxf";
const STAGING_SECURITY_SPECS = [
  "gdpr-delete-account.spec.ts",
  "onboarding-role-selection.spec.ts",
  "rls-security.spec.ts",
];
const REQUIRED_CATALOGUE_ROUTES = [
  "/",
  "/listings",
  "/auctions",
  "/open-houses",
];
const CATALOGUE_WEB_VITAL_BUDGETS = {
  lcp_ms: 3000,
  cls: 0.1,
  inp_ms: 200,
};
const READINESS_JOB = "Immutable release candidate built";
const STAGING_ATTESTATION_JOB = "Release candidate attested";
const APPROVAL_JOB = "Production release approved";
const STRIPE_READINESS_JOB = "Verify exact-SHA Stripe live catalogue";
const DATABASE_JOB = "Production database migration gate";
const EDGE_JOB = "Deploy to Supabase";
const GITHUB_API = "https://api.github.com";
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const MAX_MUTATION_LEASE_MS = 15 * 60 * 1000;

export function normalizeReleaseSha(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(normalized)) {
    throw new Error("Release SHA must be a full 40-character Git commit SHA.");
  }
  return normalized;
}

function successfulJob(jobs, expectedName, { suffix = false } = {}) {
  return (jobs ?? []).some((job) => {
    const name = String(job?.name ?? "");
    const nameMatches = suffix
      ? name === expectedName || name.endsWith(` / ${expectedName}`)
      : name === expectedName;
    return nameMatches &&
      job?.status !== "in_progress" &&
      job?.conclusion === "success";
  });
}

function isOriginalManualAttempt(run) {
  const actor = String(run?.actor?.login ?? "").trim();
  const triggeringActor = String(run?.triggering_actor?.login ?? "").trim();
  return Number(run?.run_attempt) === 1 &&
    actor.length > 0 &&
    actor === triggeringActor;
}

export function selectReadinessRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "push")
    .sort((a, b) =>
      Number(b.id ?? 0) - Number(a.id ?? 0) ||
      Number(b.run_attempt ?? 0) - Number(a.run_attempt ?? 0));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(
      `No exact-SHA CI run exists for ${expectedSha}.`,
    );
  }
  if (
    latest.status !== "completed" ||
    latest.conclusion !== "success" ||
    !successfulJob(jobsByRun.get(latest.id), READINESS_JOB)
  ) {
    throw new Error(
      `The newest exact-SHA CI run does not have a successful "${READINESS_JOB}" job for ${expectedSha}.`,
    );
  }
  return latest;
}

export function selectStagingProofRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "workflow_run")
    .sort((a, b) =>
      Number(b.id ?? 0) - Number(a.id ?? 0) ||
      Number(b.run_attempt ?? 0) - Number(a.run_attempt ?? 0));

  const latest = candidates[0];
  if (!latest) {
    throw new Error(
      `No exact-SHA staging run exists for ${expectedSha}.`,
    );
  }
  if (
    latest.status !== "completed" ||
    latest.conclusion !== "success" ||
    !successfulJob(
      jobsByRun.get(latest.id),
      STAGING_ATTESTATION_JOB,
    )
  ) {
    throw new Error(
      `The newest exact-SHA staging run does not have a successful "${STAGING_ATTESTATION_JOB}" job for ${expectedSha}.`,
    );
  }
  return latest;
}

export function selectApprovalRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "workflow_dispatch" &&
      isOriginalManualAttempt(run) &&
      run?.status === "completed" &&
      run?.conclusion === "success")
    .sort((a, b) =>
      Number(b.id ?? 0) - Number(a.id ?? 0) ||
      Number(b.run_attempt ?? 0) - Number(a.run_attempt ?? 0));

  const match = candidates.find((run) =>
    successfulJob(jobsByRun.get(run.id), APPROVAL_JOB));
  if (!match) {
    throw new Error(
      `No successful exact-SHA approval run has a successful "${APPROVAL_JOB}" job for ${expectedSha}.`,
    );
  }
  return match;
}

export function selectStripeReadinessRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "workflow_dispatch" &&
      isOriginalManualAttempt(run) &&
      run?.status === "completed")
    .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));

  const latest = candidates[0];
  if (
    !latest ||
    latest.conclusion !== "success" ||
    !successfulJob(jobsByRun.get(latest.id), STRIPE_READINESS_JOB)
  ) {
    throw new Error(
      `The newest exact-SHA attempt-1 Stripe readiness run by the original triggering actor does not have a successful "${STRIPE_READINESS_JOB}" job for ${expectedSha}.`,
    );
  }
  return latest;
}

export function selectReleaseProofs({
  sha,
  readinessRuns,
  readinessJobsByRun,
  stagingRuns,
  stagingJobsByRun,
}) {
  return {
    readiness: selectReadinessRun({
      sha,
      runs: readinessRuns,
      jobsByRun: readinessJobsByRun,
    }),
    staging: selectStagingProofRun({
      sha,
      runs: stagingRuns,
      jobsByRun: stagingJobsByRun,
    }),
  };
}

function requirePositiveInteger(value, label) {
  const normalized = String(value ?? "");
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

function hasCompletePlaywrightStats(value, minimumExpected = 1) {
  return Number.isSafeInteger(value?.expected) &&
    value.expected >= minimumExpected &&
    value?.skipped === 0 &&
    value?.unexpected === 0 &&
    value?.flaky === 0 &&
    SHA256.test(String(value?.report_sha256 ?? ""));
}

function normalizedOrigin(value, label) {
  let parsed;
  try {
    parsed = new URL(String(value ?? ""));
  } catch {
    throw new Error(`${label} must be a valid HTTPS origin.`);
  }
  if (parsed.protocol !== "https:" || parsed.origin !== parsed.href.replace(/\/$/, "")) {
    throw new Error(`${label} must be a normalized HTTPS origin.`);
  }
  return parsed.origin;
}

export function validateReleaseCandidateAttestation({
  attestation,
  sha,
  sourceTree,
  sourceRunId,
  sourceRunAttempt,
  stagingRunId,
  stagingRunAttempt,
}) {
  const expectedSha = normalizeReleaseSha(sha);
  const expectedSourceTree = String(sourceTree ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(expectedSourceTree)) {
    throw new Error("Expected source tree must be a full 40-character Git tree SHA.");
  }
  if (!attestation || typeof attestation !== "object" || Array.isArray(attestation)) {
    throw new Error("Release candidate attestation must be a JSON object.");
  }
  if (
    attestation.schema_version !== 5 ||
    attestation.evidence_type !== "maiprop-release-candidate-attestation"
  ) {
    throw new Error("Release candidate attestation has an unsupported schema or evidence type.");
  }
  if (String(attestation.release_sha ?? "").toLowerCase() !== expectedSha) {
    throw new Error("Release candidate attestation does not match the exact release SHA.");
  }
  if (!FULL_SHA.test(String(attestation.source_tree ?? ""))) {
    throw new Error("Release candidate attestation has an invalid source tree.");
  }
  if (String(attestation.source_tree).toLowerCase() !== expectedSourceTree) {
    throw new Error("Release candidate attestation does not match the checked-out source tree.");
  }
  for (const [key, label] of [
    ["source_run_id", "Source run ID"],
    ["source_run_attempt", "Source run attempt"],
    ["staging_run_id", "Staging run ID"],
    ["staging_run_attempt", "Staging run attempt"],
  ]) {
    requirePositiveInteger(attestation[key], label);
  }
  if (
    String(attestation.source_run_id) !==
      requirePositiveInteger(sourceRunId, "Expected source run ID") ||
    String(attestation.source_run_attempt) !==
      requirePositiveInteger(sourceRunAttempt, "Expected source run attempt")
  ) {
    throw new Error("Release candidate attestation does not match the selected source run.");
  }
  if (
    String(attestation.staging_run_id) !==
      requirePositiveInteger(stagingRunId, "Expected staging run ID") ||
    String(attestation.staging_run_attempt) !==
      requirePositiveInteger(stagingRunAttempt, "Expected staging run attempt")
  ) {
    throw new Error("Release candidate attestation does not match the selected staging run.");
  }
  const supabaseArtifactBinding = attestation.artifact_bindings?.supabase;
  const expectedSupabaseArtifactName =
    `supabase-staging-edge-attestation-${expectedSha}-${attestation.staging_run_attempt}`;
  if (
    !supabaseArtifactBinding ||
    typeof supabaseArtifactBinding !== "object" ||
    Array.isArray(supabaseArtifactBinding) ||
    supabaseArtifactBinding.name !== expectedSupabaseArtifactName ||
    !/^[1-9][0-9]*$/.test(String(supabaseArtifactBinding.id ?? "")) ||
    !SHA256.test(String(supabaseArtifactBinding.digest ?? "")) ||
    String(supabaseArtifactBinding.run_id) !==
      String(attestation.staging_run_id) ||
    String(supabaseArtifactBinding.run_attempt) !==
      String(attestation.staging_run_attempt) ||
    String(supabaseArtifactBinding.release_sha ?? "").toLowerCase() !==
      expectedSha
  ) {
    throw new Error(
      "Release candidate attestation has an invalid Supabase artifact binding.",
    );
  }
  for (const [key, label] of [
    ["artifact_sha256", "artifact"],
    ["manifest_sha256", "manifest"],
    ["payload_sha256", "payload"],
  ]) {
    if (!SHA256.test(String(attestation[key] ?? ""))) {
      throw new Error(`Release candidate attestation has an invalid ${label} digest.`);
    }
  }
  for (const key of [
    "provenance",
    "supabase",
    "cloudflare",
    "business",
    "stripe_payment",
    "security",
    "n_minus_one",
    "catalogue_performance",
  ]) {
    if (!SHA256.test(String(attestation.evidence_sha256?.[key] ?? ""))) {
      throw new Error(`Release candidate attestation has an invalid ${key} evidence digest.`);
    }
  }
  if (!Array.isArray(attestation.provenance) || attestation.provenance.length === 0) {
    throw new Error("Release candidate attestation is missing source provenance evidence.");
  }
  for (const [key, label] of [
    ["supabase", "Supabase"],
    ["cloudflare", "Cloudflare"],
    ["business", "business"],
    ["stripe_payment", "Stripe payment"],
    ["security", "security"],
    ["n_minus_one", "N-1"],
    ["catalogue_performance", "catalogue performance"],
  ]) {
    const evidence = attestation[key];
    if (
      !evidence ||
      typeof evidence !== "object" ||
      String(evidence.release_sha ?? "").toLowerCase() !== expectedSha ||
      evidence.artifact_sha256 !== attestation.artifact_sha256
    ) {
      throw new Error(`${label} evidence does not match the exact release candidate.`);
    }
  }
  const stripePayment = attestation.stripe_payment;
  let stripePaymentOrigin;
  let stripeCloudflareOrigin;
  try {
    stripePaymentOrigin = new URL(String(stripePayment.target?.app_origin ?? ""));
    stripeCloudflareOrigin = new URL(
      String(attestation.cloudflare?.stable_url ?? ""),
    );
  } catch {
    throw new Error("Stripe payment evidence has an invalid staging app origin.");
  }
  if (
    stripePayment.schema_version !== 1 ||
    stripePayment.evidence_type !== "maiprop-staging-stripe-payment" ||
    stripePayment.ok !== true ||
    stripePayment.target?.supabase_project_ref !== STAGING_PROJECT_REF ||
    stripePayment.target.supabase_project_ref !==
      attestation.supabase?.database?.project_ref ||
    stripePaymentOrigin.protocol !== "https:" ||
    stripePaymentOrigin.origin !== stripeCloudflareOrigin.origin ||
    stripePayment.target?.stripe_mode !== "test" ||
    stripePayment.playwright?.spec !== "stripe-payment-complete.spec.ts" ||
    stripePayment.playwright?.test_title !==
      "completes test-card subscription checkout and observes synced entitlement" ||
    stripePayment.playwright?.expected !== 1 ||
    stripePayment.playwright?.skipped !== 0 ||
    stripePayment.playwright?.unexpected !== 0 ||
    stripePayment.playwright?.flaky !== 0 ||
    !SHA256.test(String(stripePayment.playwright?.report_sha256 ?? ""))
  ) {
    throw new Error(
      "Stripe payment evidence is incomplete or does not prove an isolated staging payment.",
    );
  }
  const security = attestation.security;
  let securityOrigin;
  let cloudflareOrigin;
  try {
    securityOrigin = new URL(String(security.target?.app_origin ?? ""));
    cloudflareOrigin = new URL(String(attestation.cloudflare?.stable_url ?? ""));
  } catch {
    throw new Error("Security or Cloudflare evidence has an invalid staging app origin.");
  }
  if (
    security.schema_version !== 1 ||
    security.evidence_type !== "maiprop-staging-live-security" ||
    security.ok !== true ||
    security.target?.supabase_project_ref !== STAGING_PROJECT_REF ||
    security.target.supabase_project_ref !==
      attestation.supabase?.database?.project_ref ||
    securityOrigin.protocol !== "https:" ||
    securityOrigin.origin !== cloudflareOrigin.origin ||
    JSON.stringify(security.playwright?.specs) !==
      JSON.stringify(STAGING_SECURITY_SPECS) ||
    !Number.isSafeInteger(security.playwright?.expected) ||
    security.playwright.expected < STAGING_SECURITY_SPECS.length ||
    security.playwright?.skipped !== 0 ||
    security.playwright?.unexpected !== 0 ||
    security.playwright?.flaky !== 0 ||
    !SHA256.test(String(security.playwright?.report_sha256 ?? ""))
  ) {
    throw new Error("Security evidence is incomplete or does not prove isolated staging.");
  }

  const nMinusOne = attestation.n_minus_one;
  if (
    nMinusOne.schema_version !== 1 ||
    nMinusOne.evidence_type !== "maiprop-staging-n-minus-one-compatibility" ||
    nMinusOne.ok !== true ||
    nMinusOne.staged_backend_project_ref !== STAGING_PROJECT_REF ||
    nMinusOne.staged_backend_project_ref !==
      attestation.supabase?.database?.project_ref ||
    !FULL_SHA.test(String(nMinusOne.previous_sha ?? "")) ||
    String(nMinusOne.previous_sha).toLowerCase() === expectedSha ||
    String(nMinusOne.source?.previous_sha ?? "").toLowerCase() !==
      String(nMinusOne.previous_sha).toLowerCase() ||
    !hasCompletePlaywrightStats(nMinusOne.playwright) ||
    !SHA256.test(String(nMinusOne.deploy_verification_sha256 ?? ""))
  ) {
    throw new Error("N-1 evidence is incomplete or does not prove the previous frontend against staged backend services.");
  }

  const performance = attestation.catalogue_performance;
  let deploymentOrigin;
  let performanceStableOrigin;
  try {
    deploymentOrigin = normalizedOrigin(
      performance.target?.deployment_origin,
      "Catalogue performance deployment origin",
    );
    performanceStableOrigin = normalizedOrigin(
      performance.target?.stable_origin,
      "Catalogue performance stable origin",
    );
  } catch {
    throw new Error("Catalogue performance evidence has invalid staging origins.");
  }
  const endpointBudget = performance.endpoint_budget;
  const routeE2e = performance.route_e2e;
  const cwvQuery = performance.cwv_query;
  const budgets = cwvQuery?.budgets;
  const routes = cwvQuery?.routes;
  const routeEvidenceComplete = REQUIRED_CATALOGUE_ROUTES.every((route) => {
    const measurement = routes?.[route];
    const query = measurement?.query;
    const queryBudget = query?.budget;
    return Number.isFinite(measurement?.lcp_ms) &&
      measurement.lcp_ms > 0 &&
      measurement.lcp_ms <= CATALOGUE_WEB_VITAL_BUDGETS.lcp_ms &&
      Number.isFinite(measurement?.cls) &&
      measurement.cls >= 0 &&
      measurement.cls <= CATALOGUE_WEB_VITAL_BUDGETS.cls &&
      Number.isFinite(measurement?.inp_ms) &&
      measurement.inp_ms >= 0 &&
      measurement.inp_ms <= CATALOGUE_WEB_VITAL_BUDGETS.inp_ms &&
      measurement.forbidden_authority_requests === 0 &&
      ["auth", "rest", "functions", "total"].every((key) =>
        Number.isSafeInteger(query?.[key]) &&
        query[key] >= 0 &&
        Number.isSafeInteger(queryBudget?.[key]) &&
        queryBudget[key] >= 0 &&
        query[key] <= queryBudget[key]
      );
  });
  if (
    performance.schema_version !== 1 ||
    performance.evidence_type !== "maiprop-staging-catalogue-performance" ||
    performance.ok !== true ||
    performance.target?.supabase_project_ref !== STAGING_PROJECT_REF ||
    performance.target.supabase_project_ref !==
      attestation.supabase?.database?.project_ref ||
    deploymentOrigin !==
      normalizedOrigin(
        attestation.cloudflare?.deployment_url,
        "Cloudflare staging deployment origin",
      ) ||
    performanceStableOrigin !== cloudflareOrigin.origin ||
    endpointBudget?.deployment_status !== "passed" ||
    endpointBudget?.stable_status !== "passed" ||
    !SHA256.test(String(endpointBudget?.deployment_report_sha256 ?? "")) ||
    !SHA256.test(String(endpointBudget?.stable_report_sha256 ?? "")) ||
    !hasCompletePlaywrightStats(routeE2e) ||
    routeE2e?.forbidden_authority_requests !== 0 ||
    !hasCompletePlaywrightStats(cwvQuery, REQUIRED_CATALOGUE_ROUTES.length) ||
    !SHA256.test(String(cwvQuery?.measurements_sha256 ?? "")) ||
    budgets?.lcp_ms !== CATALOGUE_WEB_VITAL_BUDGETS.lcp_ms ||
    budgets?.cls !== CATALOGUE_WEB_VITAL_BUDGETS.cls ||
    budgets?.inp_ms !== CATALOGUE_WEB_VITAL_BUDGETS.inp_ms ||
    !routeEvidenceComplete
  ) {
    throw new Error("Catalogue performance evidence is incomplete or exceeds an exact-SHA staging budget.");
  }
  return attestation;
}

export function selectBackendProofRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "workflow_dispatch" &&
      isOriginalManualAttempt(run) &&
      run?.status === "completed" &&
      Number.isSafeInteger(Number(run?.run_attempt)))
    .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));

  const match = candidates.find((run) => {
    const jobs = jobsByRun.get(run.id);
    return successfulJob(jobs, DATABASE_JOB, { suffix: true }) &&
      successfulJob(jobs, EDGE_JOB, { suffix: true });
  });
  if (!match) {
    throw new Error(
      `No single exact-SHA attempt-1 production release by the original triggering actor proves both database and Edge deployment success for ${expectedSha}.`,
    );
  }
  return match;
}

function projectRefFromApiUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL must be a valid URL.");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("SUPABASE_URL must use HTTPS.");
  }
  const match = parsed.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (!match) {
    throw new Error("SUPABASE_URL must use https://<project-ref>.supabase.co.");
  }
  return match[1];
}

function projectRefFromDatabaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Supabase database URL must be a valid Postgres URL.");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    throw new Error("Supabase database URL must use postgres:// or postgresql://.");
  }

  const directHost = parsed.hostname.match(
    /^db\.([a-z0-9]{20})\.supabase\.co$/,
  );
  if (directHost) return directHost[1];

  const username = decodeURIComponent(parsed.username);
  const poolerUser = username.match(/^postgres\.([a-z0-9]{20})$/);
  if (poolerUser && /\.pooler\.supabase\.com$/.test(parsed.hostname)) {
    return poolerUser[1];
  }

  throw new Error(
    "Supabase database URL does not expose a project ref through its direct host or pooler username.",
  );
}

export function assertSupabaseTargetIdentity({
  expectedRef,
  supabaseUrl,
  databaseUrl = "",
}) {
  const normalizedExpected = String(expectedRef ?? "").trim();
  if (!PROJECT_REF.test(normalizedExpected)) {
    throw new Error("Expected Supabase project ref must be 20 lowercase alphanumeric characters.");
  }

  const apiProjectRef = projectRefFromApiUrl(supabaseUrl);
  if (apiProjectRef !== normalizedExpected) {
    throw new Error(
      `Supabase API project ${apiProjectRef} does not match expected project ${normalizedExpected}.`,
    );
  }

  let databaseProjectRef = "";
  if (databaseUrl) {
    databaseProjectRef = projectRefFromDatabaseUrl(databaseUrl);
    if (databaseProjectRef !== normalizedExpected) {
      throw new Error(
        `Supabase database project ${databaseProjectRef} does not match expected project ${normalizedExpected}.`,
      );
    }
  }

  return {
    expectedRef: normalizedExpected,
    apiProjectRef,
    databaseProjectRef,
  };
}

function normalizedMigrationInventory(
  records,
  label,
  { requireExecutionFingerprint = false, requireFileDigest = false } = {},
) {
  if (!Array.isArray(records)) {
    throw new Error(`${label} must be an array.`);
  }
  const normalized = records.map((record) => {
    const value = requireRecord(record, `${label} record`);
    const version = String(value.version ?? "").trim();
    const name = String(value.name ?? "").trim();
    if (!/^\d{14}$/.test(version)) {
      throw new Error(
        `${label} contains an invalid migration version: ${version}`,
      );
    }
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw new Error(
        `${label} contains an invalid migration name for ${version}.`,
      );
    }
    const normalized = { version, name };
    if (requireFileDigest) {
      normalized.file_sha256 = requireSha256(
        value.file_sha256,
        `${label} ${version} file digest`,
      );
    }
    if (requireExecutionFingerprint) {
      const statementCount = Number(value.statement_count);
      if (!Number.isSafeInteger(statementCount) || statementCount < 1) {
        throw new Error(
          `${label} ${version} statement count must be a positive integer.`,
        );
      }
      if (value.statement_marker_only === true) {
        throw new Error(
          `${label} ${version} contains a filename-only migration marker instead of executed SQL.`,
        );
      }
      if (value.statement_marker_only !== false) {
        throw new Error(
          `${label} ${version} is missing its executed SQL marker verification.`,
        );
      }
      normalized.statements_sha256 = requireSha256(
        value.statements_sha256,
        `${label} ${version} executed SQL fingerprint`,
      );
      normalized.statement_count = statementCount;
      normalized.statement_marker_only = false;
    }
    return normalized;
  }).sort((left, right) =>
    left.version.localeCompare(right.version) ||
    left.name.localeCompare(right.name));
  const seen = new Set();
  for (const migration of normalized) {
    if (seen.has(migration.version)) {
      throw new Error(
        `${label} contains a duplicate staged migration version ${migration.version}.`,
      );
    }
    seen.add(migration.version);
  }
  return normalized;
}

export function assertMigrationPromotionPlan(staged, production) {
  const stagedInventory = normalizedMigrationInventory(
    staged,
    "Staged migration inventory",
    { requireExecutionFingerprint: true, requireFileDigest: true },
  );
  const productionInventory = normalizedMigrationInventory(
    production,
    "Production migration inventory",
    { requireExecutionFingerprint: true },
  );
  const stagedByVersion = new Map(
    stagedInventory.map((migration, index) => [migration.version, index]),
  );
  for (let index = 0; index < productionInventory.length; index += 1) {
    const migration = productionInventory[index];
    const expected = stagedInventory[index];
    if (!expected) {
      throw new Error(
        `Unknown production migration ${migration.version}_${migration.name}.`,
      );
    }
    if (expected.version !== migration.version) {
      if (stagedByVersion.has(migration.version)) {
        throw new Error(
          "Production migration history is not an exact staged prefix.",
        );
      }
      throw new Error(
        `Unknown production migration ${migration.version}_${migration.name}.`,
      );
    }
    if (expected.name !== migration.name) {
      throw new Error(
        `Production migration version-name drift at ${migration.version}: ` +
        `${migration.name} !== ${expected.name}.`,
      );
    }
    if (
      expected.statements_sha256 !== migration.statements_sha256 ||
      expected.statement_count !== migration.statement_count
    ) {
      throw new Error(
        `Production executed SQL fingerprint drift at ${migration.version}.`,
      );
    }
  }
  const pending = stagedInventory.slice(productionInventory.length);
  return {
    staged: stagedInventory,
    production: productionInventory,
    pending,
    pending_files: pending.map(
      ({ version, name }) => `${version}_${name}.sql`,
    ),
  };
}

export function assertMigrationDryRunParity(pending, dryRunFiles) {
  const expected = normalizedMigrationInventory(
    pending,
    "Pending staged migration inventory",
    { requireExecutionFingerprint: true, requireFileDigest: true },
  ).map(({ version, name }) => `${version}_${name}.sql`);
  if (!Array.isArray(dryRunFiles)) {
    throw new Error("Supabase dry-run migration inventory must be an array.");
  }
  const actual = dryRunFiles.map((value) => {
    const file = String(value ?? "").trim().replaceAll("\\", "/")
      .split("/").at(-1);
    if (!/^\d{14}_[A-Za-z0-9_-]+\.sql$/.test(file ?? "")) {
      throw new Error(
        `Supabase dry-run migration inventory contains an invalid file: ${value}`,
      );
    }
    return file;
  }).sort((left, right) => left.localeCompare(right));
  if (
    new Set(actual).size !== actual.length ||
    JSON.stringify(expected) !== JSON.stringify(actual)
  ) {
    throw new Error(
      "Supabase dry-run migration inventory does not exactly match staged pending migrations.",
    );
  }
  return actual;
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return value;
}

function requireSha256(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/i.test(normalized)) {
    throw new Error(`${label} must be a SHA-256 digest.`);
  }
  return normalized;
}

function requirePositiveIntegerString(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return normalized;
}

function requireDate(value, label) {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${label} must be an ISO date.`);
  }
  return date;
}

function requireRepository(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(normalized)) {
    throw new Error(`${label} must be in owner/name form.`);
  }
  return normalized;
}

function requireFullSha(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!FULL_SHA.test(normalized)) {
    throw new Error(`${label} must be a full 40-character Git SHA.`);
  }
  return normalized;
}

function requireOpaqueId(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(normalized)) {
    throw new Error(`${label} must be a valid opaque identifier.`);
  }
  return normalized;
}

function requireExactKeys(record, expectedKeys, label) {
  const actual = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new Error(`${label} has unsupported or missing fields.`);
  }
}

function validatedApprovalAuthorization({
  record,
  expectedAuthorization,
  expectedSha,
  expectedApprovalRunId,
  approvalRunAttempt,
  approver,
  now,
}) {
  if (expectedAuthorization === undefined) {
    throw new Error("Expected release authorization is required for approval schema 2.");
  }
  const expectedContext = {
    action: "production-approval",
    actor: approver,
    releaseSha: expectedSha,
    runId: expectedApprovalRunId,
    runAttempt: requirePositiveIntegerString(
      approvalRunAttempt,
      "Expected approval run attempt",
    ),
  };
  const options = { now };
  const expected = validateReleaseAuthorization(
    expectedAuthorization,
    expectedContext,
    options,
  );
  const actual = validateReleaseAuthorization(
    record.authorization,
    expected,
    options,
  );
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Release approval authorization does not match expected evidence.");
  }
  return actual;
}

export function validateReleaseApproval({
  approval,
  sha,
  repository,
  sourceTree,
  sourceRunId,
  sourceRunAttempt,
  artifactSha256,
  stagingRunId,
  stagingRunAttempt,
  approvalRunId,
  approvalRunAttempt,
  deployActor,
  allowedApprovers,
  expectedAuthorization,
  now = new Date(),
}) {
  const record = requireRecord(approval, "Release approval");
  const expectedSha = normalizeReleaseSha(sha);
  const expectedArtifact = requireSha256(
    artifactSha256,
    "Expected artifact digest",
  );
  const expectedStagingRunId = requirePositiveIntegerString(
    stagingRunId,
    "Expected staging run ID",
  );
  const expectedApprovalRunId = requirePositiveIntegerString(
    approvalRunId,
    "Expected approval run ID",
  );

  if (record.schema_version !== 1 && record.schema_version !== 2) {
    throw new Error("Release approval schema version is unsupported.");
  }
  if (normalizeReleaseSha(record.release_sha) !== expectedSha) {
    throw new Error("Release approval SHA does not match.");
  }
  if (
    requireRepository(record.repository, "Approval repository") !==
    requireRepository(repository, "Expected repository")
  ) {
    throw new Error("Release approval repository does not match.");
  }
  if (
    requireFullSha(record.source_tree, "Approval source tree") !==
    requireFullSha(sourceTree, "Expected source tree")
  ) {
    throw new Error("Release approval source tree does not match.");
  }
  if (
    requireSha256(record.artifact_sha256, "Approval artifact digest") !==
    expectedArtifact
  ) {
    throw new Error("Release approval artifact digest does not match.");
  }
  for (const [field, expected, label] of [
    ["source_run_id", sourceRunId, "source run"],
    ["source_run_attempt", sourceRunAttempt, "source run attempt"],
    ["staging_run_id", expectedStagingRunId, "staging run"],
    ["staging_run_attempt", stagingRunAttempt, "staging run attempt"],
    ["approval_run_id", expectedApprovalRunId, "approval run"],
    ["approval_run_attempt", approvalRunAttempt, "approval run attempt"],
  ]) {
    if (
      requirePositiveIntegerString(record[field], `Approval ${label}`) !==
      requirePositiveIntegerString(expected, `Expected ${label}`)
    ) {
      throw new Error(`Release approval ${label} does not match.`);
    }
  }
  requireSha256(record.nonce, "Approval nonce");
  if (record.revoked !== false) {
    throw new Error("Release approval revoked must be false.");
  }

  const approver = String(record.approver ?? "").trim();
  if (!approver) {
    throw new Error("Release approver is required.");
  }
  let authorization;
  if (record.schema_version === 1) {
    requireExactKeys(record, [
      "schema_version",
      "repository",
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "artifact_sha256",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "approver",
      "nonce",
      "revoked",
      "approved_at",
      "expires_at",
    ], "Release approval schema 1");
    if (expectedAuthorization !== undefined) {
      if (expectedAuthorization?.mode !== "standard") {
        throw new Error("Release approval schema 1 is standard-only.");
      }
      const expected = validateReleaseAuthorization(
        expectedAuthorization,
        {
          mode: "standard",
          action: "production-approval",
          actor: approver,
          releaseSha: expectedSha,
        },
        { now, allowHistoricalExpiry: true },
      );
      if (expected.mode !== "standard") throw new Error("Release approval schema 1 is standard-only.");
    }
  } else {
    requireExactKeys(record, [
      "schema_version",
      "repository",
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "artifact_sha256",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "approver",
      "nonce",
      "revoked",
      "approved_at",
      "expires_at",
      "authorization",
    ], "Release approval schema 2");
    authorization = validatedApprovalAuthorization({
      record,
      expectedAuthorization,
      expectedSha,
      expectedApprovalRunId,
      approvalRunAttempt,
      approver,
      now,
    });
  }
  const allowlist = new Set(
    (allowedApprovers ?? [])
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean),
  );
  const normalizedDeployActor = String(deployActor ?? "").trim().toLowerCase();
  if (!normalizedDeployActor) {
    throw new Error("Production deploy actor is required.");
  }
  if (authorization?.mode === "break_glass") {
    if (
      authorization.actor !== approver.toLowerCase() ||
      authorization.actor !== normalizedDeployActor
    ) {
      throw new Error(
        "Break-glass approval requires the authorized approver and deploy actor.",
      );
    }
  } else {
    if (!allowlist.has(approver.toLowerCase())) {
      throw new Error("Release approver is not allowlisted.");
    }
    if (approver.toLowerCase() === normalizedDeployActor) {
      throw new Error(
        "Production deployment requires independent approval by a different actor.",
      );
    }
  }

  const approvedAt = requireDate(record.approved_at, "Approval time");
  const expiresAt = requireDate(record.expires_at, "Approval expiry");
  const nowDate = requireDate(now, "Validation time");
  if (approvedAt >= expiresAt) {
    throw new Error("Release approval expiry must follow approval time.");
  }
  if (approvedAt.getTime() > nowDate.getTime() + MAX_CLOCK_SKEW_MS) {
    throw new Error("Release approval time is materially in the future.");
  }
  if (expiresAt.getTime() - approvedAt.getTime() > 2 * 60 * 60 * 1000) {
    throw new Error("Release approval expiry must be no more than two hours.");
  }
  let effectiveExpiry = expiresAt.getTime();
  if (authorization?.mode === "break_glass") {
    const authorizedExpiry = requireDate(
      authorization.authorized_expires_at,
      "Authorization expiry",
    );
    if (approvedAt >= authorizedExpiry) {
      throw new Error("Break-glass authorization expiry must follow approval time.");
    }
    effectiveExpiry = Math.min(effectiveExpiry, authorizedExpiry.getTime());
  }
  if (nowDate.getTime() >= effectiveExpiry) {
    throw new Error("Release approval has expired.");
  }
  return approval;
}

export function validateMutationLease({
  lease,
  sha,
  repository,
  sourceTree,
  artifactSha256,
  approvalNonce,
  expectedAuthorization,
  expectedConsumption,
  sourceRunId,
  sourceRunAttempt,
  stagingRunId,
  stagingRunAttempt,
  approvalRunId,
  approvalRunAttempt,
  productionRunId,
  productionRunAttempt,
  stripeReadinessRunId,
  stripeReadinessRunAttempt,
  stripeReadinessSha256,
  stripeReadinessArtifactId,
  stripeReadinessArtifactDigest,
  rollbackDeploymentId,
  rollbackSha,
  candidateDeploymentId,
  candidateSha,
  now = new Date(),
}) {
  const record = requireRecord(lease, "Mutation lease");
  if (record.schema_version !== 2 && record.schema_version !== 3) {
    throw new Error("Mutation lease schema version is unsupported.");
  }
  if (record.schema_version === 2) {
    if (
      expectedAuthorization !== undefined &&
      expectedAuthorization?.mode !== "standard"
    ) {
      throw new Error("Mutation lease schema 2 is standard-only.");
    }
    if (
      expectedConsumption !== undefined ||
      Object.hasOwn(record, "authorization") ||
      Object.hasOwn(record, "consumption")
    ) {
      throw new Error("Mutation lease schema 2 cannot contain consumption evidence.");
    }
    if (expectedAuthorization !== undefined) {
      validateReleaseAuthorization(expectedAuthorization, {
        mode: "standard",
        action: "production-deploy",
        releaseSha: sha,
      }, { now });
    }
  } else {
    if (expectedAuthorization === undefined) {
      throw new Error("Expected release authorization is required for mutation lease schema 3.");
    }
    if (expectedAuthorization?.mode !== "break_glass") {
      throw new Error("Mutation lease schema 3 requires break-glass authorization.");
    }
    if (expectedConsumption === undefined) {
      throw new Error("Expected consumption is required for mutation lease schema 3.");
    }
    const expectedProductionRunAttempt = requirePositiveIntegerString(
      productionRunAttempt,
      "Expected production run attempt",
    );
    if (expectedProductionRunAttempt !== "1") {
      throw new Error("Mutation lease schema 3 must use production run attempt 1.");
    }
    const authorizationContext = {
      mode: "break_glass",
      action: "production-deploy",
      releaseSha: sha,
      runId: requirePositiveIntegerString(
        productionRunId,
        "Expected production run ID",
      ),
      runAttempt: expectedProductionRunAttempt,
    };
    const expectedValidatedAuthorization = validateReleaseAuthorization(
      expectedAuthorization,
      authorizationContext,
      { now },
    );
    const actualAuthorization = validateReleaseAuthorization(
      record.authorization,
      expectedValidatedAuthorization,
      { now },
    );
    if (
      JSON.stringify(actualAuthorization) !==
      JSON.stringify(expectedValidatedAuthorization)
    ) {
      throw new Error("Mutation lease authorization does not match expected evidence.");
    }

    const validateConsumption = (value, label) => {
      const consumption = requireRecord(value, label);
      requireExactKeys(consumption, [
        "artifact_id",
        "artifact_digest",
        "binding_artifact_id",
        "payload_sha256",
        "action",
        "incident_id",
        "release_sha",
        "parent_run_id",
      ], label);
      const artifactDigest = requireSha256(
        consumption.artifact_digest,
        `${label} artifact digest`,
      );
      if (consumption.artifact_digest !== artifactDigest) {
        throw new Error(`${label} artifact digest must be exact lowercase hexadecimal.`);
      }
      const payloadSha256 = requireSha256(
        consumption.payload_sha256,
        `${label} payload digest`,
      );
      if (consumption.payload_sha256 !== payloadSha256) {
        throw new Error(`${label} payload digest must be exact lowercase hexadecimal.`);
      }
      const releaseSha = normalizeReleaseSha(consumption.release_sha);
      if (consumption.release_sha !== releaseSha) {
        throw new Error(`${label} release SHA must be exact lowercase hexadecimal.`);
      }
      const normalized = {
        artifact_id: requirePositiveIntegerString(
          consumption.artifact_id,
          `${label} artifact ID`,
        ),
        artifact_digest: artifactDigest,
        binding_artifact_id: requirePositiveIntegerString(
          consumption.binding_artifact_id,
          `${label} binding artifact ID`,
        ),
        payload_sha256: payloadSha256,
        action: String(consumption.action ?? ""),
        incident_id: String(consumption.incident_id ?? ""),
        release_sha: releaseSha,
        parent_run_id: requirePositiveIntegerString(
          consumption.parent_run_id,
          `${label} parent run ID`,
        ),
      };
      if (normalized.action !== "production-deploy") {
        throw new Error(`${label} action must be production-deploy.`);
      }
      if (normalized.incident_id !== actualAuthorization.incident_id) {
        throw new Error(`${label} incident does not match authorization.`);
      }
      if (normalized.release_sha !== normalizeReleaseSha(sha)) {
        throw new Error(`${label} release SHA does not match.`);
      }
      if (
        normalized.parent_run_id !==
        requirePositiveIntegerString(productionRunId, "Expected production run ID")
      ) {
        throw new Error(`${label} parent run does not match.`);
      }
      return normalized;
    };
    const expectedValidatedConsumption = validateConsumption(
      expectedConsumption,
      "Expected consumption",
    );
    const actualConsumption = validateConsumption(
      record.consumption,
      "Mutation lease consumption",
    );
    if (
      JSON.stringify(actualConsumption) !==
      JSON.stringify(expectedValidatedConsumption)
    ) {
      throw new Error("Mutation lease consumption does not match expected evidence.");
    }
  }
  if (normalizeReleaseSha(record.release_sha) !== normalizeReleaseSha(sha)) {
    throw new Error("Mutation lease release SHA does not match.");
  }
  if (
    requireRepository(record.repository, "Mutation lease repository") !==
    requireRepository(repository, "Expected repository")
  ) {
    throw new Error("Mutation lease repository does not match.");
  }
  if (
    requireFullSha(record.source_tree, "Mutation lease source tree") !==
    requireFullSha(sourceTree, "Expected source tree")
  ) {
    throw new Error("Mutation lease source tree does not match.");
  }
  if (
    requireSha256(record.artifact_sha256, "Mutation lease artifact digest") !==
    requireSha256(artifactSha256, "Expected artifact digest")
  ) {
    throw new Error("Mutation lease artifact digest does not match.");
  }
  if (
    requireSha256(record.approval_nonce, "Mutation lease approval nonce") !==
    requireSha256(approvalNonce, "Expected approval nonce")
  ) {
    throw new Error("Mutation lease approval nonce does not match.");
  }
  requireSha256(record.nonce, "Mutation lease nonce");

  for (const [field, expected, label] of [
    ["source_run_id", sourceRunId, "source run"],
    ["source_run_attempt", sourceRunAttempt, "source run attempt"],
    ["staging_run_id", stagingRunId, "staging run"],
    ["staging_run_attempt", stagingRunAttempt, "staging run attempt"],
    ["approval_run_id", approvalRunId, "approval run"],
    ["approval_run_attempt", approvalRunAttempt, "approval run attempt"],
    ["production_run_id", productionRunId, "production run"],
    [
      "production_run_attempt",
      productionRunAttempt,
      "production run attempt",
    ],
  ]) {
    if (
      requirePositiveIntegerString(record[field], `Mutation lease ${label}`) !==
      requirePositiveIntegerString(expected, `Expected ${label}`)
    ) {
      throw new Error(`Mutation lease ${label} does not match.`);
    }
  }

  const stripeReadinessRecordValues = [
    record.stripe_readiness_run_id,
    record.stripe_readiness_run_attempt,
    record.stripe_readiness_sha256,
    record.stripe_readiness_artifact_id,
    record.stripe_readiness_artifact_digest,
    record.stripe_readiness_checked_at,
  ];
  const stripeReadinessExpectedValues = [
    stripeReadinessRunId,
    stripeReadinessRunAttempt,
    stripeReadinessSha256,
    stripeReadinessArtifactId,
    stripeReadinessArtifactDigest,
  ];
  const hasStripeReadinessBinding = [
    ...stripeReadinessRecordValues,
    ...stripeReadinessExpectedValues,
  ].some((value) => String(value ?? "").trim().length > 0);
  if (!hasStripeReadinessBinding) {
    throw new Error("Mutation lease Stripe readiness binding is required.");
  }
  let stripeReadinessCheckedAt;
  if (hasStripeReadinessBinding) {
    const actualRunId = requirePositiveIntegerString(
      record.stripe_readiness_run_id,
      "Mutation lease Stripe readiness run",
    );
    const actualRunAttempt = requirePositiveIntegerString(
      record.stripe_readiness_run_attempt,
      "Mutation lease Stripe readiness run attempt",
    );
    if (actualRunAttempt !== "1") {
      throw new Error("Mutation lease Stripe readiness must use attempt 1.");
    }
    const actualDigest = requireSha256(
      record.stripe_readiness_sha256,
      "Mutation lease Stripe readiness digest",
    );
    const actualArtifactId = requirePositiveIntegerString(
      record.stripe_readiness_artifact_id,
      "Mutation lease Stripe readiness artifact",
    );
    const actualArtifactDigest = requireSha256(
      record.stripe_readiness_artifact_digest,
      "Mutation lease Stripe readiness artifact digest",
    );
    stripeReadinessCheckedAt = requireDate(
      record.stripe_readiness_checked_at,
      "Mutation lease Stripe readiness check time",
    );

    if (
      stripeReadinessExpectedValues.some(
        (value) => String(value ?? "").trim().length > 0,
      )
    ) {
      const expectedRunId = requirePositiveIntegerString(
        stripeReadinessRunId,
        "Expected Stripe readiness run",
      );
      const expectedRunAttempt = requirePositiveIntegerString(
        stripeReadinessRunAttempt,
        "Expected Stripe readiness run attempt",
      );
      if (expectedRunAttempt !== "1") {
        throw new Error("Expected Stripe readiness must use attempt 1.");
      }
      const expectedDigest = requireSha256(
        stripeReadinessSha256,
        "Expected Stripe readiness digest",
      );
      const expectedArtifactId = requirePositiveIntegerString(
        stripeReadinessArtifactId,
        "Expected Stripe readiness artifact",
      );
      const expectedArtifactDigest = requireSha256(
        stripeReadinessArtifactDigest,
        "Expected Stripe readiness artifact digest",
      );
      if (actualRunId !== expectedRunId) {
        throw new Error("Mutation lease Stripe readiness run does not match.");
      }
      if (actualRunAttempt !== expectedRunAttempt) {
        throw new Error(
          "Mutation lease Stripe readiness run attempt does not match.",
        );
      }
      if (actualDigest !== expectedDigest) {
        throw new Error(
          "Mutation lease Stripe readiness digest does not match.",
        );
      }
      if (actualArtifactId !== expectedArtifactId) {
        throw new Error(
          "Mutation lease Stripe readiness artifact does not match.",
        );
      }
      if (actualArtifactDigest !== expectedArtifactDigest) {
        throw new Error(
          "Mutation lease Stripe readiness artifact digest does not match.",
        );
      }
    }
  }

  const rollbackIdentityRequested = [
    rollbackDeploymentId,
    rollbackSha,
    candidateDeploymentId,
    candidateSha,
  ].some((value) => String(value ?? "").trim().length > 0);
  if (rollbackIdentityRequested) {
    const expectedRollbackId = requireOpaqueId(
      rollbackDeploymentId,
      "Expected rollback deployment",
    );
    const expectedCandidateId = requireOpaqueId(
      candidateDeploymentId,
      "Expected candidate deployment",
    );
    if (
      requireOpaqueId(
        record.rollback_deployment_id,
        "Mutation lease rollback deployment",
      ) !== expectedRollbackId
    ) {
      throw new Error("Mutation lease rollback deployment does not match.");
    }
    if (
      requireFullSha(record.rollback_sha, "Mutation lease rollback SHA") !==
      requireFullSha(rollbackSha, "Expected rollback SHA")
    ) {
      throw new Error("Mutation lease rollback SHA does not match.");
    }
    if (
      requireOpaqueId(
        record.candidate_deployment_id,
        "Mutation lease candidate deployment",
      ) !== expectedCandidateId
    ) {
      throw new Error("Mutation lease candidate deployment does not match.");
    }
    if (
      requireFullSha(record.candidate_sha, "Mutation lease candidate SHA") !==
      requireFullSha(candidateSha, "Expected candidate SHA")
    ) {
      throw new Error("Mutation lease candidate SHA does not match.");
    }
    if (expectedRollbackId === expectedCandidateId) {
      throw new Error("Rollback and candidate deployments must differ.");
    }
    if (
      requireFullSha(rollbackSha, "Expected rollback SHA") ===
      requireFullSha(candidateSha, "Expected candidate SHA")
    ) {
      throw new Error("Rollback and candidate SHAs must differ.");
    }
  }

  const issuedAt = requireDate(record.issued_at, "Mutation lease issue time");
  const expiresAt = requireDate(record.expires_at, "Mutation lease expiry");
  const nowDate = requireDate(now, "Validation time");
  if (issuedAt >= expiresAt) {
    throw new Error("Mutation lease expiry must follow issue time.");
  }
  if (issuedAt.getTime() > nowDate.getTime() + MAX_CLOCK_SKEW_MS) {
    throw new Error("Mutation lease issue time is materially in the future.");
  }
  if (expiresAt.getTime() - issuedAt.getTime() > MAX_MUTATION_LEASE_MS) {
    throw new Error("Mutation lease expiry must be no more than 15 minutes.");
  }
  if (
    stripeReadinessCheckedAt.getTime() >
      issuedAt.getTime() + MAX_CLOCK_SKEW_MS ||
    stripeReadinessCheckedAt.getTime() >
      nowDate.getTime() + MAX_CLOCK_SKEW_MS
  ) {
    throw new Error(
      "Mutation lease Stripe readiness check time is materially in the future.",
    );
  }
  if (
    !rollbackIdentityRequested &&
    expiresAt.getTime() - stripeReadinessCheckedAt.getTime() >
    MAX_MUTATION_LEASE_MS
  ) {
    throw new Error(
      "Mutation lease cannot extend Stripe readiness beyond 15 minutes.",
    );
  }
  if (nowDate >= expiresAt) {
    throw new Error("Mutation lease has expired.");
  }
  return lease;
}

export function validateProductionPromotionAttestations({
  database,
  edge,
  repository,
  sha,
  sourceTree,
  sourceRunId,
  sourceRunAttempt,
  stagingRunId,
  stagingRunAttempt,
  approvalRunId,
  approvalRunAttempt,
  productionRunId,
  productionRunAttempt,
  artifactSha256,
  manifestSha256,
  supabaseSha256,
  databaseSha256,
  edgeSha256,
}) {
  const databaseRecord = requireRecord(
    database,
    "Production database attestation",
  );
  const edgeRecord = requireRecord(edge, "Production Edge attestation");
  const expectedDatabaseSha256 = requireSha256(
    databaseSha256,
    "Expected database attestation digest",
  );
  requireSha256(edgeSha256, "Expected Edge attestation digest");
  const expected = {
    repository: requireRepository(repository, "Expected repository"),
    release_sha: normalizeReleaseSha(sha),
    source_tree: requireFullSha(sourceTree, "Expected source tree"),
    source_run_id: requirePositiveIntegerString(
      sourceRunId,
      "Expected source run",
    ),
    source_run_attempt: requirePositiveIntegerString(
      sourceRunAttempt,
      "Expected source run attempt",
    ),
    staging_run_id: requirePositiveIntegerString(
      stagingRunId,
      "Expected staging run",
    ),
    staging_run_attempt: requirePositiveIntegerString(
      stagingRunAttempt,
      "Expected staging run attempt",
    ),
    approval_run_id: requirePositiveIntegerString(
      approvalRunId,
      "Expected approval run",
    ),
    approval_run_attempt: requirePositiveIntegerString(
      approvalRunAttempt,
      "Expected approval run attempt",
    ),
    production_run_id: requirePositiveIntegerString(
      productionRunId,
      "Expected production run",
    ),
    production_run_attempt: requirePositiveIntegerString(
      productionRunAttempt,
      "Expected production run attempt",
    ),
    artifact_sha256: requireSha256(
      artifactSha256,
      "Expected artifact digest",
    ),
    manifest_sha256: requireSha256(
      manifestSha256,
      "Expected manifest digest",
    ),
    supabase_sha256: requireSha256(
      supabaseSha256,
      "Expected Supabase digest",
    ),
    project_ref: PRODUCTION_PROJECT_REF,
  };
  const labels = {
    repository: "repository",
    release_sha: "release SHA",
    source_tree: "source tree",
    source_run_id: "source run",
    source_run_attempt: "source run attempt",
    staging_run_id: "staging run",
    staging_run_attempt: "staging run attempt",
    approval_run_id: "approval run",
    approval_run_attempt: "approval run attempt",
    production_run_id: "production run",
    production_run_attempt: "production run attempt",
    artifact_sha256: "artifact digest",
    manifest_sha256: "manifest digest",
    supabase_sha256: "Supabase digest",
    project_ref: "project ref",
  };

  for (const [record, evidenceType, name] of [
    [
      databaseRecord,
      "maiprop-production-database-promotion",
      "Production database attestation",
    ],
    [
      edgeRecord,
      "maiprop-production-edge-promotion",
      "Production Edge attestation",
    ],
  ]) {
    if (
      record.schema_version !== 1 ||
      record.evidence_type !== evidenceType
    ) {
      throw new Error(`${name} has an unsupported schema or evidence type.`);
    }
    for (const [field, expectedValue] of Object.entries(expected)) {
      const actualValue = String(record[field] ?? "").toLowerCase();
      if (actualValue !== String(expectedValue).toLowerCase()) {
        throw new Error(`${name} ${labels[field]} does not match.`);
      }
    }
  }

  if (
    requireSha256(
      edgeRecord.production_database_sha256,
      "Edge database attestation digest",
    ) !== expectedDatabaseSha256
  ) {
    throw new Error(
      "Production Edge database attestation digest does not match.",
    );
  }
  if (
    !Array.isArray(edgeRecord.edge_bundles) ||
    edgeRecord.edge_bundles.length === 0 ||
    edgeRecord.edge_bundles.some(
      (bundle) =>
        !bundle ||
        typeof bundle.name !== "string" ||
        bundle.name.trim().length === 0 ||
        !SHA256.test(String(bundle.ezbr_sha256 ?? "")) ||
        typeof bundle.verify_jwt !== "boolean",
    )
  ) {
    throw new Error(
      "Production Edge attestation must contain a valid deployed bundle inventory.",
    );
  }
  return { database, edge };
}

export function validateStagingLease({
  readinessRun,
  releaseSha,
  sourceRunId,
  sourceRunAttempt,
  mainSha,
  repository,
}) {
  const run = requireRecord(readinessRun, "CI readiness run");
  const expectedSha = normalizeReleaseSha(releaseSha);
  if (normalizeReleaseSha(run.head_sha) !== expectedSha) {
    throw new Error("CI readiness run SHA does not match the staging release.");
  }
  if (run.event !== "push" || run.head_branch !== "main") {
    throw new Error("Staging requires a trusted main push CI run.");
  }
  if (
    requirePositiveIntegerString(run.id, "CI readiness run ID") !==
    requirePositiveIntegerString(sourceRunId, "Expected source run ID")
  ) {
    throw new Error("CI readiness run ID does not match the staging source.");
  }
  if (
    requirePositiveIntegerString(
      run.run_attempt,
      "CI readiness run attempt",
    ) !==
    requirePositiveIntegerString(
      sourceRunAttempt,
      "Expected source run attempt",
    )
  ) {
    throw new Error("CI readiness run attempt does not match the staging source.");
  }
  if (normalizeReleaseSha(mainSha) !== expectedSha) {
    throw new Error("The staging release is no longer the current main SHA.");
  }
  const expectedRepository = String(repository ?? "").trim().toLowerCase();
  const sourceRepository = String(
    run.head_repository?.full_name ?? "",
  ).trim().toLowerCase();
  if (
    expectedRepository &&
    sourceRepository &&
    sourceRepository !== expectedRepository
  ) {
    throw new Error("CI readiness run came from a different repository.");
  }
  return run;
}

function normalizedEdgeBundles(records, label) {
  if (!Array.isArray(records)) {
    throw new Error(`${label} must be an array.`);
  }
  const normalized = records.map((record) => {
    const value = requireRecord(record, `${label} record`);
    const name = String(value.name ?? "").trim();
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw new Error(`${label} contains an invalid function name.`);
    }
    if (typeof value.verify_jwt !== "boolean") {
      throw new Error(`${label} ${name} verify_jwt must be boolean.`);
    }
    return {
      name,
      ezbr_sha256: requireSha256(
        value.ezbr_sha256,
        `${label} ${name} bundle digest`,
      ),
      verify_jwt: value.verify_jwt,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
  if (new Set(normalized.map((record) => record.name)).size !== normalized.length) {
    throw new Error(`${label} contains duplicate functions.`);
  }
  return normalized;
}

export function buildEdgeForwardConvergencePlan(staging, production) {
  const expected = normalizedEdgeBundles(staging, "Staging Edge inventory");
  const actual = normalizedEdgeBundles(
    production,
    "Production Edge inventory",
  );
  const expectedByName = new Map(
    expected.map((record) => [record.name, record]),
  );
  const actualByName = new Map(actual.map((record) => [record.name, record]));

  for (const record of actual) {
    if (!expectedByName.has(record.name)) {
      throw new Error(
        `Unexpected production Edge function ${record.name}; forward convergence never deletes functions.`,
      );
    }
  }

  const pending = expected.filter((record) => {
    const deployed = actualByName.get(record.name);
    return !deployed ||
      deployed.ezbr_sha256 !== record.ezbr_sha256 ||
      deployed.verify_jwt !== record.verify_jwt;
  });
  return {
    expected,
    production: actual,
    pending,
    pending_names: pending.map((record) => record.name),
  };
}

export function assertEdgeBundleParity(staging, production) {
  const expected = normalizedEdgeBundles(staging, "Staging Edge inventory");
  const actual = normalizedEdgeBundles(
    production,
    "Production Edge inventory",
  );
  const expectedNames = expected.map((record) => record.name);
  const actualNames = actual.map((record) => record.name);
  if (JSON.stringify(expectedNames) !== JSON.stringify(actualNames)) {
    throw new Error(
      "Staging and production Edge function sets do not match.",
    );
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (
      expected[index].ezbr_sha256 !== actual[index].ezbr_sha256
    ) {
      throw new Error(
        `Edge bundle digest mismatch for ${expected[index].name}.`,
      );
    }
    if (expected[index].verify_jwt !== actual[index].verify_jwt) {
      throw new Error(
        `Edge verify_jwt mismatch for ${expected[index].name}.`,
      );
    }
  }
  return expected;
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateEdgeSourceManifest(value, label) {
  const manifest = requireRecord(value, label);
  if (
    manifest.schema_version !== 1 ||
    manifest.algorithm !== "sha256" ||
    !FULL_SHA.test(String(manifest.release_sha ?? "")) ||
    !SHA256.test(String(manifest.config_sha256 ?? "")) ||
    !SHA256.test(String(manifest.manifest_sha256 ?? ""))
  ) {
    throw new Error(`${label} is incomplete or invalid.`);
  }
  const shared = requireRecord(manifest.shared, `${label} shared source`);
  if (
    !SHA256.test(String(shared.source_sha256 ?? "")) ||
    !Array.isArray(shared.files) ||
    !Array.isArray(manifest.functions) ||
    manifest.functions.length === 0
  ) {
    throw new Error(`${label} is incomplete or invalid.`);
  }
  for (const fn of manifest.functions) {
    const record = requireRecord(fn, `${label} function`);
    if (
      !/^[A-Za-z0-9_-]+$/.test(String(record.name ?? "")) ||
      typeof record.verify_jwt !== "boolean" ||
      !SHA256.test(String(record.source_sha256 ?? "")) ||
      !SHA256.test(String(record.effective_source_sha256 ?? "")) ||
      !Array.isArray(record.files)
    ) {
      throw new Error(`${label} contains an invalid function source record.`);
    }
  }
  return manifest;
}

export function assertEdgeSourceManifestParity(staging, candidate) {
  const expected = validateEdgeSourceManifest(
    staging,
    "Staging Edge source manifest",
  );
  const actual = validateEdgeSourceManifest(
    candidate,
    "Candidate Edge source manifest",
  );
  if (canonicalJson(expected) !== canonicalJson(actual)) {
    throw new Error(
      "Candidate Edge source manifest does not exactly match the staged Edge source manifest.",
    );
  }
  return expected;
}

export function assertCloudflareDeployment({
  deployment,
  expectedProject,
  expectedProjectId,
  expectedEnvironment,
  expectedBranch,
  expectedSha,
}) {
  const record = requireRecord(deployment, "Cloudflare deployment");
  const metadata = requireRecord(
    record.deployment_trigger?.metadata,
    "Cloudflare deployment metadata",
  );
  const stage = requireRecord(
    record.latest_stage,
    "Cloudflare deployment latest stage",
  );
  if (
    typeof expectedProjectId !== "string" ||
    expectedProjectId.trim().length === 0 ||
    String(record.project_id ?? "") !== expectedProjectId.trim()
  ) {
    throw new Error("Cloudflare deployment project ID does not match.");
  }
  if (String(record.project_name ?? "") !== String(expectedProject)) {
    throw new Error("Cloudflare deployment project does not match.");
  }
  if (record.environment !== expectedEnvironment) {
    throw new Error("Cloudflare deployment environment does not match.");
  }
  if (metadata.branch !== expectedBranch) {
    throw new Error("Cloudflare deployment branch does not match.");
  }
  if (
    normalizeReleaseSha(metadata.commit_hash) !==
    normalizeReleaseSha(expectedSha)
  ) {
    throw new Error("Cloudflare deployment SHA does not match.");
  }
  if (metadata.commit_dirty !== false) {
    throw new Error("Cloudflare deployment is marked dirty.");
  }
  if (record.is_skipped !== false) {
    throw new Error("Cloudflare deployment was skipped.");
  }
  if (record.uses_functions !== true) {
    throw new Error("Cloudflare deployment does not use Pages Functions.");
  }
  if (stage.name !== "deploy" || stage.status !== "success") {
    throw new Error("Cloudflare deployment did not finish successfully.");
  }
  let url;
  try {
    url = new URL(String(record.url ?? ""));
  } catch {
    throw new Error("Cloudflare deployment URL is invalid.");
  }
  if (url.protocol !== "https:" || !url.hostname.endsWith(".pages.dev")) {
    throw new Error("Cloudflare deployment URL is not a Pages HTTPS origin.");
  }
  return deployment;
}

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? "" : "";
}

function jsonFileArg(name, label, options = {}) {
  const file = argValue(name);
  if (!file) {
    if (options.required === false) return undefined;
    throw new Error(`${label} file is required.`);
  }
  return JSON.parse(readFileSync(file, "utf8"));
}

async function githubJson(path, token) {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "maiprop-production-release-validation/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned HTTP ${response.status}: ${body.slice(0, 240)}`);
  }
  return JSON.parse(body);
}

async function workflowRuns({ repository, workflow, sha, token }) {
  const query = new URLSearchParams({
    head_sha: sha,
    per_page: "100",
  });
  const payload = await githubJson(
    `/repos/${repository}/actions/workflows/${workflow}/runs?${query}`,
    token,
  );
  return payload.workflow_runs ?? [];
}

async function jobsForRuns({ repository, runs, token }) {
  const entries = await Promise.all((runs ?? []).map(async (run) => {
    const runAttempt = Number(run?.run_attempt);
    if (!Number.isSafeInteger(runAttempt) || runAttempt <= 0) {
      throw new Error(`GitHub workflow run ${run?.id ?? "unknown"} has no valid run attempt.`);
    }
    const payload = await githubJson(
      `/repos/${repository}/actions/runs/${run.id}/attempts/${runAttempt}/jobs?per_page=100`,
      token,
    );
    return [run.id, payload.jobs ?? []];
  }));
  return new Map(entries);
}

async function verifyGithubReadiness({ repository, sha, token }) {
  const runs = await workflowRuns({
    repository,
    workflow: "ci.yml",
    sha,
    token,
  });
  const jobsByRun = await jobsForRuns({ repository, runs, token });
  return selectReadinessRun({ sha, runs, jobsByRun });
}

async function verifyGithubReleaseEvidence({ repository, sha, token }) {
  const [readinessRuns, stagingRuns] = await Promise.all([
    workflowRuns({
      repository,
      workflow: "ci.yml",
      sha,
      token,
    }),
    workflowRuns({
      repository,
      workflow: "stage-release.yml",
      sha,
      token,
    }),
  ]);
  const [readinessJobsByRun, stagingJobsByRun] = await Promise.all([
    jobsForRuns({ repository, runs: readinessRuns, token }),
    jobsForRuns({ repository, runs: stagingRuns, token }),
  ]);
  return selectReleaseProofs({
    sha,
    readinessRuns,
    readinessJobsByRun,
    stagingRuns,
    stagingJobsByRun,
  });
}

async function verifyGithubReleaseApproval({ repository, sha, token }) {
  const runs = await workflowRuns({
    repository,
    workflow: "approve-production-release.yml",
    sha,
    token,
  });
  const jobsByRun = await jobsForRuns({ repository, runs, token });
  return selectApprovalRun({ sha, runs, jobsByRun });
}

async function verifyGithubStripeReadiness({ repository, sha, token }) {
  const runs = await workflowRuns({
    repository,
    workflow: "verify-stripe-live-readiness.yml",
    sha,
    token,
  });
  const jobsByRun = await jobsForRuns({ repository, runs, token });
  return selectStripeReadinessRun({ sha, runs, jobsByRun });
}

async function verifyGithubStagingLease({
  repository,
  sha,
  sourceRunId,
  sourceRunAttempt,
  token,
}) {
  const readinessRun = await verifyGithubReadiness({
    repository,
    sha,
    token,
  });
  const branch = await githubJson(
    `/repos/${repository}/branches/main`,
    token,
  );
  return validateStagingLease({
    readinessRun,
    releaseSha: sha,
    sourceRunId,
    sourceRunAttempt,
    mainSha: branch?.commit?.sha,
    repository,
  });
}

async function verifyGithubRecovery({ repository, sha, token }) {
  const readiness = await verifyGithubReadiness({ repository, sha, token });
  const runs = await workflowRuns({
    repository,
    workflow: "deploy-production-release.yml",
    sha,
    token,
  });
  const jobsByRun = await jobsForRuns({ repository, runs, token });
  const backend = selectBackendProofRun({ sha, runs, jobsByRun });
  return { readiness, backend };
}

async function main() {
  const mode = process.argv[2] ?? "";
  if (mode === "supabase-target") {
    const result = assertSupabaseTargetIdentity({
      expectedRef: process.env.SUPABASE_PROJECT_REF,
      supabaseUrl: process.env.SUPABASE_URL,
      databaseUrl: process.env.SUPABASE_PRODUCTION_DB_URL ?? "",
    });
    process.stdout.write(
      `${JSON.stringify({
        evidence_type: "supabase-release-target-identity",
        verified: true,
        ...result,
      }, null, 2)}\n`,
    );
    return;
  }

  const sha = normalizeReleaseSha(argValue("--sha"));
  if (mode === "cloudflare-deployment") {
    const deployment = JSON.parse(
      readFileSync(argValue("--file"), "utf8"),
    );
    assertCloudflareDeployment({
      deployment,
      expectedProject: argValue("--project"),
      expectedProjectId: argValue("--project-id"),
      expectedEnvironment: argValue("--environment"),
      expectedBranch: argValue("--branch"),
      expectedSha: sha,
    });
    process.stdout.write(
      `Verified exact Cloudflare deployment ${deployment.id ?? "<unknown>"}.\n`,
    );
    return;
  }
  if (mode === "release-candidate-attestation") {
    const attestation = JSON.parse(
      readFileSync(argValue("--file"), "utf8"),
    );
    validateReleaseCandidateAttestation({
      attestation,
      sha,
      sourceTree: argValue("--source-tree"),
      sourceRunId: argValue("--source-run-id"),
      sourceRunAttempt: argValue("--source-run-attempt"),
      stagingRunId: argValue("--staging-run-id"),
      stagingRunAttempt: argValue("--staging-run-attempt"),
    });
    process.stdout.write(
      `${JSON.stringify({
        evidence_type: "maiprop-release-candidate-attestation-verification",
        verified: true,
        release_sha: sha,
        source_tree: String(attestation.source_tree),
        source_run_id: String(attestation.source_run_id),
        source_run_attempt: String(attestation.source_run_attempt),
        staging_run_id: String(attestation.staging_run_id),
        staging_run_attempt: String(attestation.staging_run_attempt),
        artifact_sha256: attestation.artifact_sha256,
        manifest_sha256: attestation.manifest_sha256,
        payload_sha256: attestation.payload_sha256,
      }, null, 2)}\n`,
    );
    return;
  }
  if (mode === "release-approval") {
    const approval = JSON.parse(
      readFileSync(argValue("--file"), "utf8"),
    );
    const expectedAuthorization = jsonFileArg(
      "--authorization-file",
      "Release authorization",
      { required: approval.schema_version === 2 },
    );
    validateReleaseApproval({
      approval,
      sha,
      repository: argValue("--repository"),
      sourceTree: argValue("--source-tree"),
      sourceRunId: argValue("--source-run-id"),
      sourceRunAttempt: argValue("--source-run-attempt"),
      artifactSha256: argValue("--artifact-sha256"),
      stagingRunId: argValue("--staging-run-id"),
      stagingRunAttempt: argValue("--staging-run-attempt"),
      approvalRunId: argValue("--approval-run-id"),
      approvalRunAttempt: argValue("--approval-run-attempt"),
      deployActor: argValue("--deploy-actor"),
      allowedApprovers: argValue("--allowed-approvers")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      expectedAuthorization,
      now: argValue("--now") || undefined,
    });
    process.stdout.write(
      `Verified release approval ${approval.approval_run_id} for ${sha}.\n`,
    );
    return;
  }
  if (mode === "mutation-lease") {
    const lease = JSON.parse(
      readFileSync(argValue("--file"), "utf8"),
    );
    const expectedAuthorization = jsonFileArg(
      "--authorization-file",
      "Release authorization",
      { required: lease.schema_version === 3 },
    );
    const expectedConsumption = jsonFileArg(
      "--consumption-file",
      "Break-glass consumption",
      { required: lease.schema_version === 3 },
    );
    validateMutationLease({
      lease,
      sha,
      repository: argValue("--repository"),
      sourceTree: argValue("--source-tree"),
      artifactSha256: argValue("--artifact-sha256"),
      approvalNonce: argValue("--approval-nonce"),
      expectedAuthorization,
      expectedConsumption,
      sourceRunId: argValue("--source-run-id"),
      sourceRunAttempt: argValue("--source-run-attempt"),
      stagingRunId: argValue("--staging-run-id"),
      stagingRunAttempt: argValue("--staging-run-attempt"),
      approvalRunId: argValue("--approval-run-id"),
      approvalRunAttempt: argValue("--approval-run-attempt"),
      productionRunId: argValue("--production-run-id"),
      productionRunAttempt: argValue("--production-run-attempt"),
      stripeReadinessRunId: argValue("--stripe-readiness-run-id"),
      stripeReadinessRunAttempt: argValue("--stripe-readiness-run-attempt"),
      stripeReadinessSha256: argValue("--stripe-readiness-sha256"),
      stripeReadinessArtifactId: argValue("--stripe-readiness-artifact-id"),
      stripeReadinessArtifactDigest: argValue(
        "--stripe-readiness-artifact-digest",
      ),
      rollbackDeploymentId: argValue("--rollback-deployment-id"),
      rollbackSha: argValue("--rollback-sha"),
      candidateDeploymentId: argValue("--candidate-deployment-id"),
      candidateSha: argValue("--candidate-sha"),
      now: argValue("--now") || undefined,
    });
    process.stdout.write(
      `Verified production mutation lease ${lease.production_run_id} for ${sha}.\n`,
    );
    return;
  }
  if (mode === "production-upstream-attestations") {
    const database = JSON.parse(
      readFileSync(argValue("--database-file"), "utf8"),
    );
    const edge = JSON.parse(
      readFileSync(argValue("--edge-file"), "utf8"),
    );
    validateProductionPromotionAttestations({
      database,
      edge,
      repository: argValue("--repository"),
      sha,
      sourceTree: argValue("--source-tree"),
      sourceRunId: argValue("--source-run-id"),
      sourceRunAttempt: argValue("--source-run-attempt"),
      stagingRunId: argValue("--staging-run-id"),
      stagingRunAttempt: argValue("--staging-run-attempt"),
      approvalRunId: argValue("--approval-run-id"),
      approvalRunAttempt: argValue("--approval-run-attempt"),
      productionRunId: argValue("--production-run-id"),
      productionRunAttempt: argValue("--production-run-attempt"),
      artifactSha256: argValue("--artifact-sha256"),
      manifestSha256: argValue("--manifest-sha256"),
      supabaseSha256: argValue("--supabase-sha256"),
      databaseSha256: argValue("--database-sha256"),
      edgeSha256: argValue("--edge-sha256"),
    });
    process.stdout.write(
      `${JSON.stringify({
        schema_version: 1,
        evidence_type: "maiprop-production-upstream-attestation-verification",
        verified: true,
        release_sha: sha,
        database_sha256: argValue("--database-sha256"),
        edge_sha256: argValue("--edge-sha256"),
      }, null, 2)}\n`,
    );
    return;
  }

  const repository = argValue("--repository");
  const token = process.env.GITHUB_TOKEN ?? "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new Error("--repository must be in owner/name form.");
  }
  if (!token) throw new Error("GITHUB_TOKEN is required.");

  if (mode === "github-readiness") {
    const run = await verifyGithubReadiness({ repository, sha, token });
    process.stdout.write(
      `Verified final exact-SHA CI readiness in run ${run.html_url ?? run.id}.\n`,
    );
    return;
  }
  if (mode === "github-release-evidence") {
    const proof = await verifyGithubReleaseEvidence({
      repository,
      sha,
      token,
    });
    process.stdout.write(
      `${JSON.stringify({
        evidence_type: "maiprop-github-release-evidence-selection",
        release_sha: sha,
        readiness_run_id: String(proof.readiness.id),
        readiness_run_attempt: String(proof.readiness.run_attempt),
        staging_run_id: String(proof.staging.id),
        staging_run_attempt: String(proof.staging.run_attempt),
      }, null, 2)}\n`,
    );
    return;
  }
  if (mode === "github-release-approval") {
    const run = await verifyGithubReleaseApproval({
      repository,
      sha,
      token,
    });
    process.stdout.write(
      `${JSON.stringify({
        evidence_type: "maiprop-github-release-approval-selection",
        release_sha: sha,
        approval_run_id: String(run.id),
        approval_run_attempt: String(run.run_attempt),
        approver: String(run.actor?.login ?? ""),
      }, null, 2)}\n`,
    );
    return;
  }
  if (mode === "github-stripe-readiness") {
    const run = await verifyGithubStripeReadiness({ repository, sha, token });
    process.stdout.write(
      `${JSON.stringify({
        evidence_type: "maiprop-github-stripe-readiness-selection",
        release_sha: sha,
        stripe_readiness_run_id: String(run.id),
        stripe_readiness_run_attempt: String(run.run_attempt),
        verifier: String(run.actor?.login ?? ""),
      }, null, 2)}\n`,
    );
    return;
  }
  if (mode === "github-staging-lease") {
    const run = await verifyGithubStagingLease({
      repository,
      sha,
      sourceRunId: argValue("--source-run-id"),
      sourceRunAttempt: argValue("--source-run-attempt"),
      token,
    });
    process.stdout.write(
      `Verified current-main staging lease from CI run ${run.html_url ?? run.id}.\n`,
    );
    return;
  }
  if (mode === "github-recovery") {
    const proof = await verifyGithubRecovery({ repository, sha, token });
    process.stdout.write(
      `${JSON.stringify({
        evidence_type: "maiprop-github-recovery-selection",
        release_sha: sha,
        readiness_run_id: String(proof.readiness.id),
        readiness_run_attempt: String(proof.readiness.run_attempt),
        backend_run_id: String(proof.backend.id),
        backend_run_attempt: String(proof.backend.run_attempt),
      }, null, 2)}\n`,
    );
    return;
  }
  throw new Error(
    "Usage: production-release-validation.mjs <github-readiness|github-release-evidence|github-release-approval|github-stripe-readiness|github-staging-lease|github-recovery|cloudflare-deployment|release-candidate-attestation|release-approval|mutation-lease|production-upstream-attestations|supabase-target>",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
