import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

import {
  selectReleaseAuthorization,
  validateReleaseAuthorizationGrant,
} from "../../scripts/production-break-glass-validation.mjs";
import {
  validateConsumptionReceipt,
} from "../../scripts/production-break-glass-consumption.mjs";
import {
  validateMutationLease,
  validateReleaseApproval,
} from "../../scripts/production-release-validation.mjs";

const workflows = {
  database: readFileSync(
    ".github/workflows/deploy-supabase-production-db.yml",
    "utf8",
  ).replace(/\r\n/g, "\n"),
  edge: readFileSync(
    ".github/workflows/deploy-edge-functions.yml",
    "utf8",
  ).replace(/\r\n/g, "\n"),
};
const pagesWorkflow = readFileSync(
  ".github/workflows/provision-cloudflare-pages-runtime.yml",
  "utf8",
).replace(/\r\n/g, "\n");
const productionWorkflow = readFileSync(
  ".github/workflows/deploy-production-release.yml",
  "utf8",
).replace(/\r\n/g, "\n");
const cloudflareWorkflow = readFileSync(
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
  "utf8",
).replace(/\r\n/g, "\n");
const directRecoveryWorkflow = readFileSync(
  ".github/workflows/direct-cloudflare-production-deploy.yml",
  "utf8",
).replace(/\r\n/g, "\n");

type WorkflowStep = {
  name: string;
  run: string;
  env: Record<string, string>;
};
type WorkflowJob = {
  steps: WorkflowStep[];
  needs?: string | string[];
  if?: string;
  with: Record<string, unknown>;
};
type WorkflowInput = {
  default?: unknown;
};
type ParsedWorkflow = {
  on: {
    workflow_dispatch: { inputs: Record<string, WorkflowInput> };
    workflow_call: { inputs: Record<string, WorkflowInput> };
  };
  jobs: Record<string, WorkflowJob>;
};

const parsedPages = yaml.load(pagesWorkflow) as ParsedWorkflow;
const parsedProduction = yaml.load(productionWorkflow) as ParsedWorkflow;
const parsedCloudflare = yaml.load(cloudflareWorkflow) as ParsedWorkflow;
const parsedDirectRecovery = yaml.load(directRecoveryWorkflow) as ParsedWorkflow;
const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const incidentId = "PERF-BOOTSTRAP-20260826-01";
const reason = "Emergency release to restore production performance safely.";
const reasonSha256 = "3a7e0232d1a54441027669a65abbaf8ba8b9272a06e9205c6d9c1ffa4c9e6067";

function stepBlock(source: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\n      - name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
}

function breakGlassInput(overrides: Record<string, unknown> = {}) {
  return {
    action: "production-deploy",
    standardConfirmation: "DEPLOY_PRODUCTION_RELEASE",
    singleAdminBreakGlass: "true",
    incidentId,
    reason,
    confirmation: `DEPLOY_PRODUCTION_BREAK_GLASS ${releaseSha} ${incidentId}`,
    releaseSha,
    currentMainSha: releaseSha,
    checkoutSha: releaseSha,
    repository: "maiprop/maiprop-listing-site",
    ref: "refs/heads/main",
    eventName: "workflow_dispatch",
    actor: "krenios",
    triggeringActor: "krenios",
    runId: "70",
    runAttempt: "1",
    workflowSha: releaseSha,
    productionReleaseDeployers: "release-operator,krenios",
    breakGlassActor: "krenios",
    breakGlassReleaseSha: releaseSha,
    breakGlassIncidentId: incidentId,
    breakGlassExpiresAt: "2026-08-26T12:00:00.000Z",
    ...overrides,
  };
}

function authorization(
  action = "production-deploy",
  runId = "70",
  overrides: Record<string, unknown> = {},
) {
  return {
    mode: "break_glass",
    action,
    actor: "krenios",
    release_sha: releaseSha,
    incident_id: incidentId,
    reason_sha256: reasonSha256,
    authorized_expires_at: "2026-08-26T12:00:00.000Z",
    workflow_run_id: runId,
    workflow_run_attempt: "1",
    ...overrides,
  };
}

