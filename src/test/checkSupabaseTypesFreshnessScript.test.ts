import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const scriptPath = resolve("scripts/check-supabase-types-freshness.cjs");

function runTypesFreshnessScript(env: NodeJS.ProcessEnv) {
  return new Promise<{ status: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        SUPABASE_ACCESS_TOKEN: "",
        SUPABASE_PROJECT_REF: "",
        STAGING_SUPABASE_PROJECT_ID: "",
        VITE_SUPABASE_PROJECT_ID: "",
      },
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stderr });
    });
  });
}

function runTypesFreshnessScriptIn(cwd: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<{ status: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      env: {
        ...process.env,
        ...env,
      },
    });

    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ status, stderr });
    });
  });
}

describe("check-supabase-types-freshness script", () => {
  it("fails in CI when generated-type credentials are unavailable", async () => {
    const result = await runTypesFreshnessScript({ CI: "true" });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing");
    expect(result.stderr).toContain("SUPABASE_ACCESS_TOKEN");
  });

  it("keeps local credential-free runs non-blocking", async () => {
    const result = await runTypesFreshnessScript({ CI: "" });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("skipped live freshness check");
  });

  it("treats Supabase schema-cache retries as transient when allowed", async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), "maiprop-supabase-types-"));
    try {
      mkdirSync(join(tempRoot, "node_modules", "supabase", "dist"), { recursive: true });
      mkdirSync(join(tempRoot, "src", "integrations", "supabase"), { recursive: true });
      writeFileSync(join(tempRoot, "src", "integrations", "supabase", "types.ts"), "export type Database = {};\n");
      writeFileSync(
        join(tempRoot, "node_modules", "supabase", "dist", "supabase.js"),
        [
          "process.stderr.write(",
          "  'failed to retrieve generated types: {\"message\":\"{\\\\\"code\\\\\":\\\\\"PGRST002\\\\\",\\\\\"message\\\\\":\\\\\"Could not query the database for the schema cache. Retrying.\\\\\"}\"}\\n',",
          ");",
          "process.exit(1);",
          "",
        ].join("\n"),
      );

      const result = await runTypesFreshnessScriptIn(
        tempRoot,
        ["--strict", "--allow-transient-unavailable"],
        {
          CI: "true",
          SUPABASE_ACCESS_TOKEN: "token",
          SUPABASE_PROJECT_REF: "project-ref",
          STAGING_SUPABASE_PROJECT_ID: "",
          VITE_SUPABASE_PROJECT_ID: "",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("transiently unavailable");
      expect(result.stderr).toContain("PGRST002");
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});
