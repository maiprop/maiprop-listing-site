import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  authorizeCloudflarePagesRollback,
  resolveCloudflarePagesCandidateReceipt,
  resolveCloudflarePagesRecoveryReceipt,
} from "./cloudflare-pages-candidate-guard.mjs";

const PROJECT = "maiprop-listing-site";
const PROJECT_ID = "production-project-id";
const RELEASE_SHA = "a".repeat(40);
const ROLLBACK_SHA = "b".repeat(40);

function deployment({
  id,
  sha,
  projectName = PROJECT,
  projectId = PROJECT_ID,
  status = "success",
}) {
  return {
    id,
    project_id: projectId,
    project_name: projectName,
    environment: "production",
    is_skipped: false,
    uses_functions: true,
    latest_stage: { name: "deploy", status },
    deployment_trigger: {
      metadata: {
        branch: "main",
        commit_hash: sha,
        commit_dirty: false,
      },
    },
  };
}

function deploymentsEnvelope(...deployments) {
  return { success: true, result: deployments };
}

function projectEnvelope(canonicalDeployment) {
  return {
    success: true,
    result: {
      id: PROJECT_ID,
      name: PROJECT,
      canonical_deployment: canonicalDeployment,
    },
  };
}

const rollbackTarget = deployment({
  id: "rollback-deployment",
  sha: ROLLBACK_SHA,
});
const candidate = deployment({
  id: "candidate-deployment",
  sha: RELEASE_SHA,
});

describe("Cloudflare Pages candidate reconciliation", () => {
  it("issues a receipt for exactly one new canonical exact-SHA deployment", () => {
    const receipt = resolveCloudflarePagesCandidateReceipt({
      mutationAttempted: true,
      beforeDeploymentsApi: deploymentsEnvelope(rollbackTarget),
      afterDeploymentsApi: deploymentsEnvelope(rollbackTarget, candidate),
      currentProjectApi: projectEnvelope(candidate),
      expectedProjectName: PROJECT,
      expectedProjectId: PROJECT_ID,
      releaseSha: RELEASE_SHA,
      reportedDeploymentId: candidate.id,
    });

    expect(receipt).toEqual({
      schema_version: 1,
      evidence_type: "maiprop-pages-candidate-receipt",
      status: "reconciled",
      mutation_attempted: true,
      resolution: "new-exact-sha-set-difference",
      project_id: PROJECT_ID,
      project_name: PROJECT,
      deployment_id: "candidate-deployment",
      release_sha: RELEASE_SHA,
      environment: "production",
      branch: "main",
      commit_dirty: false,
      uses_functions: true,
      deployment_status: "success",
      canonical_at_reconciliation: true,
    });
  });

  it("issues an API-only recovery receipt when Wrangler output is unavailable", () => {
    const receipt = resolveCloudflarePagesRecoveryReceipt({
      mutationAttempted: true,
      beforeDeploymentsApi: deploymentsEnvelope(rollbackTarget),
      afterDeploymentsApi: deploymentsEnvelope(rollbackTarget, candidate),
      currentProjectApi: projectEnvelope(candidate),
      expectedProjectName: PROJECT,
      expectedProjectId: PROJECT_ID,
      releaseSha: RELEASE_SHA,
    });

    expect(receipt).toMatchObject({
      evidence_type: "maiprop-pages-candidate-recovery-receipt",
      status: "api-reconciled",
      resolution: "new-exact-sha-set-difference-api-only",
      deployment_id: candidate.id,
      release_sha: RELEASE_SHA,
      canonical_at_reconciliation: true,
    });
  });

  it("fails closed when no candidate, multiple candidates, or a reported ID mismatch exists", () => {
    const base = {
      mutationAttempted: true,
      beforeDeploymentsApi: deploymentsEnvelope(rollbackTarget),
      currentProjectApi: projectEnvelope(candidate),
      expectedProjectName: PROJECT,
      expectedProjectId: PROJECT_ID,
      releaseSha: RELEASE_SHA,
      reportedDeploymentId: candidate.id,
    };

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        afterDeploymentsApi: deploymentsEnvelope(rollbackTarget),
      })
    ).toThrow(/no new exact-SHA Cloudflare Pages candidate/i);

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        afterDeploymentsApi: deploymentsEnvelope(
          rollbackTarget,
          candidate,
          deployment({ id: "second-candidate", sha: RELEASE_SHA }),
        ),
      })
    ).toThrow(/multiple new exact-SHA Cloudflare Pages candidates/i);

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        afterDeploymentsApi: deploymentsEnvelope(rollbackTarget, candidate),
        reportedDeploymentId: "different-candidate",
      })
    ).toThrow(/reported deployment ID/i);

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        afterDeploymentsApi: deploymentsEnvelope(rollbackTarget, candidate),
        reportedDeploymentId: "",
      })
    ).toThrow(/reported deployment ID/i);
  });

  it("rejects an unattempted mutation and a non-canonical candidate", () => {
    const base = {
      mutationAttempted: true,
      beforeDeploymentsApi: deploymentsEnvelope(rollbackTarget),
      afterDeploymentsApi: deploymentsEnvelope(rollbackTarget, candidate),
      currentProjectApi: projectEnvelope(candidate),
      expectedProjectName: PROJECT,
      expectedProjectId: PROJECT_ID,
      releaseSha: RELEASE_SHA,
      reportedDeploymentId: candidate.id,
    };

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        mutationAttempted: false,
      })
    ).toThrow(/mutation was not durably recorded/i);

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        currentProjectApi: projectEnvelope(rollbackTarget),
      })
    ).toThrow(/did not become the canonical deployment/i);

    expect(() =>
      resolveCloudflarePagesCandidateReceipt({
        ...base,
        currentProjectApi: projectEnvelope({
          ...candidate,
          latest_stage: { name: "deploy", status: "failure" },
        }),
      })
    ).toThrow(/canonical deployment is not the exact successful candidate/i);
  });
});

