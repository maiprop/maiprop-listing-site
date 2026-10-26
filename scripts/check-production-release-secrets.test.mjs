import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import yaml from "js-yaml";

const CALLED_WORKFLOWS = [
  ".github/workflows/deploy-supabase-production-db.yml",
  ".github/workflows/deploy-edge-functions.yml",
];
const CALLER_WORKFLOW = ".github/workflows/deploy-production-release.yml";

function loadWorkflow(path) {
  const text = readFileSync(path, "utf8");
  return { text, parsed: yaml.load(text) };
}

function referencedSecrets(workflowText) {
  const names = new Set();
  for (const match of workflowText.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
    names.add(match[1]);
  }
  return [...names].sort();
}

function callerSecretsFor(caller, workflowFile) {
  const passed = new Set();
  for (const [jobId, job] of Object.entries(caller.parsed.jobs ?? {})) {
    if (job?.uses?.endsWith(workflowFile)) {
      for (const name of Object.keys(job.secrets ?? {})) {
        passed.add(name);
      }
    }
  }
  return { jobIds: Object.keys(caller.parsed.jobs ?? {}).filter((jobId) => caller.parsed.jobs[jobId]?.uses?.endsWith(workflowFile)), passed: [...passed].sort() };
}

describe("production release secret wiring", () => {
  it("declares every secret referenced by the coordinated database and Edge workflows", () => {
    for (const path of CALLED_WORKFLOWS) {
      const workflow = loadWorkflow(path);
      const declared = Object.keys(
        workflow.parsed.on?.workflow_call?.secrets ?? {},
      );
      for (const name of referencedSecrets(workflow.text)) {
        expect(
          declared,
          `${path} references secrets.${name} without declaring it`,
        ).toContain(name);
      }
    }
  });

  it("passes every declared secret from the coordinated production release", () => {
    const caller = loadWorkflow(CALLER_WORKFLOW);
    for (const path of CALLED_WORKFLOWS) {
      const file = path.split("/").pop();
      const called = loadWorkflow(path);
      const declared = Object.keys(
        called.parsed.on?.workflow_call?.secrets ?? {},
      );
      expect(declared.length).toBeGreaterThan(0);
      const { jobIds, passed } = callerSecretsFor(caller, file);
      expect(
        jobIds,
        `${CALLER_WORKFLOW} must call ${file}`,
      ).not.toHaveLength(0);
      for (const name of declared) {
        expect(
          passed,
          `${CALLER_WORKFLOW} must pass ${name} to ${file}`,
        ).toContain(name);
      }
    }
  });
});
