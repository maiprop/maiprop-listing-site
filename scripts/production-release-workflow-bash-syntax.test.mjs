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
  "deploy-advisor-index.yml",
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
  it("makes every referenced production job output available through a direct dependency", () => {
    const parsed = yaml.load(readFileSync(
      resolve(root, ".github/workflows/deploy-production-release.yml"), "utf8",
    ));
    for (const [jobName, job] of Object.entries(parsed.jobs)) {
      const dependencies = new Set([job.needs ?? []].flat());
      for (const expression of JSON.stringify(job).matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
        for (const reference of expression[1].matchAll(/\bneeds\.([\w-]+)\./g)) {
          assert.ok(dependencies.has(reference[1]),
            `${jobName} references ${reference[1]} without a direct dependency`);
        }
      }
    }
  });

  for (const workflow of ["deploy-production-release.yml", "stage-release.yml"]) {
    it(`${workflow} requests archive bytes with a single Accept header`, () => {
      const parsed = yaml.load(readFileSync(
        resolve(root, ".github/workflows", workflow), "utf8",
      ));
      const step = Object.values(parsed.jobs).flatMap((job) => job.steps ?? [])
        .find((entry) => entry.run?.includes("github_api()"));
      const helper = step.run.match(/^github_api\(\) \{\n[\s\S]*?^\}/m)?.[0];
      assert.ok(helper, "archive API helper must exist");
      const source = [
        'gh() { printf "%s\\n" "$@"; }',
        helper,
        'github_api -H "Accept: application/octet-stream" "repos/example/app/releases/assets/123"',
      ].join("\n");
      const command = process.platform === "win32" ? "wsl.exe" : "bash";
      const args = process.platform === "win32" ? ["--exec", "bash"] : [];
      const result = spawnSync(command, args, { input: source, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      const forwarded = result.stdout.trim().split("\n");
      assert.deepEqual(forwarded.filter((arg) => arg.startsWith("Accept:")), [
        "Accept: application/octet-stream",
      ]);
      assert.ok(forwarded.includes("X-GitHub-Api-Version: 2026-03-10"));
    });
  }

  it("passes the selected Stripe proof run ID to the authorization validator", () => {
    const parsed = yaml.load(readFileSync(
      resolve(root, ".github/workflows/deploy-production-release.yml"), "utf8",
    ));
    const step = parsed.jobs.validate.steps.find(
      (entry) => entry.name === "Require current main and final exact-SHA readiness",
    );
    const exports = step.run.match(/^export [A-Za-z_][A-Za-z_0-9 ]*$/gm) ?? [];
    const source = [
      "unset STRIPE_READINESS_RUN_ID",
      "STRIPE_READINESS_RUN_ID=123456789",
      ...exports,
      "printenv STRIPE_READINESS_RUN_ID",
    ].join("\n");
    const command = process.platform === "win32" ? "wsl.exe" : "bash";
    const args = process.platform === "win32" ? ["--exec", "bash"] : [];
    const result = spawnSync(command, args, { input: source, encoding: "utf8" });
    assert.equal(result.stdout.trim(), "123456789", result.stderr);
    assert.equal(result.status, 0, result.stderr);
  });

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
    assert.equal(runBlockCount, 155);
    assert.ok(helperCount > 0, "no generated release helper shell bodies were checked");
  });
});
