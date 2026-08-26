import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

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

function stepBlock(source: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  expect(start, name).toBeGreaterThanOrEqual(0);
  const next = source.indexOf("\n      - name:", start + marker.length);
  return source.slice(start, next === -1 ? source.length : next);
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
});
