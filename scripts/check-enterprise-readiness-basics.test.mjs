import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkEnterpriseReadinessBasics,
  checkEnterpriseTenantContract,
  checkObservabilityWiring,
  checkPublicFunctionInventory,
  checkRuntimeAlignment,
} from "./check-enterprise-readiness-basics.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-readiness-"));
  mkdirSync(join(root, ".github"), { recursive: true });
  mkdirSync(join(root, ".husky"), { recursive: true });
  mkdirSync(join(root, "apps"), { recursive: true });
  mkdirSync(join(root, "packages"), { recursive: true });
  mkdirSync(join(root, "infrastructure"), { recursive: true });
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "docs", "adr"), { recursive: true });
  mkdirSync(join(root, "docs", "api"), { recursive: true });
  mkdirSync(join(root, "docs", "backups"), { recursive: true });
  mkdirSync(join(root, "docs", "compliance", "dora"), { recursive: true });
  mkdirSync(join(root, "docs", "governance"), { recursive: true });
  mkdirSync(join(root, "docs", "performance"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "scripts", "load-test"), { recursive: true });
  mkdirSync(join(root, "src", "hooks"), { recursive: true });
  mkdirSync(join(root, "src", "lib"), { recursive: true });
  mkdirSync(join(root, "supabase"), { recursive: true });
  mkdirSync(join(root, "supabase", "migrations"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "_shared"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "healthz"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "open-house-registration"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "admin-pricing-config"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "create-stripe-price"), { recursive: true });
  mkdirSync(join(root, "supabase", "functions", "sync-stripe-pricing"), { recursive: true });
  mkdirSync(join(root, "src", "pages"), { recursive: true });

  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      packageManager: "npm@10.8.2",
      volta: { node: "20.19.5", npm: "10.8.2" },
      engines: { node: ">=20.19.0 <21", npm: ">=10.8.0 <11" },
      scripts: {
        "runtime:doctor": "node scripts/project-runtime.mjs --doctor",
        "check:runtime:local": "node scripts/project-runtime.mjs -- npm run check:runtime",
        "check:repo-architecture": "node scripts/check-repository-architecture.mjs",
      },
    }),
  );
  writeFileSync(join(root, ".node-version"), "20.19.5\n");
  writeFileSync(join(root, ".nvmrc"), "20.19.5\n");
  writeFileSync(join(root, ".npmrc"), "engine-strict=true\n");
  writeFileSync(
    join(root, ".husky", "pre-push"),
    [
      "node scripts/project-runtime.mjs -- npm run check:runtime",
      "node scripts/project-runtime.mjs -- npm run check:secrets",
      "node scripts/project-runtime.mjs -- npm run typecheck",
      "node scripts/project-runtime.mjs -- npm test",
    ].join("\n"),
  );
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
      "/apps/ @krenios",
      "/packages/ @krenios",
      "/infrastructure/ @krenios",
      "/supabase/ @krenios",
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
      "components:",
      "  schemas:",
      "    Error:",
      "      type: object",
      "      required: [error]",
      "      properties:",
      "        error:",
      "          type: string",
      "        code:",
      "          type: string",
      "        issues:",
      "          type: array",
      "          items:",
      "            type: object",
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
        "E2E Security (Live-safe)",
        "Lighthouse CI",
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
    join(root, "docs", "governance", "github-actions-policy.expected.json"),
    JSON.stringify({
      requirePinnedActions: true,
      allowedActionRepositories: ["actions/checkout"],
      recommendedLiveRepositoryPolicy: {
        allowed_actions: "selected",
        sha_pinning_required: true,
      },
    }),
  );
  writeFileSync(
    join(root, "docs", "governance", "ENTERPRISE_TENANCY_AND_SSO.md"),
    [
      "# Enterprise Tenancy and SSO",
      "organization_memberships",
      "organization_sso_providers",
      "Supabase SSO/SAML",
      "supabase sso",
      "signInWithSSO",
      "SAML metadata is not stored in application tables",
      "database membership remains the authorization source of truth",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "governance", "PROCUREMENT_EVIDENCE_MATRIX.md"),
    [
      "# Procurement Evidence Matrix",
      "procurement_evidence",
      "Security questionnaire",
      "Data Processing Agreement",
      "Subprocessor list",
      "Backup restore drill",
      "SAML/SSO configuration",
      "SOC 2 / ISO evidence is external and not claimed by this repository",
    ].join("\n"),
  );
  writeFileSync(join(root, "apps", "README.md"), "# Apps\n");
  writeFileSync(join(root, "packages", "README.md"), "# Packages\n");
  writeFileSync(join(root, "infrastructure", "README.md"), "# Infrastructure\n");
  writeFileSync(
    join(root, "docs", "REPOSITORY_ARCHITECTURE.md"),
    [
      "# Repository Architecture",
      "Current layout",
      "Target layout",
      "/apps/web",
      "/packages/domain",
      "/packages/ui",
      "/packages/data-access",
      "/infrastructure/cloudflare",
      "no physical move without dedicated migration PR",
      "Cloudflare Pages",
      "Supabase",
      "React Query",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "adr", "0005-repository-package-architecture.md"),
    [
      "# ADR-0005: Repository Package Architecture",
      "- **Status:** Accepted",
      "phased",
      "no npm workspaces until package extraction",
      "codemod/import migration",
      "/apps",
      "/packages",
      "/infrastructure",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "governance", "repository-boundaries.json"),
    JSON.stringify({
      version: 1,
      currentMode: "single-package",
      targetLayout: {
        apps: ["apps/web"],
        packages: ["packages/domain", "packages/ui", "packages/data-access"],
        infrastructure: ["infrastructure/cloudflare", "infrastructure/capacitor"],
      },
      boundaries: [
        { id: "app-web", current: ["src"], target: "apps/web", ownerPath: "/apps/" },
        { id: "shared-ui", current: ["src/components/ui"], target: "packages/ui", ownerPath: "/packages/" },
        { id: "domain", current: ["src/lib"], target: "packages/domain", ownerPath: "/packages/" },
        { id: "data-access", current: ["src/hooks", "src/integrations/supabase"], target: "packages/data-access", ownerPath: "/packages/" },
        { id: "cloudflare-pages", current: ["functions", "public/_headers", "public/_redirects"], target: "infrastructure/cloudflare", ownerPath: "/infrastructure/" },
        { id: "supabase-backend", current: ["supabase"], target: "supabase", ownerPath: "/supabase/" },
      ],
    }),
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20260614155000_enterprise_tenant_sso_procurement.sql"),
    [
      "CREATE TABLE IF NOT EXISTS public.organizations ();",
      "CREATE TABLE IF NOT EXISTS public.organization_memberships ();",
      "CREATE TABLE IF NOT EXISTS public.organization_domains ();",
      "CREATE TABLE IF NOT EXISTS public.organization_sso_providers (supabase_provider_id uuid);",
      "CREATE TABLE IF NOT EXISTS public.procurement_evidence ();",
      "ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.organization_domains ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.organization_sso_providers ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE public.procurement_evidence ENABLE ROW LEVEL SECURITY;",
      "REVOKE ALL ON TABLE public.organizations FROM anon;",
      "GRANT SELECT, INSERT, UPDATE ON TABLE public.organizations TO authenticated;",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organizations TO service_role;",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_memberships TO service_role;",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_domains TO service_role;",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.organization_sso_providers TO service_role;",
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.procurement_evidence TO service_role;",
      "CREATE OR REPLACE FUNCTION private.is_org_member() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;",
      "CREATE OR REPLACE FUNCTION private.has_org_role() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;",
      "CREATE POLICY organizations_select_members ON public.organizations USING (private.is_org_member());",
      "CREATE POLICY organization_memberships_manage ON public.organization_memberships WITH CHECK (private.has_org_role());",
      "CREATE POLICY organization_sso_providers_manage ON public.organization_sso_providers WITH CHECK (private.has_org_role());",
      "CREATE POLICY procurement_evidence_manage ON public.procurement_evidence WITH CHECK (private.has_org_role());",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "supabase", "migrations", "20260620084356_org_permission_audit_foundation.sql"),
    [
      "CREATE TABLE IF NOT EXISTS public.organization_audit_ledger ();",
      "ALTER TABLE public.organization_audit_ledger ENABLE ROW LEVEL SECURITY;",
      "CREATE OR REPLACE FUNCTION private.has_org_permission() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;",
      "CREATE OR REPLACE FUNCTION private.assert_org_permission() RETURNS void LANGUAGE plpgsql AS $$ BEGIN END $$;",
      "CREATE OR REPLACE FUNCTION private.append_org_audit_event() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;",
      "CREATE TRIGGER trg_prevent_organization_audit_ledger_mutation BEFORE UPDATE OR DELETE ON public.organization_audit_ledger FOR EACH ROW EXECUTE FUNCTION private.prevent_organization_audit_ledger_mutation();",
      "CREATE POLICY organization_audit_ledger_select ON public.organization_audit_ledger USING (private.has_org_permission());",
    ].join("\n"),
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
      "E2E Security (Live-safe)",
      "Lighthouse CI",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "governance", "module-size-budget.json"),
    JSON.stringify({
      version: 1,
      defaultMaxBytes: 35000,
      generatedExemptions: [],
      legacyExceptions: [],
    }),
  );
  writeFileSync(
    join(root, "docs", "governance", "sensitive-mutation-boundaries.json"),
    JSON.stringify({
      version: 1,
      blockedDirectTables: ["pricing_configs", "organization_memberships"],
      allowedBrowserMutations: [],
    }),
  );
  writeFileSync(
    join(root, "docs", "governance", "function-invocation-boundaries.json"),
    JSON.stringify({
      version: 1,
      reviewedFunctionBodies: [],
      reviewedDynamicInvocations: [],
    }),
  );
  writeFileSync(
    join(root, "docs", "governance", "edge-function-request-boundaries.json"),
    JSON.stringify({
      version: 1,
      reviewedRawJsonBodies: [],
    }),
  );
  writeFileSync(
    join(root, "docs", "governance", "LIVE_GITHUB_ADMIN_SETTINGS.md"),
    [
      "allowed_actions: selected",
      "sha_pinning_required: true",
      "patterns_allowed",
      "Branch protection API result: blocked",
      "Upgrade to GitHub Pro or make this repository public",
      "Environment approvals: pending repository admin",
      "Push protection: pending repository admin",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "performance", "LOAD_TEST_PROOF.md"),
    [
      "ECAS_LOAD_PROFILE=baseline_100",
      "ECAS_LOAD_PROFILE=growth_10x",
      "ECAS_LOAD_PROFILE=enterprise_soak",
      "LOAD_TEST_APPROVED_PRODUCTION=true",
      "load-test-summary.json",
      "approved time window",
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
  writeFileSync(
    join(root, "docs", "compliance", "dora", "RESTORE_DRILL_LOG.md"),
    [
      "# DORA Restore Drill Log",
      "| Date | Environment | Restore drill | RPO | RTO | Evidence status | Operator |",
      "|---|---|---|---|---|---|---|",
      "| 2026-06-18 | Documentation baseline | Restore drill pending; source backup timestamp, restore target, verified row counts, release SHA, and cleanup confirmation are required. | Target: <= 24h | Target: <= 4h | Pending operator execution | Platform |",
    ].join("\n"),
  );
  writeFileSync(join(root, "scripts", "supabase-logical-backup.mjs"), "process.exit(0);\n");
  writeFileSync(
    join(root, "scripts", "project-runtime.mjs"),
    [
      "const home = process.env.MAIPROP_NODE20_HOME;",
      "const cli = 'npm-cli.js';",
      "console.log('Project runtime launcher OK', home, cli);",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "scripts", "load-test", "basic.js"),
    [
      "import http from \"k6/http\";",
      "import { check } from \"k6\";",
      "import { Counter, Rate, Trend } from \"k6/metrics\";",
      "const requireEnv = (name) => { const value = __ENV[name]; if (!value) throw new Error(name); return value; };",
      "const requireLoadProfile = (profile) => { const profiles = ['smoke', 'baseline_100', 'growth_10x', 'enterprise_soak']; if (!profiles.includes(profile)) throw new Error('invalid ECAS_LOAD_PROFILE'); return profile; };",
      "const BASE_URL = requireEnv(\"BASE_URL\");",
      "const ECAS_LOAD_PROFILE = requireLoadProfile(requireEnv(\"ECAS_LOAD_PROFILE\"));",
      "const LOAD_TEST_APPROVED_PRODUCTION = __ENV.LOAD_TEST_APPROVED_PRODUCTION === 'true';",
      "const LOAD_TEST_SUMMARY_DIR = __ENV.LOAD_TEST_SUMMARY_DIR;",
      "export const errorRate = new Rate('errors');",
      "export const routeDuration = new Trend('route_http_req_duration', true);",
      "export const routeFailedRate = new Rate('route_http_req_failed');",
      "export const routeErrorRate = new Rate('route_errors');",
      "export const routeRequests = new Counter('route_http_reqs');",
      "function routeThresholds(metricName, expression) { return { [`${metricName}{route:listings}`]: [expression] }; }",
      "export const options = {",
      "  scenarios: { browse: { executor: \"ramping-vus\", stages: [{ target: 1000 }] } },",
      "  thresholds: { http_req_duration: [\"p(95)<2500\"], errors: [\"rate<0.01\"], http_req_failed: [\"rate<0.01\"], ...routeThresholds(\"route_http_req_duration\", \"p(95)<2500\"), ...routeThresholds(\"route_http_req_failed\", \"rate<0.01\"), ...routeThresholds(\"route_errors\", \"rate<0.01\"), ...routeThresholds(\"route_http_reqs\", \"count>0\") },",
      "};",
      "export default function () {",
      "  const route = { name: 'listings' };",
      "  const routeTags = { route: route.name };",
      "  const res = http.get(`${BASE_URL}/listings`, { tags: routeTags });",
      "  const statusOk = check(res, { 'status 2xx': (response) => response.status >= 200 && response.status < 300 });",
      "  routeDuration.add(res.timings.duration, routeTags);",
      "  routeFailedRate.add(statusOk ? 0 : 1, routeTags);",
      "  routeErrorRate.add(statusOk ? 0 : 1, routeTags);",
      "  routeRequests.add(1, routeTags);",
      "  errorRate.add(statusOk ? 0 : 1, routeTags);",
      "  http.get(`${BASE_URL}/auctions`);",
      "  http.get(`${BASE_URL}/api/public/listings?limit=24`);",
      "  http.get(`${BASE_URL}/api/public/open-houses?limit=24`);",
      "  http.get(`${BASE_URL}/sitemap-dynamic.xml`);",
      "}",
      "function artifactPath(name) { return LOAD_TEST_SUMMARY_DIR ? `${LOAD_TEST_SUMMARY_DIR}/${name}` : name; }",
      "function normalizeSummary(data) { return { profile: ECAS_LOAD_PROFILE, approved: LOAD_TEST_APPROVED_PRODUCTION, metrics: data.metrics }; }",
      "export function handleSummary(data) { return { [artifactPath(\"load-test-summary.json\")]: JSON.stringify(normalizeSummary(data), null, 2) }; }",
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
    join(root, "src", "lib", "mutationSchemas.ts"),
    [
      "import { z } from \"zod\";",
      "export function parseMutationInput() {}",
      "export const savedSearchCreateSchema = {};",
      "export const contactSubmissionInputSchema = {};",
      "export const favoriteToggleSchema = {};",
      "export const leadCreateSchema = {};",
      "export const contactCreateSchema = {};",
      "export const listingWriteSchema = {};",
      "export const pricingConfigRowsSchema = {};",
      "export const aiSearchBodySchema = {};",
      "export const adminFiresaleActionBodySchema = {};",
      "export const agentDataInputActionBodySchema = {};",
      "export const submitFiresaleInterestBodySchema = {};",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "hooks", "useSavedSearches.ts"),
    [
      "parseMutationInput(savedSearchCreateSchema, input, 'saved search');",
      "parseMutationInput(savedSearchIdSchema, id, 'saved search id');",
      "parseMutationInput(savedSearchAlertToggleSchema, input, 'saved search alert');",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "src", "hooks", "useContactSubmissions.ts"),
    "parseMutationInput(contactSubmissionInputSchema, input, 'contact submission');\n",
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
    join(root, "supabase", "functions", "_shared", "schema.ts"),
    "import { z } from 'npm:zod'; export class SchemaValidationError extends Error {} export async function parseJsonBody() {}\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "healthz", "index.ts"),
    "const checks = {}; checks.sentry = Deno.env.get('SENTRY_DSN') ? 'ok' : 'fail';\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "open-house-registration", "index.ts"),
    "const registrationRequestSchema = z.object({}); await parseJsonBody(req, registrationRequestSchema);\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "admin-pricing-config", "index.ts"),
    "const adminPricingActionSchema = z.object({}); await parseJsonBody(req, adminPricingActionSchema); await supabase.from('pricing_configs').upsert(rows); throw new Error('Platform admin only');\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "create-stripe-price", "index.ts"),
    "const createStripePriceBodySchema = z.object({}); try { await parseJsonBody(req, createStripePriceBodySchema); await supabase.from('pricing_configs').update({}); } catch (error) { if (error instanceof SchemaValidationError) throw error; }\n",
  );
  writeFileSync(
    join(root, "supabase", "functions", "sync-stripe-pricing", "index.ts"),
    "const syncStripePricingBodySchema = z.object({}); try { await parseJsonBody(req, syncStripePricingBodySchema); await supabase.from('pricing_configs').update({}); } catch (error) { if (error instanceof SchemaValidationError) throw error; }\n",
  );
  writeFileSync(
    join(root, "src", "pages", "AdminPricing.tsx"),
    "parseMutationInput(pricingConfigRowsSchema, rows, 'pricing'); await invokeAdminPricingConfig('admin-pricing-config');\n",
  );
  return root;
};

describe("enterprise readiness basics", () => {
  it("accepts a fixture with aligned runtime files and governance evidence", () => {
    const root = makeFixture();

    const result = checkEnterpriseReadinessBasics(root);

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
  }, 10_000);

  it("reports runtime drift with actionable file names", () => {
    const root = makeFixture();
    writeFileSync(join(root, ".nvmrc"), "24.0.0\n");

    const result = checkRuntimeAlignment(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(".nvmrc");
  });

  it("requires local hooks to run through the project runtime launcher", () => {
    const root = makeFixture();
    writeFileSync(join(root, ".husky", "pre-push"), "npm test\n");

    const result = checkRuntimeAlignment(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain(".husky/pre-push");
    expect(result.failures.join("\n")).toContain("project-runtime.mjs -- npm run check:runtime");
  }, 10_000);

  it("compares public function inventory against supabase config", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "public-edge-function-inventory.json"),
      JSON.stringify({ public_function_count: 1, entries: [{ name: "ai-search" }] }),
    );

    const result = checkPublicFunctionInventory(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("expected 2");
  }, 10_000);

  it("requires source-level frontend and edge observability wiring", () => {
    const root = makeFixture();
    writeFileSync(join(root, "src", "main.tsx"), "console.log('no sentry');\n");

    const result = checkObservabilityWiring(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("src/main.tsx must mention Sentry.init");
    expect(result.failures.join("\n")).toContain("src/main.tsx must mention installWebVitalsMonitoring");
  });

  it("requires enterprise tenancy, SSO/SAML, and procurement evidence contracts", () => {
    const root = makeFixture();
    writeFileSync(join(root, "docs", "governance", "PROCUREMENT_EVIDENCE_MATRIX.md"), "# Missing\n");

    const result = checkEnterpriseTenantContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("PROCUREMENT_EVIDENCE_MATRIX.md");
  });

  it("requires org permission helpers and an append-only org audit ledger contract", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "supabase", "migrations", "20260620084356_org_permission_audit_foundation.sql"),
      "-- missing org permission and audit ledger markers\n",
    );

    const result = checkEnterpriseTenantContract(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("private.has_org_permission");
    expect(result.failures.join("\n")).toContain("private.assert_org_permission");
    expect(result.failures.join("\n")).toContain("public.organization_audit_ledger");
    expect(result.failures.join("\n")).toContain("private.append_org_audit_event");
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
  }, 10_000);
});
