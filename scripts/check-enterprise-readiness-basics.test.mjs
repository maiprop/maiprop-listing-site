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
  mkdirSync(join(root, "docs", "api"), { recursive: true });
  mkdirSync(join(root, "docs", "backups"), { recursive: true });
  mkdirSync(join(root, "docs", "governance"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
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
    join(root, ".github", "CODEOWNERS"),
    [
      "* @krenios",
      "/.github/workflows/ @krenios",
      "/.github/CODEOWNERS @krenios",
      "/supabase/migrations/ @krenios",
      "/supabase/functions/_shared/ @krenios",
      "/src/integrations/supabase/ @krenios",
      "/src/contexts/AuthContext.tsx @krenios",
      "/functions/_middleware.ts @krenios",
      "/public/_headers @krenios",
      "/scripts/ @krenios",
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
  writeFileSync(
    join(root, "docs", "api", "edge-functions.openapi.yaml"),
    [
      "openapi: 3.0.3",
      "paths:",
      "  /ai-search:",
      "    post:",
      "      operationId: aiSearch",
      "  /healthz:",
      "    get:",
      "      operationId: healthz",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "api", "README.md"),
    [
      "# API Documentation",
      "npm run check:openapi-coverage",
      "Update docs/api/edge-functions.openapi.yaml",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "governance", "main-branch-protection.expected.json"),
    JSON.stringify({
      branch: "main",
      requiredStatusChecks: [
        "Build / Lint / Test",
        "Release Safety Inventory",
        "Validate Supabase migrations",
        "E2E Tests",
      ],
      requiredApprovingReviewCount: 1,
      requireCodeOwnerReviews: true,
      dismissStaleReviews: true,
      requireConversationResolution: true,
      allowForcePushes: false,
      allowDeletions: false,
      doNotAllowBypass: true,
    }),
  );
  writeFileSync(
    join(root, "docs", "BRANCH_PROTECTION.md"),
    [
      "# Branch Protection",
      "Require pull request reviews",
      "Require review from Code Owners",
      "Dismiss stale pull request approvals",
      "Require conversation resolution",
      "Do not allow bypassing the above settings",
      "Allow force pushes | disabled",
      "Allow deletions | disabled",
      "Build / Lint / Test",
      "Validate Supabase migrations",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "DR_RUNBOOK.md"),
    [
      "# Disaster Recovery Runbook",
      "## Free-tier logical backup fallback",
      "supabase db dump",
      "MAIPROP_BACKUP_PASSPHRASE",
      "encrypted off-site backup",
      "restore drill",
      "RPO",
      "RTO",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "PRODUCTION_CHECKLIST.md"),
    [
      "# Production Deployment Checklist",
      "Supabase Free",
      "logical backup",
      "encrypted off-site backup",
      "restore drill",
      "Last restore test",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "backups", "FREE_TIER_LOGICAL_BACKUPS.md"),
    [
      "# Free Tier Logical Backups",
      "supabase db dump",
      "MAIPROP_BACKUP_PASSPHRASE",
      "encrypted off-site backup",
      "restore drill",
      "RPO",
      "RTO",
    ].join("\n"),
  );
  writeFileSync(join(root, "scripts", "supabase-logical-backup.mjs"), "process.exit(0);\n");
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
