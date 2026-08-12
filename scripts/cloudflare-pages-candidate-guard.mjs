import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RELEASE_SHA_RE = /^[0-9a-f]{40}$/;

function assertOk(condition, message) {
  if (!condition) throw new Error(message);
}

function requiredString(value, label) {
  assertOk(
    typeof value === "string" && value.trim().length > 0,
    `${label} is required.`,
  );
  return value.trim();
}

function releaseSha(value, label = "Release SHA") {
  const normalized = requiredString(value, label).toLowerCase();
  assertOk(RELEASE_SHA_RE.test(normalized), `${label} must be a full SHA.`);
  return normalized;
}

function deploymentList(envelope, label) {
  assertOk(
    envelope?.success === true && Array.isArray(envelope.result),
    `${label} must be a successful Cloudflare Pages deployment-list response.`,
  );
  for (const deployment of envelope.result) {
    assertOk(
      deployment &&
        typeof deployment === "object" &&
        typeof deployment.id === "string" &&
        deployment.id.length > 0,
      `${label} contains a malformed deployment.`,
    );
  }
  return envelope.result;
}

function deploymentIdentity(deployment, label) {
  assertOk(
    deployment && typeof deployment === "object" && !Array.isArray(deployment),
    `${label} is missing or malformed.`,
  );
  const id = requiredString(deployment.id, `${label} deployment ID`);
  const projectId = requiredString(
    deployment.project_id,
    `${label} project ID`,
  );
  const projectName = requiredString(
    deployment.project_name,
    `${label} project name`,
  );
  const environment = requiredString(
    deployment.environment,
    `${label} environment`,
  );
  const branch = requiredString(
    deployment.deployment_trigger?.metadata?.branch,
    `${label} branch`,
  );
  const sha = releaseSha(
    deployment.deployment_trigger?.metadata?.commit_hash,
    `${label} commit SHA`,
  );
  const status = requiredString(
    deployment.latest_stage?.status,
    `${label} deployment status`,
  );
  assertOk(
    deployment.latest_stage?.name === "deploy",
    `${label} latest stage must be deploy.`,
  );
  assertOk(
    typeof deployment.deployment_trigger?.metadata?.commit_dirty === "boolean",
    `${label} commit_dirty must be boolean.`,
  );
  assertOk(
    typeof deployment.uses_functions === "boolean",
    `${label} uses_functions must be boolean.`,
  );
  return {
    id,
    projectId,
    projectName,
    environment,
    branch,
    sha,
    status,
    commitDirty: deployment.deployment_trigger.metadata.commit_dirty,
    usesFunctions: deployment.uses_functions,
    isSkipped: deployment.is_skipped,
  };
}

function canonicalDeployment(envelope, expectedProjectName, expectedProjectId) {
  assertOk(
    envelope?.success === true &&
      envelope.result &&
      typeof envelope.result === "object" &&
      !Array.isArray(envelope.result) &&
      envelope.result.name === expectedProjectName &&
      envelope.result.id === expectedProjectId,
    "Current Cloudflare Pages project response does not match the immutable project identity.",
  );
  return deploymentIdentity(
    envelope.result.canonical_deployment,
    "Current canonical deployment",
  );
}

function isExactCandidate(identity, expected) {
  return identity.projectName === expected.projectName &&
    identity.projectId === expected.projectId &&
    identity.environment === "production" &&
    identity.branch === "main" &&
    identity.sha === expected.releaseSha &&
    identity.commitDirty === false &&
    identity.usesFunctions === true &&
    identity.isSkipped === false &&
    identity.status === "success";
}

