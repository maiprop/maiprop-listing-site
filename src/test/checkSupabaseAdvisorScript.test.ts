import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runAdvisorScript(
  apiBase: string,
  extraArgs: string[] = [],
  extraEnv: Record<string, string> = {},
) {
  const tempDir = mkdtempSync(join(tmpdir(), "maiprop-advisor-"));
  tempDirs.push(tempDir);
  const outPath = join(tempDir, "advisor.json");

  return new Promise<{
    result: { status: number | null; stdout: string; stderr: string };
    outPath: string;
  }>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/check-supabase-advisor.mjs",
      "--out",
      outPath,
      ...extraArgs,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: "test-access-token",
        SUPABASE_PROJECT_REF: "test-project-ref",
        SUPABASE_MANAGEMENT_API_BASE: apiBase,
        ...extraEnv,
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status) => {
      resolve({ result: { status, stdout, stderr }, outPath });
    });
  });
}

function createTransientAdvisorServer() {
  const server = createServer((_req, res) => {
    res.writeHead(544, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Connection terminated due to connection timeout" }));
  });

  return new Promise<{ apiBase: string; close: () => Promise<void> }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        apiBase: `http://127.0.0.1:${address.port}/v1`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

describe("check-supabase-advisor script", () => {
  it("records transient advisor unavailability when explicitly allowed", async () => {
    const server = await createTransientAdvisorServer();

    try {
      const { result, outPath } = await runAdvisorScript(server.apiBase, [
        "--allow-transient-unavailable",
        "--fail-on-error",
        "--fail-on-unknown",
      ]);

      expect(result.status).toBe(0);
      const summary = JSON.parse(readFileSync(outPath, "utf8"));
      expect(summary.allow_transient_unavailable).toBe(true);
      expect(summary.failing_lint_count).toBe(0);
      expect(summary.transient_advisor_unavailable).toHaveLength(2);
      expect([0, 544]).toContain(summary.transient_advisor_unavailable[0].http_status);
      expect(summary.transient_advisor_unavailable[0].reason).toMatch(/timeout/i);
    } finally {
      await server.close();
    }
  });

  it("keeps transient advisor failures blocking by default", async () => {
    const server = await createTransientAdvisorServer();

    try {
      const { result } = await runAdvisorScript(server.apiBase);

      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/advisor request failed with HTTP 544|fetch failed|ETIMEDOUT|ECONNRESET/i);
    } finally {
      await server.close();
    }
  });
});
