import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const MAIPROP_STAGING_PAGES_PROJECT =
  "maiprop-listing-site-staging";
export const MAIPROP_STAGING_ROLLBACK_ACKNOWLEDGEMENT =
  "MUTATE_STAGING_xsiehskfgeoqyazcgauv";

const RELEASE_SHA_PATTERN = /^[0-9a-f]{40}$/i;

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireReleaseSha(value, label) {
  const sha = requireString(value, label);
  if (!RELEASE_SHA_PATTERN.test(sha)) {
    throw new Error(`${label} must be a full 40-character Git SHA`);
  }
  return sha.toLowerCase();
}

function requireProjectSnapshot(snapshot, expectedProject, label) {
  if (
    !snapshot ||
    snapshot.success !== true ||
    !snapshot.result ||
    snapshot.result.name !== expectedProject
  ) {
    throw new Error(
      `${label} does not identify the dedicated staging Pages project`,
    );
  }
  if (snapshot.result.production_branch !== "main") {
    throw new Error(`${label} must retain main as its production branch`);
  }
  if (!snapshot.result.canonical_deployment) {
    throw new Error(`${label} does not contain a canonical deployment`);
  }
  return snapshot.result.canonical_deployment;
}

function requireSuccessfulDeployment(deployment, expectedProject, label) {
  const id = requireString(deployment?.id, `${label} ID`);
  if (
    deployment.project_name !== expectedProject ||
    deployment.environment !== "production" ||
    deployment.is_skipped !== false ||
    deployment.latest_stage?.name !== "deploy" ||
    deployment.latest_stage?.status !== "success" ||
    deployment.deployment_trigger?.metadata?.branch !== "main"
  ) {
    throw new Error(
      `${label} must be a successful rollback target in the dedicated staging Pages project`,
    );
  }
  const sha = requireReleaseSha(
    deployment.deployment_trigger?.metadata?.commit_hash,
    `${label} release SHA`,
  );
  return { id, sha };
}

export function validateStagingRollbackAuthorization({
  currentProject,
  priorProject,
  failedDeployment,
  previousDeployment,
  stagingProject,
  productionProject,
  acknowledgement,
  failedDeploymentId,
  failedReleaseSha,
}) {
  const expectedStagingProject = requireString(
    stagingProject,
    "Staging Pages project",
  );
  const expectedProductionProject = requireString(
    productionProject,
    "Production Pages project",
  );
  if (
    expectedStagingProject !== MAIPROP_STAGING_PAGES_PROJECT ||
    expectedStagingProject === expectedProductionProject
  ) {
    throw new Error(
      `Rollback target must be the dedicated staging Pages project ${MAIPROP_STAGING_PAGES_PROJECT}`,
    );
  }
  if (acknowledgement !== MAIPROP_STAGING_ROLLBACK_ACKNOWLEDGEMENT) {
    throw new Error(
      `Staging rollback acknowledgement must be ${MAIPROP_STAGING_ROLLBACK_ACKNOWLEDGEMENT}`,
    );
  }

  const expectedFailedId = requireString(
    failedDeploymentId,
    "Failed deployment ID",
  );
  const expectedFailedSha = requireReleaseSha(
    failedReleaseSha,
    "Failed release SHA",
  );
  const failed = requireSuccessfulDeployment(
    failedDeployment,
    expectedStagingProject,
    "Failed deployment",
  );
  if (failed.id !== expectedFailedId) {
    throw new Error(
      `Failed deployment ID ${failed.id} does not match workflow deployment ID ${expectedFailedId}`,
    );
  }
  if (failed.sha !== expectedFailedSha) {
    throw new Error(
      `Failed release SHA ${failed.sha} does not match workflow release SHA ${expectedFailedSha}`,
    );
  }

  const currentCanonical = requireProjectSnapshot(
    currentProject,
    expectedStagingProject,
    "Current project snapshot",
  );
  const current = requireSuccessfulDeployment(
    currentCanonical,
    expectedStagingProject,
    "Current canonical deployment",
  );
  if (current.id !== expectedFailedId || current.sha !== expectedFailedSha) {
    throw new Error(
      "Current canonical deployment is no longer the failed staging candidate; refusing to overwrite a newer recovery state",
    );
  }

  const previous = requireSuccessfulDeployment(
    previousDeployment,
    expectedStagingProject,
    "Captured prior deployment",
  );
  const priorCanonical = requireProjectSnapshot(
    priorProject,
    expectedStagingProject,
    "Pre-mutation project snapshot",
  );
  const capturedPrior = requireSuccessfulDeployment(
    priorCanonical,
    expectedStagingProject,
    "Pre-mutation canonical deployment",
  );
  if (capturedPrior.id !== previous.id || capturedPrior.sha !== previous.sha) {
    throw new Error(
      "Captured prior deployment does not match the pre-mutation canonical deployment",
    );
  }
  if (previous.id === expectedFailedId) {
    throw new Error(
      "Captured prior deployment must be distinct from the failed deployment",
    );
  }

  return {
    stagingProject: expectedStagingProject,
    failedDeploymentId: expectedFailedId,
    failedReleaseSha: expectedFailedSha,
    rollbackDeploymentId: previous.id,
    rollbackReleaseSha: previous.sha,
  };
}

function flagValue(name) {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  return requireString(value, name);
}

function readJsonFile(name) {
  const file = flagValue(name);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(
      `${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function main() {
  const result = validateStagingRollbackAuthorization({
    currentProject: readJsonFile("--current-project-file"),
    priorProject: readJsonFile("--prior-project-file"),
    failedDeployment: readJsonFile("--failed-deployment-file"),
    previousDeployment: readJsonFile("--previous-deployment-file"),
    stagingProject: flagValue("--staging-project"),
    productionProject: flagValue("--production-project"),
    acknowledgement: flagValue("--acknowledgement"),
    failedDeploymentId: flagValue("--failed-deployment-id"),
    failedReleaseSha: flagValue("--failed-release-sha"),
  });

  process.stdout.write(
    `Authorized staging rollback from ${result.failedDeploymentId} to ${result.rollbackDeploymentId}.\n`,
  );
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
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
