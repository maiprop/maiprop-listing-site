import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const scriptPath = resolve(process.cwd(), "scripts/capture-supabase-index-stats.mjs");
const script = readFileSync(scriptPath, "utf8");

describe("capture Supabase index stats script", () => {
  it("supports direct DB URLs for staging and production workflows before linked fallback", () => {
    expect(script).toContain('readArg("--db-url")');
    expect(script).toContain("process.env.SUPABASE_STAGING_EFFECTIVE_DB_URL");
    expect(script).toContain("process.env.SUPABASE_PRODUCTION_DB_URL");
    expect(script).toContain("process.env.SUPABASE_DB_PASSWORD");
    expect(script).toContain('"supabase", "link"');
    expect(script).toContain("--allow-empty-when-unconfigured");
    expect(script).toContain('writeFileSync(outPath, "[]\\n")');
    expect(script).toContain('queryArgs.push("--db-url", dbUrl)');
    expect(script).toContain('queryArgs.push("--linked")');
  });

  it("only degrades transient Supabase query failures to an empty artifact", () => {
    expect(script).toContain("function isTransientQueryFailure(detail)");
    expect(script).toContain("status 544");
    expect(script).toContain("connection timeout");
    expect(script).toContain("Supabase index stats query was transiently unavailable");
    expect(script).toContain("fail(`supabase db query failed with exit ${result.status}");
  });

  it("writes an empty artifact for function-only staging prep when no DB credential is configured", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "maiprop-index-stats-test-"));
    const outPath = join(tempDir, "index-stats.json");
    try {
      const result = spawnSync(
        process.execPath,
        [scriptPath, "--out", outPath, "--allow-empty-when-unconfigured"],
        {
          cwd: process.cwd(),
          env: {
            ...process.env,
            SUPABASE_PROJECT_REF: "stagingprojectref12345",
            SUPABASE_DB_PASSWORD: "",
            SUPABASE_DB_URL: "",
            SUPABASE_STAGING_EFFECTIVE_DB_URL: "",
            SUPABASE_PRODUCTION_DB_URL: "",
          },
          encoding: "utf8",
        },
      );

      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
      expect(readFileSync(outPath, "utf8")).toBe("[]\n");
      expect(result.stderr).toContain("No DB URL/password configured");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("accepts both JSON array and object row payloads from Supabase CLI output", () => {
    expect(script).toContain("function firstJsonValue(text)");
    expect(script).toContain("Array.isArray(payload)");
    expect(script).toContain("Array.isArray(payload.rows)");
    expect(script).toContain("Array.isArray(payload.data)");
  });
});
