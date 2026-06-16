import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGETS_KB } from "./check-bundle-size.mjs";

const lighthouseConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), ".lighthouserc.json"), "utf8"),
);
const performanceGateSpec = readFileSync(
  resolve(process.cwd(), "e2e/performance-gates.spec.ts"),
  "utf8",
);

const lighthouseAssertion = (key) =>
  lighthouseConfig.ci.assert.assertions[key]?.[1] ?? {};

describe("performance budget configuration", () => {
  it("keeps Lighthouse budgets closer to Core Web Vitals good thresholds", () => {
    expect(lighthouseAssertion("categories:performance").minScore).toBeGreaterThanOrEqual(0.75);
    expect(lighthouseAssertion("first-contentful-paint").maxNumericValue).toBeLessThanOrEqual(2200);
    expect(lighthouseAssertion("largest-contentful-paint").maxNumericValue).toBeLessThanOrEqual(3500);
    expect(lighthouseAssertion("cumulative-layout-shift").maxNumericValue).toBeLessThanOrEqual(0.1);
  });

  it("keeps Playwright web-vitals route budgets stricter than the old 4s LCP gate", () => {
    expect(performanceGateSpec).toContain("lcp: 3000");
    expect(performanceGateSpec).toContain("cls: 0.1");
  });

  it("gates high-impact initial chunks explicitly instead of hiding behind catch-all budgets", () => {
    expect(BUDGETS_KB.index).toBeLessThanOrEqual(500);
    expect(BUDGETS_KB["vendor-supabase"]).toBeLessThanOrEqual(225);
    expect(BUDGETS_KB["vendor-i18n"]).toBeLessThanOrEqual(80);
    expect(BUDGETS_KB.lib).toBeLessThanOrEqual(140);
    expect(BUDGETS_KB["*"]).toBeLessThanOrEqual(300);
  });
});
