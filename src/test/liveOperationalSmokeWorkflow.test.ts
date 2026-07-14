import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/live-operational-smoke.yml", "utf8");
const liveAiQuotaSpec = readFileSync("e2e/live-ai-quota.spec.ts", "utf8");
const liveRoleTierMatrixSpec = readFileSync("e2e/live-role-tier-matrix.spec.ts", "utf8");
const liveSupervisorSpec = readFileSync("e2e/live-supervisor-agent-network.spec.ts", "utf8");
const demoAccountsHelper = readFileSync("e2e/helpers/demoAccounts.ts", "utf8");
const packageJson = readFileSync("package.json", "utf8");

describe("live operational smoke workflow", () => {
  it("warms the public listings API before Playwright live smoke tests", () => {
    const warmupIndex = workflow.indexOf("Warm live public listings API");
    const aiSmokeIndex = workflow.indexOf("Run non-consuming AI quota smoke");

    expect(warmupIndex).toBeGreaterThan(-1);
    expect(aiSmokeIndex).toBeGreaterThan(-1);
    expect(warmupIndex).toBeLessThan(aiSmokeIndex);
    expect(workflow).toContain("id: public_api");
    expect(workflow).toContain("/api/public/listings?limit=1");
    expect(workflow).toContain("Public listings API is ready");
    expect(workflow).toContain("Public listings API not ready after");
    expect(workflow).toContain("public_api_ready=true");
    expect(workflow).toContain("public_api_ready=false");
    expect(workflow).toContain("steps.public_api.outputs.public_api_ready == 'true'");
    expect(workflow).not.toContain("process.exit(0)");
  });

  it("keeps the AI quota smoke resilient to one cold public API miss", () => {
    expect(liveAiQuotaSpec).toContain("const LISTING_LOOKUP_ATTEMPTS = 6");
    expect(liveAiQuotaSpec).toContain('page.request.get("/api/public/listings?limit=1", { timeout: 10_000 })');
    expect(liveAiQuotaSpec).toContain("page.waitForTimeout(LISTING_LOOKUP_DELAY_MS * attempt)");
    expect(liveAiQuotaSpec).toContain("public listings API did not return a listing after");
  });

  it("asserts the current non-consuming live quota UI contract", () => {
    expect(liveAiQuotaSpec).toContain("minimumLimit");
    expect(liveAiQuotaSpec).toContain("quotaSnapshot");
    expect(liveAiQuotaSpec).toContain('"property-valuation"');
    expect(liveAiQuotaSpec).toContain('"neighbourhood-report"');
    expect(liveAiQuotaSpec).toContain('"property-pois"');
    expect(liveAiQuotaSpec).toContain("ai-quota-status");
    expect(liveAiQuotaSpec).toContain("AI request allowance will be checked before loading");
    expect(liveAiQuotaSpec).toContain("expect(after).toEqual(before)");
    expect(liveAiQuotaSpec).not.toContain("AI Nearby Places requests");
    expect(liveAiQuotaSpec).not.toContain("Neighbourhood Report requests");
    expect(liveAiQuotaSpec).not.toContain("AI insight requests remaining this month");
  });

  it("repairs seeded live accounts before login-dependent smoke tests", () => {
    const serviceRoleIndex = workflow.indexOf("Validate Supabase service role key");
    const repairIndex = workflow.indexOf("Repair live demo role matrix");
    const aiSmokeIndex = workflow.indexOf("Run non-consuming AI quota smoke");
    const authPreflightIndex = workflow.indexOf("Validate live demo account sign-in");
    const matrixIndex = workflow.indexOf("Run role and tier matrix smoke");

    expect(serviceRoleIndex).toBeGreaterThan(-1);
    expect(repairIndex).toBeGreaterThan(-1);
    expect(aiSmokeIndex).toBeGreaterThan(-1);
    expect(authPreflightIndex).toBeGreaterThan(-1);
    expect(matrixIndex).toBeGreaterThan(-1);
    expect(serviceRoleIndex).toBeLessThan(repairIndex);
    expect(repairIndex).toBeLessThan(aiSmokeIndex);
    expect(repairIndex).toBeLessThan(authPreflightIndex);
    expect(authPreflightIndex).toBeLessThan(matrixIndex);
    expect(repairIndex).toBeLessThan(matrixIndex);
    expect(workflow).toContain("Validate Supabase service role key");
    expect(workflow).toContain("id: service_role");
    expect(workflow).toContain('/auth/v1/admin/users');
    expect(workflow).toContain("fetch(authAdminUrl");
    expect(workflow).toContain("Supabase service role key accepted by Auth Admin API.");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY is not accepted by");
    expect(workflow).toContain("const transientStatuses = new Set([408, 429, 500, 502, 503, 504, 520, 522, 524]);");
    expect(workflow).toContain("const attempts = 3;");
    expect(workflow).toContain("AbortSignal.timeout(15_000)");
    expect(workflow).toContain("Supabase Auth Admin API transiently unavailable after");
    expect(workflow).toContain("repair_enabled=true");
    expect(workflow).toContain("repair_enabled=false");
    expect(workflow).toContain("steps.service_role.outputs.repair_enabled == 'true'");
    expect(workflow).toContain("E2E_RUN_SUPERVISOR_NETWORK: true");
    expect(workflow).toContain("I_KNOW_THIS_IS_PROD: yes");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain('e2e/live-supervisor-agent-network.spec.ts --project=chromium -g "supervisor repairs the full mock matrix"');
    expect(workflow).toContain("/auth/v1/token?grant_type=password");
    expect(workflow).toContain("Live demo auth preflight failed");
    expect(workflow).toContain("steps.service_role.outputs.repair_enabled != 'true'");
    expect(workflow).toContain("E2E_FORCE_CANONICAL_DEMO_ACCOUNTS: true");
    expect(workflow).toContain("buyer.free@maiprop.demo");
    expect(workflow).toContain("professional valuer pro");
    expect(liveSupervisorSpec).toContain('const PASSWORD = env("E2E_DEMO_PASSWORD", "E2E_TEST_PASSWORD") || "Demo2025!";');
    expect(demoAccountsHelper).toContain("E2E_FORCE_CANONICAL_DEMO_ACCOUNTS");
    expect(demoAccountsHelper).toContain("forceCanonicalDemoAccounts");
    expect(demoAccountsHelper).toContain("? defaultEmail");
    expect(demoAccountsHelper).toContain('readEnv("E2E_DEMO_PASSWORD", "E2E_TEST_PASSWORD")');
    expect(liveRoleTierMatrixSpec).toContain('process.env.E2E_ADMIN_SMOKE_ENABLED === "true"');
    expect(liveRoleTierMatrixSpec).toContain("requestSupabaseSession");
    expect(liveRoleTierMatrixSpec).toContain("const SUPABASE_AUTH_TIMEOUT_MS = 30_000");
    expect(liveRoleTierMatrixSpec).toContain("const PROFILE_NAV_ATTEMPTS = 4");
    expect(liveRoleTierMatrixSpec).toContain("/auth/v1/token?grant_type=password");
    expect(liveRoleTierMatrixSpec).toContain("localStorage.setItem(key, JSON.stringify(value))");
    expect(liveRoleTierMatrixSpec).toContain('await page.goto("/dashboard")');
    expect(liveRoleTierMatrixSpec).toContain("expectExpectedNavigation");
    expect(liveRoleTierMatrixSpec).toContain("Dashboard rendered fallback buyer navigation");
    expect(liveRoleTierMatrixSpec).toContain('await page.reload({ waitUntil: "load" })');
    expect(packageJson).toContain('"test:e2e:live-role-tier-matrix": "playwright test e2e/live-role-tier-matrix.spec.ts --project=chromium --workers=2"');
  });
});
