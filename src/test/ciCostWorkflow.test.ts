import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type WorkflowStep = {
  name?: string;
  run?: string;
};

type Workflow = {
  jobs: Record<string, { steps: WorkflowStep[] }>;
};

const workflow = load(
  readFileSync(".github/workflows/ci.yml", "utf8"),
) as Workflow;
const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};
const coverageRunner = readFileSync(
  "scripts/run-vitest-coverage.mjs",
  "utf8",
);
const performanceRunner = readFileSync(
  "scripts/run-performance-tests.mjs",
  "utf8",
);

function runCommands(jobName: string): string[] {
  return workflow.jobs[jobName].steps
    .map((step) => step.run?.trim())
    .filter((command): command is string => Boolean(command));
}

describe("CI command ownership", () => {
  it("runs the full Vitest suite once through coverage and retains the excluded catalogue gate", () => {
    const commands = runCommands("quality");

    expect(packageJson.scripts.test).toBe("vitest run");
    expect(packageJson.scripts["test:coverage"]).toBe(
      "node scripts/run-vitest-coverage.mjs",
    );
    expect(coverageRunner).toContain(
      'spawn(process.execPath, [vitestBin, "run", "--coverage"]',
    );
    expect(commands.filter((command) => command === "npm test")).toHaveLength(0);
    expect(
      commands.filter((command) => command === "npm run test:coverage"),
    ).toHaveLength(1);
    expect(commands).toContain("npm run test:catalogue-hotfix");
  });

  it("builds the E2E app once in the performance runner before smoke and auth consume it", () => {
    const commands = runCommands("e2e");
    const performanceIndex = commands.indexOf("npm run test:perf");
    const smokeIndex = commands.findIndex((command) =>
      command.includes("playwright test --project=chromium --grep-invert @perf"),
    );
    const ownedBuild = performanceRunner.indexOf(
      'runNodeCli(npmCli, ["run", "build"], env)',
    );
    const performanceTests = performanceRunner.indexOf(
      '"e2e/performance-gates.spec.ts"',
    );

    expect(packageJson.scripts["test:perf"]).toBe(
      "node scripts/run-performance-tests.mjs",
    );
    expect(commands.filter((command) => command === "npm run build")).toHaveLength(
      0,
    );
    expect(performanceIndex).toBeGreaterThanOrEqual(0);
    expect(smokeIndex).toBeGreaterThan(performanceIndex);
    expect(ownedBuild).toBeGreaterThanOrEqual(0);
    expect(performanceTests).toBeGreaterThan(ownedBuild);
  });
});
