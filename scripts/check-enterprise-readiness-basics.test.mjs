import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEnterpriseReadinessBasics,
  checkPublicFunctionInventory,
  checkRuntimeAlignment,
} from "./check-enterprise-readiness-basics.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-readiness-"));
  mkdirSync(join(root, ".github"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "supabase"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      packageManager: "npm@10.8.2",
      volta: { node: "20.19.5", npm: "10.8.2" },
      engines: { node: ">=20.19.0 <21", npm: ">=10.8.0 <11" },
    }),
  );
  writeFileSync(join(root, ".node-version"), "20.19.5\n");
  writeFileSync(join(root, ".nvmrc"), "20.19.5\n");
  writeFileSync(join(root, ".npmrc"), "engine-strict=true\n");
  writeFileSync(
    join(root, "docs", "OBSERVABILITY.md"),
    [
      "VITE_SENTRY_DSN",
      "SENTRY_DSN",
      "SENTRY_AUTH_TOKEN",
      "unknown, not healthy",
      "Alerting",
    ].join("\n"),
  );
  writeFileSync(
    join(root, ".github", "PULL_REQUEST_TEMPLATE.md"),
    [
      "## Verification",
      "npm run check:runtime",
      "npm run check:public-functions",
      "## Security / RLS Impact",
      "## Deployment / Rollback",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "SECURITY.md"),
    [
      "# Security Policy",
      "## Supported Versions",
      "## Reporting a Vulnerability",
      "security@maiprop.co",
      "Do not publicly disclose",
      "response target",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "supabase", "config.toml"),
    [
      "[functions.ai-search]",
      "verify_jwt = false",
      "[functions.healthz]",
      "verify_jwt = false",
      "[functions.create-checkout]",
      "verify_jwt = true",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "public-edge-function-inventory.json"),
    JSON.stringify({ public_function_count: 2, entries: [{ name: "ai-search" }, { name: "healthz" }] }),
  );
  return root;
};

describe("enterprise readiness basics", () => {
  it("accepts a fixture with aligned runtime files and governance evidence", () => {
    const root = makeFixture();

    const result = checkEnterpriseReadinessBasics(root);

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("reports runtime drift with actionable file names", () => {
    const root = makeFixture();
    writeFileSync(join(root, ".nvmrc"), "24.0.0\n");

    const result = checkRuntimeAlignment(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(".nvmrc");
  });

  it("compares public function inventory against supabase config", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "public-edge-function-inventory.json"),
      JSON.stringify({ public_function_count: 1, entries: [{ name: "ai-search" }] }),
    );

    const result = checkPublicFunctionInventory(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("expected 2");
  });
});
