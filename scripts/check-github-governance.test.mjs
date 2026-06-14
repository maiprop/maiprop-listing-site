import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkBranchProtectionEvidence,
  checkCodeownersCoverage,
  checkGithubGovernance,
} from "./check-github-governance.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-github-governance-"));
  mkdirSync(join(root, ".github"), { recursive: true });
  mkdirSync(join(root, "docs", "governance"), { recursive: true });

  writeFileSync(
    join(root, ".github", "CODEOWNERS"),
    [
      "* @krenios",
      "/.github/workflows/ @krenios",
      "/.github/CODEOWNERS @krenios",
      "/supabase/migrations/ @krenios",
      "/supabase/functions/_shared/ @krenios",
      "/src/integrations/supabase/ @krenios",
      "/src/contexts/AuthContext.tsx @krenios",
      "/functions/_middleware.ts @krenios",
      "/public/_headers @krenios",
      "/scripts/ @krenios",
    ].join("\n"),
  );
  writeFileSync(
    join(root, "docs", "governance", "main-branch-protection.expected.json"),
    JSON.stringify({
      branch: "main",
      requiredStatusChecks: [
        "Build / Lint / Test",
        "Release Safety Inventory",
        "Validate Supabase migrations",
        "E2E Tests",
      ],
      requiredApprovingReviewCount: 1,
      requireCodeOwnerReviews: true,
      dismissStaleReviews: true,
      requireConversationResolution: true,
      allowForcePushes: false,
      allowDeletions: false,
      doNotAllowBypass: true,
    }),
  );
  writeFileSync(
    join(root, "docs", "BRANCH_PROTECTION.md"),
    [
      "# Branch Protection",
      "Require pull request reviews",
      "Require review from Code Owners",
      "Dismiss stale pull request approvals",
      "Require conversation resolution",
      "Do not allow bypassing the above settings",
      "Allow force pushes | disabled",
      "Allow deletions | disabled",
      "Build / Lint / Test",
      "Validate Supabase migrations",
    ].join("\n"),
  );

  return root;
};

describe("GitHub governance check", () => {
  it("accepts complete CODEOWNERS and enterprise main-branch evidence", () => {
    const result = checkGithubGovernance(makeFixture());

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("fails when CODEOWNERS misses a critical blast-radius path", () => {
    const root = makeFixture();
    writeFileSync(join(root, ".github", "CODEOWNERS"), "* @krenios\n");

    const result = checkCodeownersCoverage(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("/supabase/migrations/");
  });

  it("fails when branch evidence allows bypassing required reviews", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, "docs", "governance", "main-branch-protection.expected.json"),
      JSON.stringify({
        branch: "main",
        requiredStatusChecks: ["Build / Lint / Test"],
        requiredApprovingReviewCount: 0,
        requireCodeOwnerReviews: false,
        dismissStaleReviews: true,
        requireConversationResolution: true,
        allowForcePushes: false,
        allowDeletions: false,
        doNotAllowBypass: false,
      }),
    );

    const result = checkBranchProtectionEvidence(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("requiredApprovingReviewCount");
    expect(result.failures.join("\n")).toContain("doNotAllowBypass");
  });
});