function consumption(overrides: Record<string, unknown> = {}) {
  return {
    artifact_id: "101",
    artifact_digest: "a".repeat(64),
    binding_artifact_id: "102",
    payload_sha256: "b".repeat(64),
    action: "production-deploy",
    incident_id: incidentId,
    release_sha: releaseSha,
    parent_run_id: "70",
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    evidence_type: "maiprop-production-break-glass-consumption",
    repository: "maiprop/maiprop-listing-site",
    workflow_ref:
      "maiprop/maiprop-listing-site/.github/workflows/deploy-production-release.yml@refs/heads/main",
    workflow_sha: releaseSha,
    workflow_run_id: "70",
    workflow_run_attempt: "1",
    consumed_at: "2026-08-26T10:00:00.000Z",
    nonce: "9".repeat(64),
    authorization: authorization(),
    ...overrides,
  };
}

function approval(overrides: Record<string, unknown> = {}) {
  const approvalAuthorization = authorization("production-approval", "60");
  return {
    schema_version: 2,
    repository: "maiprop/maiprop-listing-site",
    release_sha: releaseSha,
    source_tree: "b".repeat(40),
    source_run_id: "40",
    source_run_attempt: "1",
    artifact_sha256: "c".repeat(64),
    staging_run_id: "50",
    staging_run_attempt: "1",
    approval_run_id: "60",
    approval_run_attempt: "1",
    approver: "krenios",
    nonce: "d".repeat(64),
    revoked: false,
    approved_at: "2026-08-26T10:00:00.000Z",
    expires_at: "2026-08-26T11:30:00.000Z",
    authorization: approvalAuthorization,
    ...overrides,
  };
}

function lease(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 3,
    repository: "maiprop/maiprop-listing-site",
    release_sha: releaseSha,
    source_tree: "b".repeat(40),
    artifact_sha256: "c".repeat(64),
    approval_nonce: "d".repeat(64),
    nonce: "e".repeat(64),
    source_run_id: "40",
    source_run_attempt: "1",
    staging_run_id: "50",
    staging_run_attempt: "1",
    approval_run_id: "60",
    approval_run_attempt: "1",
    production_run_id: "70",
    production_run_attempt: "1",
    stripe_readiness_run_id: "80",
    stripe_readiness_run_attempt: "1",
    stripe_readiness_sha256: "f".repeat(64),
    stripe_readiness_artifact_id: "90",
    stripe_readiness_artifact_digest: "1".repeat(64),
    stripe_readiness_checked_at: "2026-08-26T09:59:00.000Z",
    issued_at: "2026-08-26T10:00:00.000Z",
    expires_at: "2026-08-26T10:14:00.000Z",
    authorization: authorization(),
    consumption: consumption(),
    ...overrides,
  };
}

function validateLease(candidate = lease()) {
  return validateMutationLease({
    lease: candidate,
    sha: releaseSha,
    repository: "maiprop/maiprop-listing-site",
    sourceTree: "b".repeat(40),
    artifactSha256: "c".repeat(64),
    approvalNonce: "d".repeat(64),
    expectedAuthorization: authorization(),
    expectedConsumption: consumption(),
    sourceRunId: "40",
    sourceRunAttempt: "1",
    stagingRunId: "50",
    stagingRunAttempt: "1",
    approvalRunId: "60",
    approvalRunAttempt: "1",
    productionRunId: "70",
    productionRunAttempt: "1",
    stripeReadinessRunId: "80",
    stripeReadinessRunAttempt: "1",
    stripeReadinessSha256: "f".repeat(64),
    stripeReadinessArtifactId: "90",
    stripeReadinessArtifactDigest: "1".repeat(64),
    now: new Date("2026-08-26T10:05:00.000Z"),
  });
}