function resolveCloudflarePagesApiCandidate({
  mutationAttempted,
  beforeDeploymentsApi,
  afterDeploymentsApi,
  currentProjectApi,
  expectedProjectName,
  expectedProjectId,
  releaseSha: expectedReleaseSha,
}) {
  assertOk(
    mutationAttempted === true,
    "Cloudflare Pages mutation was not durably recorded before reconciliation.",
  );
  const projectName = requiredString(
    expectedProjectName,
    "Expected project name",
  );
  const projectId = requiredString(expectedProjectId, "Expected project ID");
  const normalizedReleaseSha = releaseSha(expectedReleaseSha);
  const expected = {
    projectName,
    projectId,
    releaseSha: normalizedReleaseSha,
  };
  const beforeIds = new Set(
    deploymentList(beforeDeploymentsApi, "Pre-mutation deployment list")
      .map((deployment) => deployment.id),
  );
  const matches = deploymentList(
    afterDeploymentsApi,
    "Post-mutation deployment list",
  )
    .filter((deployment) => !beforeIds.has(deployment.id))
    .map((deployment) => ({
      deployment,
      identity: deploymentIdentity(deployment, "Candidate deployment"),
    }))
    .filter(({ identity }) => isExactCandidate(identity, expected));

  assertOk(
    matches.length > 0,
    "No new exact-SHA Cloudflare Pages candidate was found after the recorded mutation.",
  );
  assertOk(
    matches.length === 1,
    "Multiple new exact-SHA Cloudflare Pages candidates were found after the recorded mutation.",
  );
  const candidate = matches[0].identity;
  const canonical = canonicalDeployment(
    currentProjectApi,
    projectName,
    projectId,
  );
  assertOk(
    canonical.id === candidate.id && canonical.sha === candidate.sha,
    "The reconciled Cloudflare Pages candidate did not become the canonical deployment.",
  );
  assertOk(
    isExactCandidate(canonical, expected),
    "Current canonical deployment is not the exact successful candidate.",
  );
  return candidate;
}

function candidateReceipt(candidate, { evidenceType, status, resolution }) {
  return {
    schema_version: 1,
    evidence_type: evidenceType,
    status,
    mutation_attempted: true,
    resolution,
    project_id: candidate.projectId,
    project_name: candidate.projectName,
    deployment_id: candidate.id,
    release_sha: candidate.sha,
    environment: candidate.environment,
    branch: candidate.branch,
    commit_dirty: candidate.commitDirty,
    uses_functions: candidate.usesFunctions,
    deployment_status: candidate.status,
    canonical_at_reconciliation: true,
  };
}

export function resolveCloudflarePagesCandidateReceipt(options) {
  const candidate = resolveCloudflarePagesApiCandidate(options);
  const reportedId = requiredString(
    options.reportedDeploymentId,
    "Provider-reported deployment ID",
  );
  assertOk(
    reportedId === candidate.id,
    "Wrangler reported deployment ID does not match the reconciled candidate.",
  );

  return candidateReceipt(candidate, {
    evidenceType: "maiprop-pages-candidate-receipt",
    status: "reconciled",
    resolution: "new-exact-sha-set-difference",
  });
}

export function resolveCloudflarePagesRecoveryReceipt(options) {
  return candidateReceipt(resolveCloudflarePagesApiCandidate(options), {
    evidenceType: "maiprop-pages-candidate-recovery-receipt",
    status: "api-reconciled",
    resolution: "new-exact-sha-set-difference-api-only",
  });
}

export function authorizeCloudflarePagesRollback({
  currentProjectApi,
  candidateReceipt,
  rollbackTarget,
  expectedProjectName,
  expectedProjectId,
  releaseSha: expectedReleaseSha,
}) {
  const projectName = requiredString(
    expectedProjectName,
    "Expected project name",
  );
  const projectId = requiredString(expectedProjectId, "Expected project ID");
  const normalizedReleaseSha = releaseSha(expectedReleaseSha);
  const receiptKindIsValid =
    (candidateReceipt?.evidence_type === "maiprop-pages-candidate-receipt" &&
      candidateReceipt?.status === "reconciled" &&
      candidateReceipt?.resolution === "new-exact-sha-set-difference") ||
    (candidateReceipt?.evidence_type ===
        "maiprop-pages-candidate-recovery-receipt" &&
      candidateReceipt?.status === "api-reconciled" &&
      candidateReceipt?.resolution ===
        "new-exact-sha-set-difference-api-only");
  assertOk(
    candidateReceipt?.schema_version === 1 &&
      receiptKindIsValid &&
      candidateReceipt?.mutation_attempted === true &&
      candidateReceipt?.project_name === projectName &&
      candidateReceipt?.project_id === projectId &&
      candidateReceipt?.release_sha === normalizedReleaseSha &&
      typeof candidateReceipt?.deployment_id === "string" &&
      candidateReceipt.deployment_id.length > 0 &&
      candidateReceipt?.environment === "production" &&
      candidateReceipt?.branch === "main" &&
      candidateReceipt?.commit_dirty === false &&
      candidateReceipt?.uses_functions === true &&
      candidateReceipt?.deployment_status === "success" &&
      candidateReceipt?.canonical_at_reconciliation === true,
    "Candidate receipt is missing, malformed, or belongs to another release.",
  );
  const rollback = deploymentIdentity(rollbackTarget, "Rollback target");
  assertOk(
    rollback.projectName === projectName &&
      rollback.projectId === projectId &&
      rollback.environment === "production" &&
      rollback.branch === "main" &&
      rollback.commitDirty === false &&
      rollback.usesFunctions === true &&
      rollback.isSkipped === false &&
      rollback.status === "success",
    "Rollback target does not match the immutable Cloudflare Pages project.",
  );
  const current = canonicalDeployment(
    currentProjectApi,
    projectName,
    projectId,
  );
  let decision;
  if (current.id === rollback.id && current.sha === rollback.sha) {
    decision = "already-rollback-target";
  } else if (
    current.id === candidateReceipt.deployment_id &&
    current.sha === normalizedReleaseSha
  ) {
    decision = "rollback-exact-candidate";
  } else {
    throw new Error(
      "Current canonical deployment is neither the captured rollback target nor the exact candidate; refusing to overwrite a newer deployment.",
    );
  }
  return {
    schema_version: 1,
    evidence_type: "maiprop-pages-rollback-authorization",
    status: "authorized",
    decision,
    project_id: projectId,
    project_name: projectName,
    candidate_deployment_id: candidateReceipt.deployment_id,
    candidate_sha: normalizedReleaseSha,
    rollback_deployment_id: rollback.id,
    rollback_sha: rollback.sha,
    observed_canonical_deployment_id: current.id,
    observed_canonical_sha: current.sha,
  };
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const args = {};
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    assertOk(key?.startsWith("--"), `Unexpected argument: ${key ?? ""}`);
    const value = rest[index + 1];
    assertOk(value !== undefined, `${key} requires a value.`);
    args[key.slice(2)] = value;
  }
  return { command, args };
}

