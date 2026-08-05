import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const normalizeNewlines = (value: string) => value.replace(/\r\n/g, "\n");

const workflow = normalizeNewlines(
  readFileSync(".github/workflows/deploy-edge-functions.yml", "utf8"),
);
const stagingWorkflow = readFileSync(
  ".github/workflows/reusable-supabase-staging.yml",
  "utf8",
).replace(/\r\n/g, "\n");

function stagingStepBlock(name: string): string {
  const marker = `      - name: ${name}`;
  const start = stagingWorkflow.indexOf(marker);

  expect(start).toBeGreaterThanOrEqual(0);

  const nextStep = stagingWorkflow.indexOf("\n      - name:", start + marker.length);
  return stagingWorkflow.slice(start, nextStep === -1 ? stagingWorkflow.length : nextStep);
}

describe("production Edge Function deploy workflow", () => {
  it("promotes exact artifact Edge source through a protected reusable workflow", () => {
    const parsed = yaml.load(workflow) as { concurrency?: unknown };

    expect(workflow).toContain("workflow_call:");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(parsed.concurrency).toBeUndefined();
    expect(workflow).toContain("environment: production");
    expect(workflow).toContain('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"');
    expect(workflow).toContain("Download immutable release candidate");
    expect(workflow).toContain("Verify signed staging release attestation");
    expect(workflow).toContain("Verify production database evidence");
    expect(workflow).toContain("Validate current production mutation lease");
    expect(workflow).toContain("Revalidate current main and mutation lease before Edge mutation");
    expect(workflow).toContain("--supabase-workdir release-candidate");
    expect(workflow).toContain("assertEdgeSourceManifestParity");
    expect(workflow).toContain("assertEdgeBundleParity");
    expect(workflow).toMatch(
      /npx --no-install supabase --workdir release-candidate functions deploy "\$function_name" \\\n+\s+--use-api \\\n+\s+--project-ref[\s\S]*?--jobs 1/,
    );
    expect(workflow).toContain("buildEdgeForwardConvergencePlan");
    expect(workflow).toContain("production-edge-deploy-progress.jsonl");
    expect(workflow).toContain("--require-live-source-evidence");
    expect(workflow).toContain("actions/attest-build-provenance@");
    expect(workflow).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(stagingWorkflow).toMatch(
      /npx --no-install supabase --workdir release-candidate functions deploy \\\n+\s+--use-api \\\n+\s+--project-ref/,
    );
  });

  it("requires an isolated target and blocks on post-deploy staging live drift", () => {
    const deployStepName = "Deploy edge functions to staging";
    const postDeployStepName = "Capture staging live function drift inventory";

    const deployStep = stagingStepBlock(deployStepName);
    const postDeployStep = stagingStepBlock(postDeployStepName);

    expect(stagingWorkflow.indexOf(deployStepName)).toBeLessThan(stagingWorkflow.indexOf(postDeployStepName));
    expect(deployStep).toContain("node scripts/assert-staging-mutation-target.mjs");
    expect(deployStep).toContain("STAGING_MUTATION_ACKNOWLEDGEMENT");
    expect(deployStep).toContain("github-staging-lease");
    expect(deployStep.indexOf("github-staging-lease")).toBeLessThan(
      deployStep.indexOf("functions deploy"),
    );
    expect(deployStep).toContain("--workdir release-candidate");
    expect(postDeployStep).toContain("release-safety-staging-live-functions.json");
    expect(postDeployStep).toContain("--supabase-workdir release-candidate");
    expect(postDeployStep).toContain("--require-live-source-evidence");
    expect(postDeployStep).not.toContain("continue-on-error");
  });
});
