import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/live-operational-smoke.yml", "utf8");
const liveAiQuotaSpec = readFileSync("e2e/live-ai-quota.spec.ts", "utf8");

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
});
