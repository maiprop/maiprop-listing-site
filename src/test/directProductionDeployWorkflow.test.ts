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
  it("cannot bypass an exact-SHA successful CI run", () => {
    const verificationIndex = workflow.indexOf(
      "Require successful exact-SHA CI",
    );
    const deployIndex = workflow.indexOf("Deploy to Cloudflare Pages");

    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("actions/workflows/ci.yml/runs");
    expect(workflow).toContain('head_sha: process.env.GITHUB_SHA');
    expect(workflow).toContain('event: "push"');
    expect(workflow).toContain('conclusion: "success"');
    expect(workflow).toContain(
      "No successful push CI run exists for exact main SHA",
    );
    expect(verificationIndex).toBeGreaterThan(0);
    expect(deployIndex).toBeGreaterThan(verificationIndex);
  });
});
