import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/live-operational-smoke.yml", "utf8");

describe("live operational smoke workflow", () => {
  it("uses only unauthenticated public GET and HEAD health checks", () => {
    expect(workflow).toContain("Run unauthenticated public read-only checks");
    expect(workflow).toContain('method: "HEAD"');
    expect(workflow).toContain('method: "GET"');
    expect(workflow).toContain('"/"');
    expect(workflow).toContain("/api/public/listings?limit=1");
    expect(workflow).toContain("/api/public/auctions?limit=1");
    expect(workflow).toContain("/api/public/open-houses?limit=1");
    expect(workflow).toContain("/api/public/homepage?section=listing_counts");
    expect(workflow).toContain("Public read-only probe passed");
  });

  it("cannot reach authenticated, metered, or repository-controlled production paths", () => {
    expect(workflow).not.toMatch(
      /secrets\.|SUPABASE_|VITE_SUPABASE_|E2E_|\/auth\/|ai-quota-status/i,
    );
    expect(workflow).not.toMatch(
      /\b(?:POST|PUT|PATCH|DELETE)\b|npm\s+(?:run|exec)|\bnpx\b|playwright/i,
    );
    expect(workflow).not.toContain("actions/checkout");
    expect(workflow).not.toContain("Run role and tier matrix smoke");
    expect(workflow).not.toContain("Run non-consuming AI quota smoke");
  });
});
