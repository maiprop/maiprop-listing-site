import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/live-operational-smoke.yml", "utf8");
const liveAiQuotaSpec = readFileSync("e2e/live-ai-quota.spec.ts", "utf8");
const liveRoleTierMatrixSpec = readFileSync("e2e/live-role-tier-matrix.spec.ts", "utf8");
const liveSupervisorSpec = readFileSync("e2e/live-supervisor-agent-network.spec.ts", "utf8");

describe("live operational smoke workflow", () => {
  it("warms the public listings API before Playwright live smoke tests", () => {
    const warmupIndex = workflow.indexOf("Warm live public listings API");
    const aiSmokeIndex = workflow.indexOf("Run non-consuming AI quota smoke");

    expect(warmupIndex).toBeGreaterThan(-1);
    expect(aiSmokeIndex).toBeGreaterThan(-1);
    expect(warmupIndex).toBeLessThan(aiSmokeIndex);
    expect(workflow).toContain("/api/public/listings?limit=1");
    expect(workflow).toContain("Public listings API is ready");
    expect(workflow).toContain("Public listings API not ready after");
    expect(workflow).not.toContain("process.exit(0)");
  });

  it("keeps the AI quota smoke resilient to one cold public API miss", () => {
    expect(liveAiQuotaSpec).toContain("const LISTING_LOOKUP_ATTEMPTS = 6");
    expect(liveAiQuotaSpec).toContain('page.request.get("/api/public/listings?limit=1", { timeout: 10_000 })');
    expect(liveAiQuotaSpec).toContain("page.waitForTimeout(LISTING_LOOKUP_DELAY_MS * attempt)");
    expect(liveAiQuotaSpec).toContain("public listings API did not return a listing after");
  });

  it("asserts the current non-consuming live quota UI contract", () => {
    expect(liveAiQuotaSpec).toContain("expectedTierStatus");
    expect(liveAiQuotaSpec).toContain("AI Nearby Places requests");
    expect(liveAiQuotaSpec).toContain("Neighbourhood Report requests");
    expect(liveAiQuotaSpec).toContain("Free:\\s*5\\/month\\.\\s*Pro:\\s*50\\/month\\.");
    expect(liveAiQuotaSpec).not.toContain("AI insight requests remaining this month");
  });

  it("repairs seeded live role data before running the role matrix", () => {
    const repairIndex = workflow.indexOf("Repair live demo role matrix");
    const matrixIndex = workflow.indexOf("Run role and tier matrix smoke");

    expect(repairIndex).toBeGreaterThan(-1);
    expect(matrixIndex).toBeGreaterThan(-1);
    expect(repairIndex).toBeLessThan(matrixIndex);
    expect(workflow).toContain("Validate Supabase service role key");
    expect(workflow).toContain('/auth/v1/admin/users');
    expect(workflow).toContain("fetch(authAdminUrl");
    expect(workflow).toContain("Supabase service role key accepted by Auth Admin API.");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY is not accepted by");
    expect(workflow).toContain("E2E_RUN_SUPERVISOR_NETWORK: true");
    expect(workflow).toContain("I_KNOW_THIS_IS_PROD: yes");
    expect(workflow).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(workflow).toContain('e2e/live-supervisor-agent-network.spec.ts --project=chromium -g "supervisor repairs the full mock matrix"');
    expect(liveSupervisorSpec).toContain('const PASSWORD = env("E2E_DEMO_PASSWORD", "E2E_TEST_PASSWORD") || "Demo2025!";');
    expect(liveRoleTierMatrixSpec).toContain('process.env.E2E_ADMIN_SMOKE_ENABLED === "true"');
  });
});
