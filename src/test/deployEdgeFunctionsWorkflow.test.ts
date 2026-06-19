import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/deploy-edge-functions.yml", "utf8");

function stepBlock(name: string): string {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);

  expect(start).toBeGreaterThanOrEqual(0);

  const nextStep = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, nextStep === -1 ? workflow.length : nextStep);
}

describe("production Edge Function deploy workflow", () => {
  it("lets first-time function deploys proceed while keeping post-deploy live drift blocking", () => {
    const preDeployStepName = "Capture pre-deploy production live function drift inventory";
    const deployStepName = "Deploy functions";
    const postDeployStepName = "Capture production live function drift inventory after deploy";

    const preDeployStep = stepBlock(preDeployStepName);
    const postDeployStep = stepBlock(postDeployStepName);

    expect(workflow.indexOf(preDeployStepName)).toBeLessThan(workflow.indexOf(deployStepName));
    expect(workflow.indexOf(deployStepName)).toBeLessThan(workflow.indexOf(postDeployStepName));

    expect(preDeployStep).toContain("continue-on-error: true");
    expect(preDeployStep).toContain("release-safety-production-live-functions.json");
    expect(postDeployStep).toContain("release-safety-production-live-functions-after.json");
    expect(postDeployStep).not.toContain("continue-on-error");
  });
});
