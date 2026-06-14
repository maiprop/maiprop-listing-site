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

  it("blocks future public-schema default grants to browser and service roles", async () => {
    const server = await createJsonServer(200, [{
      buckets: [
        { id: "message-attachments", public: false, file_size_limit: 10485760, allowed_mime_types: ["application/pdf"] },
        { id: "email-assets", public: true, file_size_limit: 1048576, allowed_mime_types: ["image/png"] },
        { id: "firesale-photos", public: true, file_size_limit: 1048576, allowed_mime_types: ["image/jpeg"] },
        { id: "property-images", public: true, file_size_limit: 1048576, allowed_mime_types: ["image/webp"] },
      ],
      rls_disabled_tables: [],
      grants: [
        { signature: "release_expired_firesale_reservations(uuid)", anon: false, authenticated: false, service_role: true },
        { signature: "authoritative_role()", anon: false, authenticated: false, service_role: true },
        { signature: "authoritative_role(uuid)", anon: false, authenticated: false, service_role: true },
        { signature: "check_listing_quota()", anon: false, authenticated: false, service_role: true },
        { signature: "has_platform_admin(uuid)", anon: false, authenticated: false, service_role: true },
        { signature: "has_role(uuid,app_role)", anon: false, authenticated: false, service_role: true },
        { signature: "has_role(uuid,user_role)", anon: false, authenticated: false, service_role: true },
      ],
      future_default_grants: [
        { grantor_role: "postgres", object_type: "TABLES", grantee: "anon", privileges: ["SELECT", "INSERT"] },
      ],
      project_authenticated_select_policies: ["Projects are publicly viewable", "Projects are viewable by owner or admin"],
    }]);

    try {
      const result = await runLiveSecurityScript(server.apiBase);

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("future public-schema default grants");
      expect(result.stderr).toContain("project SELECT policies overlap for authenticated");
    } finally {
      await server.close();
    }
  }, 15_000);
});
