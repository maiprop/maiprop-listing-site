import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const liveSmoke = () =>
  readFileSync(resolve(process.cwd(), "e2e/live-critical-smoke.spec.ts"), "utf8");

describe("live critical smoke E2E contract", () => {
  it("gates buyer-authenticated checks on explicit live buyer credentials", () => {
    const text = liveSmoke();

    expect(text).toContain("function skipUnlessLiveBuyerAuthConfigured()");
    expect(text).toMatch(
      /checkout eligibility blocks invite-only investor plans[\s\S]*skipUnlessLiveBuyerAuthConfigured\(\);/,
    );
    expect(text).toMatch(
      /non-admin users cannot reach the role approval surface[\s\S]*skipUnlessLiveBuyerAuthConfigured\(\);/,
    );
    expect(text).toMatch(
      /firesale and investor access surfaces render for a regular buyer[\s\S]*skipUnlessLiveBuyerAuthConfigured\(\);/,
    );
  });
});
