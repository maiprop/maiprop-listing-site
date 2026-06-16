import { spawn } from "node:child_process";
import { describe, expect, it } from "vitest";

function runTypesFreshnessScript(env: NodeJS.ProcessEnv) {
  return new Promise<{ status: number | null; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/check-supabase-types-freshness.cjs"], {
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
});