function receiptListingGuardSource(): string {
  const step = parsedPages.jobs.provision.steps.find(
    (candidate: WorkflowStep) => candidate.name === "Install exact-name receipt listing guard",
  );
  expect(step).toBeTruthy();
  const marker = "cat > \"$RUNNER_TEMP/verify-consumption-artifacts.mjs\" <<'NODE'\n";
  const start = step.run.indexOf(marker);
  const end = step.run.indexOf("\nNODE", start + marker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return step.run.slice(start + marker.length, end);
}

function runReceiptListingGuard(
  listing: unknown,
  mode: "precheck" | "postcheck",
  name: string,
  id = "",
  digest = "",
) {
  const directory = mkdtempSync(join(tmpdir(), "maiprop-task6-receipt-"));
  try {
    const script = join(directory, "guard.mjs");
    const file = join(directory, "listing.json");
    writeFileSync(script, `${receiptListingGuardSource()}\n`, "utf8");
    writeFileSync(file, `${JSON.stringify(listing)}\n`, "utf8");
    return spawnSync(process.execPath, [script, file, name, mode, id, digest], {
      encoding: "utf8",
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function embeddedNodeSource(step: WorkflowStep): string {
  const marker = "node --input-type=module <<'NODE'\n";
  const start = step.run.indexOf(marker);
  const end = step.run.indexOf("\nNODE", start + marker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return step.run.slice(start + marker.length, end);
}

function runCloudflareAuthorizationGuard(overrides: Record<string, string> = {}) {
  const directory = mkdtempSync(join(tmpdir(), "maiprop-task6-direct-"));
  try {
    const approvalFile = join(directory, "approval.json");
    const leaseFile = join(directory, "lease.json");
    const standardApproval = approval({
      schema_version: 1,
      approver: "release-reviewer",
    }) as Record<string, unknown>;
    delete standardApproval.authorization;
    const standardLease = lease({ schema_version: 2 }) as Record<string, unknown>;
    delete standardLease.authorization;
    delete standardLease.consumption;
    writeFileSync(approvalFile, JSON.stringify(standardApproval), "utf8");
    writeFileSync(leaseFile, JSON.stringify(standardLease), "utf8");
    const step = parsedCloudflare.jobs.deploy.steps.find(
      (candidate: WorkflowStep) => candidate.name === "Authenticate declared production authorization mode",
    );
    const env = {
      ...process.env,
      APPROVAL_FILE: approvalFile,
      MUTATION_LEASE_FILE: leaseFile,
      DECLARED_AUTHORIZATION_MODE: "standard",
      EXPECTED_AUTHORIZATION_SHA256: "",
      DEPLOY_ACTOR: "release-operator",
      DIRECT_STANDARD_RECOVERY: "true",
      RELEASE_SHA: releaseSha,
      APPROVAL_RUN_ID: "60",
      APPROVAL_RUN_ATTEMPT: "1",
      PRODUCTION_RUN_ID: "70",
      PRODUCTION_RUN_ATTEMPT: "1",
      ...overrides,
    };
    return spawnSync(process.execPath, [
      "--input-type=module",
      "--eval",
      embeddedNodeSource(step),
    ], { cwd: process.cwd(), env, encoding: "utf8" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("Supabase production provider signed-binding contract", () => {
  it.each(Object.entries(workflows))(
    "%s is GitHub Free compatible and fail-closed on producer identity",
    (_provider, source) => {
      const parsed = yaml.load(source) as {
        on: {
          workflow_call: {
            secrets?: Record<string, { required: boolean }>;
          };
        };
        permissions?: Record<string, string>;
        jobs: { deploy: { environment?: unknown } };
      };

      expect(parsed.jobs.deploy.environment).toBe("production");
      expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
      expect(parsed.on.workflow_call.secrets?.RELEASE_EVIDENCE_SIGNING_KEY).toEqual({
        required: true,
      });
      expect(parsed.on.workflow_call.secrets?.SUPABASE_PRODUCTION_DB_URL).toBeUndefined();
      expect(source).toContain(
        "SUPABASE_PRODUCTION_DB_URL: ${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
      );
      expect(source).toContain(
        "RELEASE_EVIDENCE_SIGNING_KEY_ID: ${{ vars.RELEASE_EVIDENCE_SIGNING_KEY_ID }}",
      );
      expect(source).toContain('[ "$GITHUB_RUN_ATTEMPT" != "1" ]');
      expect(source).toContain('[ "$GITHUB_ACTOR" != "$GITHUB_TRIGGERING_ACTOR" ]');
      expect(source).toContain("environment: production");
      expect(source).not.toContain("actions/attest-build-provenance@");
      expect(source).not.toContain("gh attestation");
      expect(source).not.toContain("attestations: write");
      expect(source).not.toContain("id-token: write");
      expect(source).not.toContain("artifact-metadata: write");
    },
  );

  it.each(Object.entries(workflows))(
    "%s verifies exact API metadata and signed payload hashes",
    (_provider, source) => {
      const verification = stepBlock(
        source,
        "Verify signed provider artifact bindings",
      );

      expect(verification).toContain("scripts/verify-release-artifact-binding.mjs");
      expect(verification).toContain("--artifact-metadata");
      expect(verification).toContain("--producer-run");
      expect(verification).toContain("--repository");
      expect(verification).toContain("--release-sha");
      expect(verification).toContain("--source-tree");
      expect(verification).toContain("--workflow-path");
      expect(verification).toContain("--workflow-ref");
      expect(verification).toContain("--workflow-sha");
      expect(verification).toContain("--run-id");
      expect(verification).toContain("--run-attempt");
      expect(verification).toContain("--event");
      expect(verification).toContain("--actor");
      expect(verification).toContain("--triggering-actor");
      expect(verification).toContain("--artifact-id");
      expect(verification).toContain("--artifact-name");
      expect(verification).toContain("--artifact-digest");
      expect(verification).toContain("--file-root");
      expect(verification).toContain('args+=(--file "$file")');
      expect(verification).toContain("release-manifest.json");
      expect(verification).toContain("release-candidate-attestation.json");
      expect(verification).toContain("supabase-staging-edge-attestation.json");
      expect(verification).toContain("stripe-live-migration-evidence.json");
      expect(verification).toContain("production-mutation-lease.json");
      expect(verification).toContain("STRIPE_READINESS_ARTIFACT_ID");
      expect(verification).toContain("STRIPE_READINESS_ARTIFACT_DIGEST");
      expect(verification).toMatch(/args\+=\(\s+--same-run/);
      expect(verification).toContain(
        '--trusted-current-run-id "$GITHUB_RUN_ID"',
      );
      expect(verification).toContain(
        '--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"',
      );
      expect(verification).toContain(
        '--trusted-current-actor "$GITHUB_ACTOR"',
      );
      expect(verification).toContain(
        '--trusted-current-triggering-actor "$GITHUB_TRIGGERING_ACTOR"',
      );
      expect(verification).toContain('"$PRODUCTION_CALLER_WORKFLOW_PATH"');
    },
  );

  it.each(Object.entries(workflows))(
    "%s paginates artifact discovery before enforcing unique names",
    (_provider, source) => {
      const resolution = stepBlock(
        source,
        "Resolve exact signed provider artifacts",
      );

      expect(resolution.match(/gh api --paginate/g)).toHaveLength(2);
      expect(resolution.match(/jq -s '\[\.\[\]\.artifacts\[\]\]'/g)).toHaveLength(2);
      expect(resolution).not.toContain(".artifacts[] | select");
    },
  );

  it("revalidates signed bindings inside every Supabase mutation shell", () => {
    const databaseApply = stepBlock(
      workflows.database,
      "Apply exact staged production migrations",
    );
    const edgeDeploy = stepBlock(
      workflows.edge,
      "Forward-converge exact artifact Edge functions serially",
    );

    expect(databaseApply).toContain(
      '"$RUNNER_TEMP/verify-production-provider-bindings.sh"',
    );
    expect(databaseApply.indexOf("verify-production-provider-bindings.sh")).toBeLessThan(
      databaseApply.indexOf("db push"),
    );
    expect(edgeDeploy).toContain(
      '"$RUNNER_TEMP/verify-production-provider-bindings.sh"',
    );
    expect(edgeDeploy.indexOf("verify-production-provider-bindings.sh")).toBeLessThan(
      edgeDeploy.indexOf("functions deploy"),
    );
  });

  it("wires the database payload and binding as separate reusable-workflow artifacts", () => {
    const database = yaml.load(workflows.database) as {
      on: { workflow_call: { outputs: Record<string, unknown> } };
    };
    const edge = yaml.load(workflows.edge) as {
      on: { workflow_call: { inputs: Record<string, unknown> } };
    };

    expect(database.on.workflow_call.outputs).toHaveProperty(
      "database_attestation_artifact",
    );
    expect(database.on.workflow_call.outputs).toHaveProperty(
      "database_binding_artifact",
    );
    expect(edge.on.workflow_call.inputs).toHaveProperty(
      "database_binding_artifact",
    );
    expect(workflows.edge).toContain(
      '"${DATABASE_PAYLOAD_ARTIFACT}-binding"',
    );
  });

  it("publishes deterministic provider payload, binding, and terminal artifact names", () => {
    expect(workflows.database).toContain(
      'artifact_name="production-supabase-db-attestation-$RELEASE_SHA-$PRODUCTION_RUN_ID-$PRODUCTION_RUN_ATTEMPT"',
    );
    expect(workflows.database).toContain(
      'binding_artifact_name="${{ steps.database_attestation.outputs.artifact_name }}-binding"',
    );
    expect(workflows.database).toContain(
      'payload_artifact_name="production-supabase-db-terminal-${RELEASE_SHA}-${PRODUCTION_RUN_ID}-${PRODUCTION_RUN_ATTEMPT}"',
    );
    expect(workflows.edge).toContain(
      'artifact_name="production-supabase-edge-attestation-${RELEASE_SHA}-${PRODUCTION_RUN_ID}-${PRODUCTION_RUN_ATTEMPT}"',
    );
    expect(workflows.edge).toContain(
      'binding_artifact_name="${{ steps.edge_attestation.outputs.artifact_name }}-binding"',
    );
    expect(workflows.edge).toContain(
      'payload_artifact_name="production-supabase-edge-terminal-${RELEASE_SHA}-${PRODUCTION_RUN_ID}-${PRODUCTION_RUN_ATTEMPT}"',
    );

    const edge = yaml.load(workflows.edge) as {
      on: { workflow_call: { outputs: Record<string, unknown> } };
    };
    expect(edge.on.workflow_call.outputs).toHaveProperty(
      "edge_attestation_artifact",
    );
    expect(edge.on.workflow_call.outputs).toHaveProperty(
      "edge_attestation_sha256",
    );
    expect(edge.on.workflow_call.outputs).toHaveProperty(
      "edge_binding_artifact",
    );
  });

  it.each([
    ["database", "Create signed production database evidence binding"],
    ["database", "Create signed production database terminal binding"],
    ["edge", "Create signed production Edge evidence binding"],
    ["edge", "Create signed production Edge terminal binding"],
  ] as const)("%s emits %s", (provider, stepName) => {
    const block = stepBlock(workflows[provider], stepName);

    expect(block).toContain("scripts/create-release-artifact-binding.mjs");
    expect(block).toContain("--artifact-id");
    expect(block).toContain("--artifact-name");
    expect(block).toContain("--artifact-digest");
    expect(block).toContain("--workflow-path");
    expect(block).toContain("--workflow-sha");
    expect(block).toContain("--actor");
    expect(block).toContain("--triggering-actor");
    expect(block).toContain("--file-root");
    expect(block).toContain("--file");
  });

  it("same-run binds both the one-shot Pages receipt and attempt-qualified provider proof", () => {
    const receiptBinding = stepBlock(
      pagesWorkflow,
      "Create and same-run verify consumption receipt binding",
    );
    const pagesBinding = stepBlock(
      pagesWorkflow,
      "Create and same-run verify Pages runtime evidence binding",
    );

    for (const block of [receiptBinding, pagesBinding]) {
      expect(block).toContain("scripts/create-release-artifact-binding.mjs");
      expect(block).toContain("scripts/verify-release-artifact-binding.mjs");
      expect(block).toContain("--artifact-id");
      expect(block).toContain("--artifact-name");
      expect(block).toContain("--artifact-digest");
      expect(block).toContain("--workflow-path");
      expect(block).toContain("--workflow-sha");
      expect(block).toContain("--actor");
      expect(block).toContain("--triggering-actor");
      expect(block).toContain("--same-run");
      expect(block).toContain('--trusted-current-run-id "$GITHUB_RUN_ID"');
      expect(block).toContain('--trusted-current-run-attempt "$GITHUB_RUN_ATTEMPT"');
    }
    expect(receiptBinding).toContain("production-break-glass-consumption.json");
    expect(pagesBinding).toContain("cloudflare-pages-runtime-evidence");
    expect(pagesWorkflow).toContain(
      "cloudflare-pages-runtime-${{ inputs.target }}-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(pagesWorkflow).toContain(
      "cloudflare-pages-runtime-${{ inputs.target }}-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}-binding",
    );
  });

  it("real authorization validation rejects every substituted dispatch identity", () => {
    for (const [label, overrides] of [
      ["wrong actor", { actor: "other" }],
      ["wrong triggering actor", { triggeringActor: "other" }],
      ["wrong current main SHA", { currentMainSha: "f".repeat(40) }],
      ["wrong workflow SHA", { workflowSha: "f".repeat(40) }],
      ["wrong checkout SHA", { checkoutSha: "f".repeat(40) }],
      ["wrong incident", { breakGlassIncidentId: "PERF-BOOTSTRAP-20260826-02" }],
      ["expired authorization", { breakGlassExpiresAt: "2026-08-26T09:59:59.999Z" }],
      ["attempt greater than one", { runAttempt: "2" }],
    ] as const) {
      expect(
        () => selectReleaseAuthorization(
          breakGlassInput(overrides),
          { now: "2026-08-26T10:00:00.000Z" },
        ),
        label,
      ).toThrow();
    }
  });

  it("real grant and approval validators reject changed reasons, mixed modes, and tampering", () => {
    const deployment = authorization();
    const approvalAuthorization = authorization("production-approval", "60");
    expect(() => validateReleaseAuthorizationGrant([
      deployment,
      { ...approvalAuthorization, reason_sha256: "0".repeat(64) },
    ])).toThrow(/grant|reason|authorization/i);
    expect(() => validateReleaseAuthorizationGrant([
      deployment,
      {
        mode: "standard",
        action: "production-approval",
        actor: "release-reviewer",
        release_sha: releaseSha,
        workflow_run_id: "60",
        workflow_run_attempt: "1",
      },
    ])).toThrow(/grant|authorization/i);

    const expected = {
      approval: approval(),
      sha: releaseSha,
      repository: "maiprop/maiprop-listing-site",
      sourceTree: "b".repeat(40),
      sourceRunId: "40",
      sourceRunAttempt: "1",
      artifactSha256: "c".repeat(64),
      stagingRunId: "50",
      stagingRunAttempt: "1",
      approvalRunId: "60",
      approvalRunAttempt: "1",
      deployActor: "krenios",
      allowedApprovers: ["release-reviewer"],
      expectedAuthorization: approvalAuthorization,
      now: new Date("2026-08-26T10:30:00.000Z"),
    };
    expect(validateReleaseApproval(expected)).toEqual(expected.approval);
    expect(() => validateReleaseApproval({
      ...expected,
      approval: {
        ...expected.approval,
        authorization: { ...approvalAuthorization, incident_id: "PERF-BOOTSTRAP-20260826-02" },
      },
    })).toThrow(/authorization/i);
  });

  it("executes the exact receipt listing guard against replay, duplicate, expiry, ID, and digest substitutions", () => {
    const exactName = `production-break-glass-consumed-pages-staging-${releaseSha}-${incidentId}`;
    const digest = "a".repeat(64);
    const artifact = {
      id: 101,
      name: exactName,
      expired: false,
      digest: `sha256:${digest}`,
      workflow_run: { id: 70, head_sha: releaseSha },
    };
    const listing = (artifacts: unknown[]) => ({ total_count: artifacts.length, artifacts });

    expect(runReceiptListingGuard(listing([]), "precheck", exactName).status).toBe(0);
    for (const candidate of [
      listing([artifact]),
      listing([artifact, { ...artifact, id: 102 }]),
      listing([{ ...artifact, expired: true }]),
    ]) {
      expect(runReceiptListingGuard(candidate, "precheck", exactName).status).not.toBe(0);
    }
    expect(runReceiptListingGuard(
      listing([artifact]),
      "postcheck",
      exactName,
      "101",
      digest,
    ).status).toBe(0);
    expect(runReceiptListingGuard(
      listing([artifact]),
      "postcheck",
      exactName,
      "102",
      digest,
    ).status).not.toBe(0);
    expect(runReceiptListingGuard(
      listing([artifact]),
      "postcheck",
      exactName,
      "101",
      "2".repeat(64),
    ).status).not.toBe(0);
  });

  it("real receipt and lease validators reject every receipt and binding identity substitution", () => {
    const expectedReceipt = {
      authorization: authorization(),
      action: "production-deploy",
      repository: "maiprop/maiprop-listing-site",
      workflowRef:
        "maiprop/maiprop-listing-site/.github/workflows/deploy-production-release.yml@refs/heads/main",
      workflowSha: releaseSha,
      runId: "70",
      runAttempt: "1",
    };
    expect(validateConsumptionReceipt(
      receipt(),
      expectedReceipt,
      { now: "2026-08-26T10:05:00.000Z" },
    )).toEqual(receipt());
    for (const [label, change] of [
      ["wrong action", { authorization: authorization("pages-production") }],
      ["wrong run", { workflow_run_id: "71" }],
      ["wrong attempt", { workflow_run_attempt: "2" }],
      ["wrong SHA", { workflow_sha: "f".repeat(40) }],
      ["wrong incident", { authorization: authorization("production-deploy", "70", {
        incident_id: "PERF-BOOTSTRAP-20260826-02",
      }) }],
    ] as const) {
      expect(
        () => validateConsumptionReceipt(
          receipt(change),
          expectedReceipt,
          { now: "2026-08-26T10:05:00.000Z" },
        ),
        label,
      ).toThrow();
    }

    expect(validateLease()).toEqual(lease());
    for (const [label, changedConsumption] of [
      ["wrong artifact ID", consumption({ artifact_id: "103" })],
      ["wrong artifact digest", consumption({ artifact_digest: "3".repeat(64) })],
      ["missing binding", (() => {
        const value = consumption() as Record<string, unknown>;
        delete value.binding_artifact_id;
        return value;
      })()],
      ["wrong binding ID", consumption({ binding_artifact_id: "104" })],
      ["wrong payload hash", consumption({ payload_sha256: "4".repeat(64) })],
      ["wrong parent run", consumption({ parent_run_id: "71" })],
      ["partial identity", { artifact_id: "101" }],
      ["extra identity", consumption({ unexpected: true })],
      ["uppercase identity", consumption({ artifact_digest: "A".repeat(64) })],
    ] as const) {
      expect(
        () => validateLease(lease({ consumption: changedConsumption })),
        label,
      ).toThrow(/consumption/i);
    }
  });

  it("parses exact receipt dependencies and exercises tuple mutation rejection for every lease renewal", () => {
    for (const jobName of [
      "archive-production-source",
      "deploy-production-database",
      "renew-edge-mutation-lease",
      "deploy-production-edge",
      "renew-cloudflare-mutation-lease",
      "deploy-production-cloudflare",
      "attest-production-release",
    ]) {
      const job = parsedProduction.jobs[jobName];
      const needs = Array.isArray(job.needs) ? job.needs : [job.needs];
      expect(needs, jobName).toContain("consume-break-glass-authorization");
      expect(String(job.if ?? ""), jobName).toContain(
        "consume-break-glass-authorization.result == 'success'",
      );
    }
    for (const jobName of ["renew-edge-mutation-lease", "renew-cloudflare-mutation-lease"]) {
      const job = parsedProduction.jobs[jobName];
      const renewal = job.steps.find(
        (step: WorkflowStep) => /create fresh .* mutation lease/i.test(step.name),
      );
      expect(renewal.run, jobName).toContain("previous.authorization");
      expect(renewal.run, jobName).toContain("previous.consumption");
      expect(renewal.run, jobName).toContain("--authorization-file");
      expect(renewal.run, jobName).toContain("--consumption-file");
      expect(() => validateLease(lease({
        consumption: consumption({ payload_sha256: jobName === "renew-edge-mutation-lease"
          ? "5".repeat(64)
          : "6".repeat(64) }),
      })), jobName).toThrow(/consumption/i);
    }
  });

  it("parses each proof's own authorization action and shared grant comparison", () => {
    const contract = parsedProduction.jobs.validate.steps.find(
      (step: WorkflowStep) => step.name === "Require current main and final exact-SHA readiness",
    );
    expect(contract.run).toContain("validateReleaseAuthorizationGrant");
    for (const [proof, action] of [
      ["stripe", "stripe-readiness"],
      ["pages-staging", "pages-staging"],
      ["pages-production", "pages-production"],
      ["approval", "production-approval"],
    ]) {
      expect(contract.run, proof).toContain(`action: "${action}"`);
    }
    for (const missing of ["pages-staging", "pages-production"]) {
      const grants = [
        authorization("stripe-readiness", "80"),
        authorization("pages-staging", "81"),
        authorization("pages-production", "82"),
        authorization("production-approval", "60"),
      ].filter((record) => record.action !== missing);
      expect(grants).toHaveLength(3);
      expect(contract.run, missing).toContain(`pages-${missing.split("-")[1]}`);
    }
    expect(() => validateReleaseAuthorizationGrant([
      authorization("stripe-readiness", "80"),
      authorization("pages-staging", "81"),
      authorization("pages-production", "82", { incident_id: "PERF-BOOTSTRAP-20260826-02" }),
      authorization("production-approval", "60"),
    ])).toThrow(/grant|authorization/i);
  });

  it("keeps standalone recovery on the legacy standard sentinel and rejects a direct break-glass route", () => {
    const dispatch = parsedDirectRecovery.on.workflow_dispatch.inputs;
    expect(dispatch.single_admin_break_glass).toBeUndefined();
    expect(dispatch.incident_id).toBeUndefined();
    expect(dispatch.reason).toBeUndefined();
    expect(directRecoveryWorkflow).not.toContain("production-break-glass-validation.mjs");
    const directCall = parsedDirectRecovery.jobs["deploy-production-cloudflare"].with;
    expect(directCall.authorization_mode).toBeUndefined();
    expect(directCall.authorization_sha256).toBeUndefined();
    expect(directCall.consumption_artifact_id).toBeUndefined();
    const reusableInputs = parsedCloudflare.on.workflow_call.inputs;
    expect(reusableInputs.authorization_mode.default).toBe("standard");
    expect(reusableInputs.authorization_sha256.default).toBe("");
    expect(reusableInputs.consumption_artifact_id.default).toBe("");
    expect(runCloudflareAuthorizationGuard().status).toBe(0);
    expect(runCloudflareAuthorizationGuard({
      DECLARED_AUTHORIZATION_MODE: "break_glass",
    }).status).not.toBe(0);
    expect(runCloudflareAuthorizationGuard({
      EXPECTED_AUTHORIZATION_SHA256: "A".repeat(64),
    }).status).not.toBe(0);
  });

  it("preserves exact-millisecond forward-start rollback authorization and hash propagation", () => {
    const deploy = parsedCloudflare.jobs.deploy.steps.find(
      (step: WorkflowStep) => step.name === "Deploy exact immutable production artifact",
    );
    const rollback = parsedCloudflare.jobs.deploy.steps.find(
      (step: WorkflowStep) => step.name === "Roll back failed production candidate",
    );
    const forwardStart = deploy.run.indexOf("forward_mutation_started_at=");
    const boundaryValidation = deploy.run.indexOf(
      "production-release-validation.mjs\" mutation-lease",
      forwardStart,
    );
    const mutation = deploy.run.indexOf("wrangler pages deploy", forwardStart);
    expect(forwardStart).toBeGreaterThanOrEqual(0);
    expect(boundaryValidation).toBeGreaterThan(forwardStart);
    expect(mutation).toBeGreaterThan(boundaryValidation);
    expect(deploy.run.slice(forwardStart, mutation)).toContain(
      '--now "$forward_mutation_started_at"',
    );
    expect(rollback.env.FORWARD_MUTATION_STARTED_AT).toBe(
      "${{ steps.deploy.outputs.forward_mutation_started_at }}",
    );
    expect(rollback.run).toContain("Date.parse(process.env.FORWARD_MUTATION_STARTED_AT)");
    for (const source of [workflows.database, workflows.edge, cloudflareWorkflow, productionWorkflow]) {
      expect(source).toContain("authorization_sha256");
      expect(source).toContain("consumption_sha256");
    }
    expect(JSON.stringify([
      parsedPages,
      parsedProduction,
      parsedCloudflare,
    ])).not.toContain("Emergency release to restore production performance safely.");
  });
});