describe("Cloudflare Pages rollback authorization", () => {
  const candidateReceipt = resolveCloudflarePagesCandidateReceipt({
    mutationAttempted: true,
    beforeDeploymentsApi: deploymentsEnvelope(rollbackTarget),
    afterDeploymentsApi: deploymentsEnvelope(rollbackTarget, candidate),
    currentProjectApi: projectEnvelope(candidate),
    expectedProjectName: PROJECT,
    expectedProjectId: PROJECT_ID,
    releaseSha: RELEASE_SHA,
    reportedDeploymentId: candidate.id,
  });

  it("authorizes only the exact candidate and treats the captured target as a no-op", () => {
    expect(
      authorizeCloudflarePagesRollback({
        currentProjectApi: projectEnvelope(candidate),
        candidateReceipt,
        rollbackTarget,
        expectedProjectName: PROJECT,
        expectedProjectId: PROJECT_ID,
        releaseSha: RELEASE_SHA,
      }),
    ).toMatchObject({ decision: "rollback-exact-candidate" });

    expect(
      authorizeCloudflarePagesRollback({
        currentProjectApi: projectEnvelope(rollbackTarget),
        candidateReceipt,
        rollbackTarget,
        expectedProjectName: PROJECT,
        expectedProjectId: PROJECT_ID,
        releaseSha: RELEASE_SHA,
      }),
    ).toMatchObject({ decision: "already-rollback-target" });
  });

  it("refuses a newer deployment and either half of an ID/SHA mismatch", () => {
    for (const current of [
      deployment({ id: "newer-deployment", sha: "c".repeat(40) }),
      deployment({ id: candidate.id, sha: "c".repeat(40) }),
      deployment({ id: "different-id", sha: RELEASE_SHA }),
    ]) {
      expect(() =>
        authorizeCloudflarePagesRollback({
          currentProjectApi: projectEnvelope(current),
          candidateReceipt,
          rollbackTarget,
          expectedProjectName: PROJECT,
          expectedProjectId: PROJECT_ID,
          releaseSha: RELEASE_SHA,
        })
      ).toThrow(/neither the captured rollback target nor the exact candidate/i);
    }
  });

  it("rejects a receipt whose candidate posture fields were altered", () => {
    expect(() =>
      authorizeCloudflarePagesRollback({
        currentProjectApi: projectEnvelope(candidate),
        candidateReceipt: { ...candidateReceipt, uses_functions: false },
        rollbackTarget,
        expectedProjectName: PROJECT,
        expectedProjectId: PROJECT_ID,
        releaseSha: RELEASE_SHA,
      })
    ).toThrow(/candidate receipt is missing, malformed/i);
  });

  it("rejects dirty or functionless rollback targets", () => {
    for (const invalidTarget of [
      {
        ...rollbackTarget,
        deployment_trigger: {
          metadata: {
            ...rollbackTarget.deployment_trigger.metadata,
            commit_dirty: true,
          },
        },
      },
      { ...rollbackTarget, uses_functions: false },
    ]) {
      expect(() =>
        authorizeCloudflarePagesRollback({
          currentProjectApi: projectEnvelope(candidate),
          candidateReceipt,
          rollbackTarget: invalidTarget,
          expectedProjectName: PROJECT,
          expectedProjectId: PROJECT_ID,
          releaseSha: RELEASE_SHA,
        })
      ).toThrow(/rollback target/i);
    }
  });
});

describe("Cloudflare Pages workflow wiring", () => {
  const productionWorkflow = readFileSync(
    resolve(import.meta.dirname, "..", ".github", "workflows", "reusable-cloudflare-production-deploy.yml"),
    "utf8",
  );
  const stagingWorkflow = readFileSync(
    resolve(import.meta.dirname, "..", ".github", "workflows", "stage-release.yml"),
    "utf8",
  );

  it("binds production reconciliation to the provider-reported deployment ID", () => {
    expect(productionWorkflow).toContain("--reported-deployment-id");
    expect(productionWorkflow).toContain("WRANGLER_OUTPUT_DIR");
    expect(productionWorkflow).toContain("reported_deployment_id");
  });

  it("persists an API-proven recovery receipt before enforcing the Wrangler receipt", () => {
    expect(productionWorkflow).toContain("resolve-recovery-candidate");
    expect(productionWorkflow).toContain("recovery_candidate_receipt");
    expect(productionWorkflow).toContain(
      "maiprop-pages-candidate-recovery-receipt",
    );
    expect(productionWorkflow.indexOf("resolve-recovery-candidate")).toBeLessThan(
      productionWorkflow.indexOf("resolve-candidate"),
    );
  });

  it("does not automatically replay non-idempotent rollback POSTs", () => {
    const rollbackPostPattern = /curl -fsS --retry 3\s+\\\s+--request POST[\s\S]{0,450}?\/rollback/g;
    expect(productionWorkflow).not.toMatch(rollbackPostPattern);
    expect(stagingWorkflow).not.toMatch(rollbackPostPattern);
  });
});

describe("Cloudflare Pages candidate guard CLI", () => {
  it("fails closed for an unsupported command", () => {
    const result = spawnSync(
      process.execPath,
      [
        resolve(import.meta.dirname, "cloudflare-pages-candidate-guard.mjs"),
        "unknown-command",
      ],
      { encoding: "utf8" },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Unsupported Cloudflare Pages candidate guard command: unknown-command",
    );
  });
});
