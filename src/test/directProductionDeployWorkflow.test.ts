import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(
    process.cwd(),
    ".github",
    "workflows",
    "direct-cloudflare-production-deploy.yml",
  ),
  "utf8",
);

describe("manual Cloudflare production deploy workflow", () => {
  it("validates the exact current main SHA but leaves production mutation disabled", () => {
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("git fetch --no-tags origin main");
    expect(workflow).toContain("Recovery SHA must be the exact checked-out current main SHA.");
    expect(workflow).toContain("node scripts/production-release-validation.mjs github-recovery");
    expect(workflow).toContain('--sha "$RELEASE_SHA"');
    expect(workflow).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(workflow).toContain("Production recovery mutations remain disabled");
    expect(workflow).not.toContain("Deploy to Cloudflare Pages");
  });
});
