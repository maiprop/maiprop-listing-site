import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const workflowSource = readFileSync(
  resolve(".github/workflows/verify-stripe-live-readiness.yml"),
  "utf8",
);
const workflow = yaml.load(workflowSource);
const job = workflow.jobs["verify-live-catalogue"];

describe("Stripe live readiness workflow", () => {
  it("uses GitHub Free-compatible signed artifact controls", () => {
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(job.environment).toBeUndefined();

    const upload = job.steps.find((step) =>
      step.name === "Upload signed live-catalogue evidence"
    );
    expect(upload.with).toMatchObject({
      name: "stripe-live-readiness-${{ inputs.release_sha }}-${{ github.run_id }}-1",
      path: "stripe-live-migration-evidence.json",
      "if-no-files-found": "error",
      "retention-days": 30,
    });

    expect(workflowSource).not.toContain("actions/attest-build-provenance@");
    expect(workflowSource).not.toContain("attestations: write");
    expect(workflowSource).not.toContain("id-token: write");
  });

  it("binds the trusted workflow source and original allowlisted dispatcher", () => {
    const guard = job.steps.find((step) =>
      step.name === "Reject reruns and substituted actors"
    );
    expect(guard.env).toMatchObject({
      RELEASE_SHA: "${{ inputs.release_sha }}",
      EVENT_SHA: "${{ github.sha }}",
      WORKFLOW_SHA: "${{ github.workflow_sha }}",
      WORKFLOW_REF: "${{ github.workflow_ref }}",
      REPOSITORY: "${{ github.repository }}",
      ALLOWED_ACTORS: "${{ vars.PRODUCTION_RELEASE_APPROVERS }}",
    });
    expect(guard.run).toContain('[ "$EVENT_SHA" != "$RELEASE_SHA" ]');
    expect(guard.run).toContain('[ "$WORKFLOW_SHA" != "$RELEASE_SHA" ]');
    expect(guard.run).toContain(
      'EXPECTED_WORKFLOW_REF="${GITHUB_REPOSITORY}/.github/workflows/verify-stripe-live-readiness.yml@refs/heads/main"',
    );
    expect(guard.run).toContain('[ "$WORKFLOW_REF" != "$EXPECTED_WORKFLOW_REF" ]');
    expect(guard.run).toContain('[ "$REPOSITORY" != "maiprop/maiprop-listing-site" ]');
    expect(guard.run).toContain('case ",${ALLOWED_ACTORS// /}," in');
    expect(guard.run).toContain('*,"$ACTOR",*)');
    expect(guard.run).toContain("dispatcher is not allowlisted");
  });

  it("signs exact workflow provenance with repository-scoped credentials", () => {
    const generate = job.steps.find((step) =>
      step.name === "Generate and verify signed live-catalogue evidence"
    );
    expect(generate.env).toMatchObject({
      RELEASE_EVIDENCE_SIGNING_KEY:
        "${{ secrets.RELEASE_EVIDENCE_SIGNING_KEY }}",
      RELEASE_EVIDENCE_SIGNING_KEY_ID:
        "${{ vars.RELEASE_EVIDENCE_SIGNING_KEY_ID }}",
      STRIPE_RESTRICTED_KEY: "${{ secrets.STRIPE_RESTRICTED_KEY }}",
      WORKFLOW_SHA: "${{ github.workflow_sha }}",
      WORKFLOW_REF: "${{ github.workflow_ref }}",
      REPOSITORY: "${{ github.repository }}",
      ACTOR: "${{ github.actor }}",
      TRIGGERING_ACTOR: "${{ github.triggering_actor }}",
      EVENT_NAME: "${{ github.event_name }}",
    });
    expect(generate.run).toContain('--workflow-sha "$WORKFLOW_SHA"');
    expect(generate.run).toContain('--workflow-ref "$WORKFLOW_REF"');
    expect(generate.run).toContain('--repository "$REPOSITORY"');
    expect(generate.run).toContain('--actor "$ACTOR"');
    expect(generate.run).toContain("verify:stripe-live-migration-evidence");
  });
});
