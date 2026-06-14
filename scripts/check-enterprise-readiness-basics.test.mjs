import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEnterpriseReadinessBasics,
  checkObservabilityWiring,
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
  mkdirSync(join(root, "scripts", "load-test"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  mkdirSync(join(root, "supabase"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "_shared"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "healthz"), { recursive: true });

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
  writeFileSync(
    join(root, "scripts", "load-test", "basic.js"),
    [
      "import http from \"k6/http\";",
      "export const errorRate = new Rate('errors');",
      "export const options = {",
      "  scenarios: { browse: { executor: \"ramping-vus\", stages: [{ target: 100 }] } },",
      "  thresholds: { http_req_duration: [\"p(95)<2500\"], errors: [\"rate<0.01\"], http_req_failed: [\"rate<0.01\"] },",
      "};",
      "export default function () {",
      "  http.get(`${BASE_URL}/listings`);",
      "  http.get(`${BASE_URL}/auctions`);",
      "  http.get(`${BASE_URL}/api/public/listings?limit=24`);",
      "  http.get(`${BASE_URL}/api/public/open-houses?limit=24`);",
      "  http.get(`${BASE_URL}/sitemap-dynamic.xml`);",
      "}",
      "export function handleSummary() { return { 'load-test-summary.json': '{}' }; }",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "main.tsx"),
    [
      "import * as Sentry from '@sentry/react';",
      "import { installWebVitalsMonitoring } from '@/lib/webVitals';",
      "const sentryDsn = import.meta.env.VITE_SENTRY_DSN;",
      "if (sentryDsn) {",
      "  Sentry.init({ dsn: sentryDsn, tracesSampleRate: 0.1 });",
      "  window.__sentryClient = Sentry;",
      "  installWebVitalsMonitoring();",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "lib", "webVitals.ts"),
    [
      "export function installWebVitalsMonitoring() {",
      "  const sampleRate = import.meta.env.VITE_WEB_VITALS_SAMPLE_RATE;",
      "  window.__maipropWebVitalsInstalled = true;",
      "  window.__sentryClient?.addBreadcrumb?.({ category: 'web-vitals', sampleRate });",
      "  window.__sentryClient?.captureMessage?.('web-vitals-route');",
      "}",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "supabase", "functions", "_shared", "logger.ts"),
    [
      "function parseSentryDsn() { return Deno.env.get('SENTRY_DSN'); }",
      "function forwardToSentry() { return fetch('https://sentry.example/api', { headers: { 'X-Sentry-Auth': 'Sentry sentry_version=7' } }); }",
      "export function createLogger() { return { error: forwardToSentry }; }",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "supabase", "functions", "healthz", "index.ts"),
    "const checks = {}; checks.sentry = Deno.env.get('SENTRY_DSN') ? 'ok' : 'fail';\n",
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

  it("requires source-level frontend and edge observability wiring", () => {
    const root = makeFixture();
    writeFileSync(join(root, "src", "main.tsx"), "console.log('no sentry');\n");

    const result = checkObservabilityWiring(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("src/main.tsx must mention Sentry.init");
    expect(result.failures.join("\n")).toContain("src/main.tsx must mention installWebVitalsMonitoring");
  });

  it("includes the load-test contract in enterprise readiness", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "scripts", "load-test", "basic.js"),
      "import http from \"k6/http\"; export default function () { http.get(`${BASE_URL}/`); }\n",
    );

    const result = checkEnterpriseReadinessBasics(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("scripts/load-test/basic.js");
  });
});
