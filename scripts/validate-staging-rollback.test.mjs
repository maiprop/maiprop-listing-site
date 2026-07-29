import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = resolve(root, "scripts", "validate-staging-rollback.mjs");
const stagingProject = "maiprop-listing-site-staging";
const productionProject = "maiprop-listing-site";
const acknowledgement = "MUTATE_STAGING_xsiehskfgeoqyazcgauv";
const failedDeploymentId = "failed-deployment-id";
const previousDeploymentId = "previous-deployment-id";
const failedReleaseSha = "0123456789abcdef0123456789abcdef01234567";
const previousReleaseSha = "89abcdef0123456789abcdef0123456789abcdef";

function deployment({
  id,
  sha,
  project = stagingProject,
  status = "success",
}) {
  return {
    id,
    project_name: project,
    environment: "production",
    is_skipped: false,
    latest_stage: {
      name: "deploy",
      status,
    },
    deployment_trigger: {
      metadata: {
        branch: "main",
        commit_hash: sha,
      },
    },
  };
}

function projectSnapshot(canonicalDeployment, name = stagingProject) {
  return {
    success: true,
    result: {
      name,
      production_branch: "main",
      canonical_deployment: canonicalDeployment,
    },
  };
}

function validEvidence() {
  const failedDeployment = deployment({
    id: failedDeploymentId,
    sha: failedReleaseSha,
  });
  const previousDeployment = deployment({
    id: previousDeploymentId,
    sha: previousReleaseSha,
  });

  return {
    currentProject: projectSnapshot(failedDeployment),
    priorProject: projectSnapshot(previousDeployment),
    failedDeployment,
    previousDeployment,
    stagingProject,
    productionProject,
    acknowledgement,
    failedDeploymentId,
    failedReleaseSha,
  };
}

function runValidator(overrides = {}) {
  const evidence = { ...validEvidence(), ...overrides };
  const directory = mkdtempSync(resolve(tmpdir(), "maiprop-rollback-"));
  const files = {
    currentProject: resolve(directory, "current-project.json"),
    priorProject: resolve(directory, "prior-project.json"),
    failedDeployment: resolve(directory, "failed-deployment.json"),
    previousDeployment: resolve(directory, "previous-deployment.json"),
  };

  try {
    for (const [key, file] of Object.entries(files)) {
      writeFileSync(file, `${JSON.stringify(evidence[key], null, 2)}\n`);
    }

    return spawnSync(
      process.execPath,
      [
        script,
        "--current-project-file",
        files.currentProject,
        "--prior-project-file",
        files.priorProject,
        "--failed-deployment-file",
        files.failedDeployment,
        "--previous-deployment-file",
        files.previousDeployment,
        "--staging-project",
        evidence.stagingProject,
        "--production-project",
        evidence.productionProject,
        "--acknowledgement",
        evidence.acknowledgement,
        "--failed-deployment-id",
        evidence.failedDeploymentId,
        "--failed-release-sha",
        evidence.failedReleaseSha,
      ],
      {
        cwd: root,
        encoding: "utf8",
      },
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("staging rollback authorization", () => {
  it("authorizes recovery from the live failed candidate without a current-main lease", () => {
    const result = runValidator();

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain(
      `Authorized staging rollback from ${failedDeploymentId} to ${previousDeploymentId}`,
    );
  });

  it("rejects a non-isolated or production staging target", () => {
    const result = runValidator({
      stagingProject: productionProject,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/dedicated staging Pages project/i);
  });

  it("rejects recovery when the failed deployment is no longer canonical", () => {
    const evidence = validEvidence();
    const newerDeployment = deployment({
      id: "newer-deployment-id",
      sha: "fedcba9876543210fedcba9876543210fedcba98",
    });
    const result = runValidator({
      currentProject: projectSnapshot(newerDeployment),
      failedDeployment: evidence.failedDeployment,
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/current canonical deployment/i);
  });

  it("rejects a failed deployment ID or SHA that differs from the workflow evidence", () => {
    const idResult = runValidator({
      failedDeploymentId: "different-failed-deployment-id",
    });
    const shaResult = runValidator({
      failedReleaseSha: "f".repeat(40),
    });

    expect(idResult.status).not.toBe(0);
    expect(idResult.stderr).toMatch(/failed deployment ID/i);
    expect(shaResult.status).not.toBe(0);
    expect(shaResult.stderr).toMatch(/failed release SHA/i);
  });

  it("rejects a prior deployment not captured by the pre-mutation project snapshot", () => {
    const otherPrior = deployment({
      id: "other-prior-deployment-id",
      sha: "a".repeat(40),
    });
    const result = runValidator({
      priorProject: projectSnapshot(otherPrior),
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/captured prior deployment/i);
  });

  it("rejects an unsuccessful or non-distinct rollback target", () => {
    const failedPrior = deployment({
      id: previousDeploymentId,
      sha: previousReleaseSha,
      status: "failure",
    });
    const unsuccessfulResult = runValidator({
      priorProject: projectSnapshot(failedPrior),
      previousDeployment: failedPrior,
    });
    const sameDeployment = deployment({
      id: failedDeploymentId,
      sha: previousReleaseSha,
    });
    const sameIdResult = runValidator({
      priorProject: projectSnapshot(sameDeployment),
      previousDeployment: sameDeployment,
    });

    expect(unsuccessfulResult.status).not.toBe(0);
    expect(unsuccessfulResult.stderr).toMatch(/successful rollback target/i);
    expect(sameIdResult.status).not.toBe(0);
    expect(sameIdResult.stderr).toMatch(/distinct from the failed deployment/i);
  });

  it("wires only the rollback authorization block to recovery validation", () => {
    const workflow = readFileSync(
      resolve(root, ".github", "workflows", "stage-release.yml"),
      "utf8",
    );
    const start = workflow.indexOf(
      "      - name: Roll back failed staging candidate",
    );
    const end = workflow.indexOf('          rollback_id="$(', start);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);

    const authorizationBlock = workflow.slice(start, end);
    expect(authorizationBlock).toContain(
      "node scripts/validate-staging-rollback.mjs",
    );
    expect(authorizationBlock).toContain(
      "cloudflare-staging-rollback-current-project.json",
    );
    expect(authorizationBlock).toContain(
      'if [ -z "$failed_deployment_id" ]; then',
    );
    expect(authorizationBlock).not.toContain("github-staging-lease");
    expect(authorizationBlock).not.toContain("GITHUB_TOKEN");

    expect(workflow).toContain(
      "- name: Revalidate staging lease before Pages mutation",
    );
    expect(workflow).toContain(
      "npm run release:validate -- github-staging-lease",
    );
  });
});
