#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FULL_SHA = /^[0-9a-f]{40}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const PROJECT_REF = /^[a-z0-9]{20}$/;
const STAGING_PROJECT_REF = "xsiehskfgeoqyazcgauv";
const STAGING_SECURITY_SPECS = [
  "gdpr-delete-account.spec.ts",
  "onboarding-role-selection.spec.ts",
  "rls-security.spec.ts",
];
const READINESS_JOB = "Immutable release candidate built";
const STAGING_ATTESTATION_JOB = "Release candidate attested";
const APPROVAL_JOB = "Production release approved";
const DATABASE_JOB = "Production database migration gate";
const EDGE_JOB = "Deploy to Supabase";
const GITHUB_API = "https://api.github.com";

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

export function selectReadinessRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "push")
    .sort((a, b) =>
      Number(b.run_attempt ?? 0) - Number(a.run_attempt ?? 0) ||
      Number(b.id ?? 0) - Number(a.id ?? 0));

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
      Number(b.run_attempt ?? 0) - Number(a.run_attempt ?? 0) ||
      Number(b.id ?? 0) - Number(a.id ?? 0));

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
    attestation.schema_version !== 2 ||
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
    "security",
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
    ["security", "security"],
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
  return attestation;
}

export function selectBackendProofRun({ sha, runs, jobsByRun }) {
  const expectedSha = normalizeReleaseSha(sha);
  const candidates = (runs ?? [])
    .filter((run) =>
      String(run?.head_sha ?? "").toLowerCase() === expectedSha &&
      run?.event === "workflow_dispatch" &&
      run?.status === "completed")
    .sort((a, b) => Number(b.id ?? 0) - Number(a.id ?? 0));

  const match = candidates.find((run) => {
    const jobs = jobsByRun.get(run.id);
    return successfulJob(jobs, DATABASE_JOB, { suffix: true }) &&
      successfulJob(jobs, EDGE_JOB, { suffix: true });
  });
  if (!match) {
    throw new Error(
      `No single exact-SHA production release run proves both database and Edge deployment success for ${expectedSha}.`,
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

export function validateReleaseApproval({
  approval,
  sha,
  artifactSha256,
  stagingRunId,
  approvalRunId,
  deployActor,
  allowedApprovers,
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

  if (record.schema_version !== 1) {
    throw new Error("Release approval schema version is unsupported.");
  }
  if (normalizeReleaseSha(record.release_sha) !== expectedSha) {
    throw new Error("Release approval SHA does not match.");
  }
  if (
    requireSha256(record.artifact_sha256, "Approval artifact digest") !==
    expectedArtifact
  ) {
    throw new Error("Release approval artifact digest does not match.");
  }
  if (
    requirePositiveIntegerString(
      record.staging_run_id,
      "Approval staging run ID",
    ) !== expectedStagingRunId
  ) {
    throw new Error("Release approval staging run does not match.");
  }
  if (
    requirePositiveIntegerString(
      record.approval_run_id,
      "Approval run ID",
    ) !== expectedApprovalRunId
  ) {
    throw new Error("Release approval run does not match.");
  }
  if (record.revoked !== false) {
    throw new Error("Release approval revoked must be false.");
  }

  const approver = String(record.approver ?? "").trim();
  const allowlist = new Set(
    (allowedApprovers ?? [])
      .map((value) => String(value).trim().toLowerCase())
      .filter(Boolean),
  );
  if (!approver || !allowlist.has(approver.toLowerCase())) {
    throw new Error("Release approver is not allowlisted.");
  }
  const normalizedDeployActor = String(deployActor ?? "").trim().toLowerCase();
  if (!normalizedDeployActor) {
    throw new Error("Production deploy actor is required.");
  }
  if (approver.toLowerCase() === normalizedDeployActor) {
    throw new Error(
      "Production deployment requires independent approval by a different actor.",
    );
  }

  const approvedAt = requireDate(record.approved_at, "Approval time");
  const expiresAt = requireDate(record.expires_at, "Approval expiry");
  const nowDate = now instanceof Date ? now : new Date(now);
  if (approvedAt >= expiresAt) {
    throw new Error("Release approval expiry must follow approval time.");
  }
  if (expiresAt.getTime() - approvedAt.getTime() > 2 * 60 * 60 * 1000) {
    throw new Error("Release approval expiry must be no more than two hours.");
  }
  if (nowDate >= expiresAt) {
    throw new Error("Release approval has expired.");
  }
  return approval;
}

export function validateMutationLease({
  lease,
  sha,
  artifactSha256,
  stagingRunId,
  approvalRunId,
  productionRunId,
  now = new Date(),
}) {
  const record = requireRecord(lease, "Mutation lease");
  if (record.schema_version !== 1) {
    throw new Error("Mutation lease schema version is unsupported.");
  }
  if (normalizeReleaseSha(record.release_sha) !== normalizeReleaseSha(sha)) {
    throw new Error("Mutation lease release SHA does not match.");
  }
  if (
    requireSha256(record.artifact_sha256, "Mutation lease artifact digest") !==
    requireSha256(artifactSha256, "Expected artifact digest")
  ) {
    throw new Error("Mutation lease artifact digest does not match.");
  }

  for (const [field, expected, label] of [
    ["staging_run_id", stagingRunId, "staging run"],
    ["approval_run_id", approvalRunId, "approval run"],
    ["production_run_id", productionRunId, "production run"],
  ]) {
    if (
      requirePositiveIntegerString(record[field], `Mutation lease ${label}`) !==
      requirePositiveIntegerString(expected, `Expected ${label}`)
    ) {
      throw new Error(`Mutation lease ${label} does not match.`);
    }
  }

  const issuedAt = requireDate(record.issued_at, "Mutation lease issue time");
  const expiresAt = requireDate(record.expires_at, "Mutation lease expiry");
  const nowDate = now instanceof Date ? now : new Date(now);
  if (issuedAt >= expiresAt) {
    throw new Error("Mutation lease expiry must follow issue time.");
  }
  if (nowDate >= expiresAt) {
    throw new Error("Mutation lease has expired.");
  }
  return lease;
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

export function assertCloudflareDeployment({
  deployment,
  expectedProject,
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
    const payload = await githubJson(
      `/repos/${repository}/actions/runs/${run.id}/jobs?per_page=100`,
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
    validateReleaseApproval({
      approval,
      sha,
      artifactSha256: argValue("--artifact-sha256"),
      stagingRunId: argValue("--staging-run-id"),
      approvalRunId: argValue("--approval-run-id"),
      deployActor: argValue("--deploy-actor"),
      allowedApprovers: argValue("--allowed-approvers")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
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
    validateMutationLease({
      lease,
      sha,
      artifactSha256: argValue("--artifact-sha256"),
      stagingRunId: argValue("--staging-run-id"),
      approvalRunId: argValue("--approval-run-id"),
      productionRunId: argValue("--production-run-id"),
      now: argValue("--now") || undefined,
    });
    process.stdout.write(
      `Verified production mutation lease ${lease.production_run_id} for ${sha}.\n`,
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
      `Verified final CI readiness (${proof.readiness.html_url ?? proof.readiness.id}) ` +
      `and same-SHA backend proof (${proof.backend.html_url ?? proof.backend.id}).\n`,
    );
    return;
  }
  throw new Error(
    "Usage: production-release-validation.mjs <github-readiness|github-release-evidence|github-release-approval|github-staging-lease|github-recovery|cloudflare-deployment|release-candidate-attestation|release-approval|mutation-lease|supabase-target>",
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
