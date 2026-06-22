import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const functionSource = readFileSync(
  resolve(root, "supabase/functions/submit-firesale-request/index.ts"),
  "utf8",
);
const configToml = readFileSync(resolve(root, "supabase/config.toml"), "utf8");
const sensitiveBoundaries = JSON.parse(
  readFileSync(resolve(root, "docs/governance/sensitive-mutation-boundaries.json"), "utf8"),
) as {
  blockedDirectTables: string[];
  allowedBrowserMutations: Array<{ file: string; table: string; operations: string[] }>;
};
const functionBoundaries = JSON.parse(
  readFileSync(resolve(root, "docs/governance/function-invocation-boundaries.json"), "utf8"),
) as {
  reviewedFunctionBodies: Array<{ function: string; boundary: string }>;
};

const allMigrations = readdirSync(resolve(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(join(root, "supabase/migrations", name), "utf8"))
  .join("\n");

describe("firesale request Edge boundary", () => {
  it("uses an authenticated Edge Function that forces caller ownership server-side", () => {
    expect(configToml).toContain("[functions.submit-firesale-request]");
    expect(configToml).toContain("verify_jwt = true");
    expect(functionSource).toContain("verifyBearerToken(req, supabase)");
    expect(functionSource).toContain("user_id: user.id");
    expect(functionSource).not.toContain("userId:");
  });

  it("removes direct browser writes to firesale_requests after the Edge boundary exists", () => {
    expect(sensitiveBoundaries.blockedDirectTables).toContain("firesale_requests");
    expect(
      sensitiveBoundaries.allowedBrowserMutations.some(
        (entry) => entry.table === "firesale_requests" && entry.file.includes("quickSaleSubmission"),
      ),
    ).toBe(false);
    expect(allMigrations).toContain("REVOKE INSERT, DELETE ON TABLE public.firesale_requests FROM anon, authenticated");
    expect(allMigrations).toContain("authenticated must submit Quick Sale requests through submit-firesale-request");
  });

  it("documents the new function as a schema-validated mutation boundary", () => {
    expect(functionBoundaries.reviewedFunctionBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          function: "submit-firesale-request",
          boundary: "edge-schema-validated",
        }),
      ]),
    );
  });
});
