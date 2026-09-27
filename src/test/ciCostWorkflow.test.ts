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
    .flatMap((step) => step.run?.split(/\r?\n/).map(line => line.trim()) ?? [])
    .filter((command): command is string => Boolean(command));
}

function npmCommands(blocks: string[]): string[] {
  return blocks.flatMap(block => block.split(/\r?\n/).flatMap(line => {
    const match = line.trim().match(/^npm\s+(test|run\s+(?:test|test:coverage|test:perf|test:catalogue-hotfix|build))(?=\s|$)/);
    return match ? [`npm ${match[1].replace(/\s+/g, " ").replace(/^run test$/, "test")}`] : [];
  }));
}

describe("CI npm command matcher", () => {
  it("recognizes trailing arguments and multiline run blocks", () => {
    expect(npmCommands(["echo prepare\nnpm test -- --reporter=dot\nnpm run build -- --mode production\n"])).toEqual(["npm test", "npm run build"]);
  });
  it("counts both performance invocations while ignoring comments and similarly named scripts", () => {
    expect(npmCommands(["# npm run test:perf\nnpm run test:perf -- --reporter=dot\nnpm run test:performance\nnpm run test:perf"])).toEqual(["npm run test:perf", "npm run test:perf"]);
  });
});

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
    expect(npmCommands(commands).filter((command) => command === "npm test")).toHaveLength(0);
    expect(
      npmCommands(commands).filter((command) => command === "npm run test:coverage"),
    ).toHaveLength(1);
    expect(npmCommands(commands)).toContain("npm run test:catalogue-hotfix");
  });

  it("builds the E2E app once in the performance runner before smoke and auth consume it", () => {
    const commands = runCommands("e2e");
    const performanceIndex = commands.findIndex(command => npmCommands([command]).includes("npm run test:perf"));
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
    expect(npmCommands(commands).filter((command) => command === "npm run build")).toHaveLength(
      0,
    );
    expect(performanceIndex).toBeGreaterThanOrEqual(0);
    expect(npmCommands(commands).filter(command => command === "npm run test:perf")).toHaveLength(1);
    expect(smokeIndex).toBeGreaterThan(performanceIndex);
    expect(ownedBuild).toBeGreaterThanOrEqual(0);
    expect(performanceTests).toBeGreaterThan(ownedBuild);
  });
});
