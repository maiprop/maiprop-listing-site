import { spawn } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";

function runLiveSecurityScript(apiBase: string, extraArgs: string[] = []) {
  return new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/check-live-security-posture.mjs",
      ...extraArgs,
    ], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPABASE_ACCESS_TOKEN: "test-access-token",
        SUPABASE_PROJECT_REF: "test-project-ref",
        SUPABASE_MANAGEMENT_API_BASE: apiBase,
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
      resolve({ status, stdout, stderr });
    });
  });
}

function createJsonServer(status: number, payload: unknown) {
  const server = createServer((_req, res) => {
    res.writeHead(status, {
      "connection": "close",
      "content-type": "application/json",
    });
    res.end(JSON.stringify(payload));
  });

  return new Promise<{ apiBase: string; close: () => Promise<void> }>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        apiBase: `http://127.0.0.1:${address.port}/v1`,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}

describe("check-live-security-posture script", () => {
  it("records transient Management API timeouts only when explicitly allowed", async () => {
    const server = await createJsonServer(544, {
      message: "Failed to run sql query: Connection terminated due to connection timeout",
    });

    try {
      const result = await runLiveSecurityScript(server.apiBase, ["--allow-transient-unavailable"]);

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("posture check was transiently unavailable");
      expect(result.stderr).toContain("Supabase Management API returned 544");
    } finally {
      await server.close();
    }
  }, 15_000);

  it("keeps real posture failures blocking", async () => {
    const server = await createJsonServer(200, [{
      buckets: [],
      rls_disabled_tables: ["public.accounts"],
      grants: [],
    }]);

    try {
      const result = await runLiveSecurityScript(server.apiBase, ["--allow-transient-unavailable"]);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("posture check failed");
      expect(result.stderr).toContain("public tables with RLS disabled");
      expect(result.stderr).toContain("role helper must be service-role only");
    } finally {
      await server.close();
    }
  }, 15_000);
});
