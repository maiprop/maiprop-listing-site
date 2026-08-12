import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("paid AI quota reservation order", () => {
  it.each([
    {
      path: "supabase/functions/property-valuation/index.ts",
      rateLimit: "await valuationLimiter.isLimited",
      validation: "await parseJsonBody(req, propertyValuationRequestSchema)",
    },
    {
      path: "supabase/functions/neighbourhood-report/index.ts",
      rateLimit: "await neighbourhoodLimiter.isLimited",
      validation: "await parseJsonBody(req, neighbourhoodReportRequestSchema)",
    },
    {
      path: "supabase/functions/property-pois/index.ts",
      rateLimit: "await poisLimiter.isLimited",
      validation: "await parseJsonBody(req, propertyPoisRequestSchema)",
    },
  ])("reserves quota only after rate limit and validation in $path", ({ path, rateLimit, validation }) => {
    const source = read(path);
    const rateLimitIndex = source.indexOf(rateLimit);
    const validationIndex = source.indexOf(validation);
    const quotaIndex = source.indexOf("await enforceAiQuota", validationIndex);

    expect(rateLimitIndex).toBeGreaterThan(0);
    expect(validationIndex).toBeGreaterThan(rateLimitIndex);
    expect(quotaIndex).toBeGreaterThan(validationIndex);
  });
});