function readJson(path, label) {
  const file = resolve(requiredString(path, label));
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function writeJson(path, value) {
  const file = resolve(requiredString(path, "--out"));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function main() {
  const { command, args } = parseArgs(process.argv.slice(2));
  if (command === "resolve-candidate") {
    const mutationAttempt = readJson(
      args["mutation-attempt-file"],
      "--mutation-attempt-file",
    );
    assertOk(
      mutationAttempt?.mutation_attempted === true,
      "Mutation-attempt evidence does not record mutation_attempted=true.",
    );
    const receipt = resolveCloudflarePagesCandidateReceipt({
      mutationAttempted: true,
      beforeDeploymentsApi: readJson(
        args["before-deployments-file"],
        "--before-deployments-file",
      ),
      afterDeploymentsApi: readJson(
        args["after-deployments-file"],
        "--after-deployments-file",
      ),
      currentProjectApi: readJson(
        args["current-project-file"],
        "--current-project-file",
      ),
      expectedProjectName: args.project,
      expectedProjectId: args["project-id"],
      releaseSha: args["release-sha"],
      reportedDeploymentId: args["reported-deployment-id"] ?? "",
    });
    writeJson(args.out, receipt);
    return;
  }
  if (command === "resolve-recovery-candidate") {
    const mutationAttempt = readJson(
      args["mutation-attempt-file"],
      "--mutation-attempt-file",
    );
    assertOk(
      mutationAttempt?.mutation_attempted === true,
      "Mutation-attempt evidence does not record mutation_attempted=true.",
    );
    const receipt = resolveCloudflarePagesRecoveryReceipt({
      mutationAttempted: true,
      beforeDeploymentsApi: readJson(
        args["before-deployments-file"],
        "--before-deployments-file",
      ),
      afterDeploymentsApi: readJson(
        args["after-deployments-file"],
        "--after-deployments-file",
      ),
      currentProjectApi: readJson(
        args["current-project-file"],
        "--current-project-file",
      ),
      expectedProjectName: args.project,
      expectedProjectId: args["project-id"],
      releaseSha: args["release-sha"],
    });
    writeJson(args.out, receipt);
    return;
  }
  if (command === "authorize-rollback") {
    const authorization = authorizeCloudflarePagesRollback({
      currentProjectApi: readJson(
        args["current-project-file"],
        "--current-project-file",
      ),
      candidateReceipt: readJson(
        args["candidate-receipt-file"],
        "--candidate-receipt-file",
      ),
      rollbackTarget: readJson(
        args["rollback-target-file"],
        "--rollback-target-file",
      ),
      expectedProjectName: args.project,
      expectedProjectId: args["project-id"],
      releaseSha: args["release-sha"],
    });
    writeJson(args.out, authorization);
    return;
  }
  throw new Error(`Unsupported Cloudflare Pages candidate guard command: ${command ?? ""}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(fileURLToPath(import.meta.url)).href &&
  process.argv[1].endsWith("cloudflare-pages-candidate-guard.mjs")
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
