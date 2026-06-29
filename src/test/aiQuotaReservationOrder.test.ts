import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("paid AI quota reservation order", () => {
  it.each([
    {
      path: "supabase/functions/property-valuation/index.ts",
      validation: "city, sqm and price are required",
    },
    {
      path: "supabase/functions/neighbourhood-report/index.ts",
      validation: "city is required",
    },
    {
      path: "supabase/functions/property-pois/index.ts",
      validation: "lat/lng required",
    },
  ])("reserves quota only after rate limit and validation in $path", ({ path, validation }) => {
    const source = read(path);
    const rateLimitIndex = source.indexOf("return tooManyRequestsResponse");
    const validationIndex = source.indexOf(validation);
    const quotaIndex = source.indexOf("await enforceAiQuota", validationIndex);

    expect(rateLimitIndex).toBeGreaterThan(0);
    expect(validationIndex).toBeGreaterThan(rateLimitIndex);
    expect(quotaIndex).toBeGreaterThan(validationIndex);
  });
});
