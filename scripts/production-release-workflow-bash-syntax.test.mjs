import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";

const testRuntime =
  typeof globalThis.describe === "function" && typeof globalThis.it === "function"
    ? globalThis
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const { describe, it } = testRuntime;

const root = resolve(import.meta.dirname, "..");
const releaseWorkflows = [
  "approve-production-release.yml",
  "deploy-edge-functions.yml",
  "deploy-production-release.yml",
  "deploy-supabase-production-db.yml",
  "direct-cloudflare-production-deploy.yml",
  "provision-cloudflare-pages-runtime.yml",
  "reusable-cloudflare-production-deploy.yml",
  "verify-stripe-live-readiness.yml",
];

function bashSyntax(source) {
  const command = process.platform === "win32" ? "wsl.exe" : "bash";
  const args = process.platform === "win32" ? ["--exec", "bash", "-n"] : ["-n"];
  return spawnSync(command, args, { input: source, encoding: "utf8" });
}

function generatedShellBodies(source) {
  const bodies = [];
  const pattern = /cat\s+>\s+(?:"[^"\n]+\.sh"|'[^'\n]+\.sh'|[^\s\n]+\.sh)\s+<<'([A-Z][A-Z0-9_]*)'\n([\s\S]*?)\n\1(?=\n|$)/g;
  for (const match of source.matchAll(pattern)) bodies.push(match[2]);
  return bodies;
}

describe("changed production release workflow Bash syntax", () => {
  it("parses every Bash run block and generated helper shell", { timeout: 180_000 }, () => {
    let runBlockCount = 0;
    let helperCount = 0;
    for (const relative of releaseWorkflows) {
      const file = resolve(root, ".github", "workflows", relative);
      const parsed = yaml.load(readFileSync(file, "utf8"));
      for (const [jobName, job] of Object.entries(parsed.jobs ?? {})) {
        for (const [stepIndex, step] of (job.steps ?? []).entries()) {
          if (typeof step.run !== "string") continue;
          runBlockCount += 1;
          const result = bashSyntax(step.run);
          assert.equal(
            result.status,
            0,
            `${relative}:${jobName}:step-${stepIndex}:${step.name ?? "unnamed"}\n${result.stderr}`,
          );
          for (const [helperIndex, helper] of generatedShellBodies(step.run).entries()) {
            helperCount += 1;
            const helperResult = bashSyntax(helper);
            assert.equal(
              helperResult.status,
              0,
              `${relative}:${jobName}:step-${stepIndex}:helper-${helperIndex}\n${helperResult.stderr}`,
            );
          }
        }
      }
    }
    assert.equal(runBlockCount, 143);
    assert.ok(helperCount > 0, "no generated release helper shell bodies were checked");
  });
});
