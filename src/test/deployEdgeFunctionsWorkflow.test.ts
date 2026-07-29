import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
  it("keeps production Edge mutations disabled and stages with Supabase server-side bundling", () => {
    expect(workflow).toContain("Production Edge deployment disabled");
    expect(workflow).toContain("Production Edge Function mutations are disabled");
    expect(workflow).toContain("if: ${{ false }}");
    expect(workflow).not.toContain("supabase functions deploy");
    expect(stagingWorkflow).toMatch(
      /supabase functions deploy \\\n+\s+--use-api \\\n+\s+--project-ref/,
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
    expect(postDeployStep).toContain("release-safety-staging-live-functions.json");
    expect(postDeployStep).toContain("--require-live-source-evidence");
    expect(postDeployStep).not.toContain("continue-on-error");
  });
});
