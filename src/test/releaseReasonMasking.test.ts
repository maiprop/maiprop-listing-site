import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = { name?: string; uses?: string; run?: string; env?: Record<string, unknown>; if?: unknown; "continue-on-error"?: unknown };
type Job = { env?: Record<string, unknown>; steps: Step[] };
type Workflow = { env?: Record<string, unknown>; jobs: Record<string, Job> };
const guardName = "Mask release reason before logging";
const sites = [
  ["verify-stripe-live-readiness.yml", "verify-stripe-readiness", "Reject non-main, rerun, or substituted actor execution"],
  ["provision-cloudflare-pages-runtime.yml", "provision", "Verify exact current-main control identity"],
  ["approve-production-release.yml", "approve", "Verify trusted exact current-main control identity"],
  ["deploy-production-release.yml", "validate", "Verify trusted exact current-main control identity"],
  ["deploy-production-release.yml", "consume-break-glass-authorization", null],
] as const;

function load(file: string): Workflow {
  return yaml.load(readFileSync(resolve(".github/workflows", file), "utf8")) as Workflow;
}

function exposesReason(value: unknown): boolean {
  return /inputs\s*(?:\.\s*reason|\[\s*['"]reason['"]\s*\])|RELEASE_REASON|toJSON\s*\(\s*(?:github\.event\.)?inputs\b/i.test(JSON.stringify(value));
}

function extractedScript(workflow: Workflow, jobName: string): string {
  const guards = workflow.jobs[jobName].steps.filter(step => step.name === guardName);
  expect(guards).toHaveLength(1);
  const guard = guards[0];
  expect(Object.keys(guard).sort()).toEqual(["name", "run"]);
  expect(guard.run).not.toMatch(/\$\{\{/);
  expect(guard.run).toContain("GITHUB_EVENT_PATH");
  const match = guard.run?.match(/^node <<'NODE'\n([\s\S]+)\nNODE\n?$/);
  expect(match, "guard must execute constant inline Node").not.toBeNull();
  expect(match![1].match(/require\([^)]+\)/g)).toEqual(['require("node:fs")']);
  expect(match![1].match(/process\.env\.[A-Z_]+/g)).toEqual(["process.env.GITHUB_EVENT_PATH"]);
  return match![1];
}

function guardScript(workflow: Workflow, jobName: string, gateName: string | null): string {
  const { jobs, ...workflowSettings } = workflow;
  expect(exposesReason(workflowSettings)).toBe(false);
  const { steps, ...jobSettings } = jobs[jobName];
  expect(exposesReason(jobSettings)).toBe(false);
  const guardIndex = gateName === null ? 0 : 1;
  if (gateName !== null) expect(steps[0].name).toBe(gateName);
  expect(steps[guardIndex].name).toBe(guardName);
  const checkoutIndex = steps.findIndex(step => step.uses?.startsWith("actions/checkout@"));
  expect(checkoutIndex).toBeGreaterThan(guardIndex);
  const script = extractedScript(workflow, jobName);
  const exposures = steps.flatMap((step, index) => exposesReason(step) ? [index] : []);
  expect(exposures.length).toBeGreaterThan(0);
  expect(exposures.every(index => index > guardIndex)).toBe(true);
  return script;
}

function execute(script: string, event: string | undefined) {
  const directory = mkdtempSync(join(tmpdir(), "reason-mask-"));
  try {
    const eventPath = join(directory, "event.json");
    if (event !== undefined) writeFileSync(eventPath, event);
    const result = spawnSync(process.execPath, ["-e", script], {
      env: { GITHUB_EVENT_PATH: eventPath }, encoding: "utf8", timeout: 5000, windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    return result;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe.each(sites)("release reason masking: %s / %s", (file, jobName, gateName) => {
  it("keeps the trusted gate first and masks before checkout and every raw reason exposure", () => {
    guardScript(load(file), jobName, gateName);
  });

  it("emits only the escaped masking protocol for valid synthetic reasons", () => {
    const script = extractedScript(load(file), jobName);
    const punctuation = Array.from({ length: 95 }, (_, index) => String.fromCharCode(32 + index)).join("");
    for (const reason of ["R".repeat(20), "R".repeat(500), punctuation,
      "Synthetic 100% reason: 'quotes' \"double\" `backtick` $() ::warning:: %0A %0D %25",
      "  Synthetic padded reason for local tests  ", "  " + "R".repeat(500) + "  "]) {
      const result = execute(script, JSON.stringify({ inputs: { reason } }));
      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe(`::add-mask::${reason.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}\n`);
    }
  });

  it("keeps standard empty or missing input silent", () => {
    const script = extractedScript(load(file), jobName);
    for (const event of [{}, { inputs: {} }, { inputs: { reason: "" } }]) {
      const result = execute(script, JSON.stringify(event));
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    }
  });

  it("rejects invalid input with a generic error and no fixture leakage", () => {
    const script = extractedScript(load(file), jobName);
    const invalidReasons = [null, true, 12345, {}, ["SYNTHETIC_INVALID_REASON"],
      "x".repeat(19), "x".repeat(501), " ".repeat(20), " padded too short ",
      "  " + "x".repeat(19) + "  ", "  " + "x".repeat(501) + "  ",
      "SYNTHETIC_INVALID_REASON\n", "SYNTHETIC_INVALID_REASON\rINJECTED",
      "SYNTHETIC_INVALID_REASON\t", "SYNTHETIC_INVALID_REASON\0", "SYNTHETIC_INVALID_REASON\x7f",
      "SYNTHETIC_INVALID_REASON\u00e9", "SYNTHETIC_INVALID_REASON\u2028"];
    const events = invalidReasons.map(reason => JSON.stringify({ inputs: { reason } }));
    events.push('{"inputs":{"reason":"SYNTHETIC_MALFORMED_JSON', "null");
    for (const event of [...events, undefined]) {
      const result = execute(script, event);
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("Invalid release reason input.\n");
    }
  });

  it("detects removal, late execution, conditional execution and interpolation", () => {
    const original = load(file);
    guardScript(original, jobName, gateName);
    const index = gateName === null ? 0 : 1;
    for (const mutate of [
      (job: Job) => { job.steps.splice(index, 1); },
      (job: Job) => { job.steps.push(job.steps.splice(index, 1)[0]); },
      (job: Job) => { job.steps[index].if = "${{ inputs.single_admin_break_glass }}"; },
      (job: Job) => { job.steps[index]["continue-on-error"] = true; },
      (job: Job) => { job.steps[index].env = { RELEASE_REASON: "${{ inputs.reason }}" }; },
      (job: Job) => { job.steps[index].run += "\n${{ inputs.reason }}"; },
      (job: Job) => { job.steps[0].run += "\n${{ inputs.reason }}"; },
      (job: Job) => { job.steps[0].env = { RELEASE_REASON: "${{ inputs.reason }}" }; },
      (job: Job) => { job.env = { RELEASE_REASON: "${{ inputs.reason }}" }; },
    ]) {
      const changed = structuredClone(original);
      mutate(changed.jobs[jobName]);
      expect(() => guardScript(changed, jobName, gateName)).toThrow();
    }
  });
});

it("covers exactly the five jobs that expose the raw reason across all four workflows", () => {
  const actual: string[] = [];
  for (const file of new Set(sites.map(([name]) => name))) {
    const workflow = load(file);
    for (const [name, job] of Object.entries(workflow.jobs)) {
      const guards = (job.steps ?? []).filter(step => step.name === guardName);
      if (exposesReason(job)) expect(guards).toHaveLength(1);
      for (const guard of guards) {
        const site = sites.find(([siteFile, siteJob]) => siteFile === file && siteJob === name);
        expect(site).toBeDefined();
        guardScript(workflow, name, site![2]);
        expect(guard).toBe(job.steps[site![2] === null ? 0 : 1]);
        actual.push(`${file}/${name}`);
      }
    }
  }
  expect(actual.sort()).toEqual(sites.map(([file, name]) => `${file}/${name}`).sort());
});
