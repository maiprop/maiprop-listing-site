import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkGithubActionsPolicy,
  checkBranchProtectionEvidence,
  checkCodeownersCoverage,
  checkGithubGovernance,
  checkReleasePrCiDispatch,
} from "./check-github-governance.mjs";

const makeFixture = () => {
  const root = mkdtempSync(join(tmpdir(), "maiprop-github-governance-"));
  mkdirSync(join(root, ".github"), { recursive: true });
  mkdirSync(join(root, ".github", "workflows"), { recursive: true });
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
        "E2E Security (Live-safe)",
        "Lighthouse CI",
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
    join(root, "docs", "governance", "github-actions-policy.expected.json"),
    JSON.stringify({
      requirePinnedActions: true,
      allowedActionRepositories: [
        "actions/checkout",
        "actions/setup-node",
        "actions/upload-artifact",
        "denoland/setup-deno",
        "googleapis/release-please-action",
      ],
      recommendedLiveRepositoryPolicy: {
        allowed_actions: "selected",
        sha_pinning_required: true,
      },
    }),
  );
  writeFileSync(
    join(root, ".github", "workflows", "ci.yml"),
    [
      "name: CI",
      "jobs:",
      "  test:",
      "    steps:",
      "      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
      "      - uses: denoland/setup-deno@667a34cdef165d8d2b2e98dde39547c9daac7282",
      "  local:",
      "    uses: ./.github/workflows/reusable-release-safety.yml",
    ].join("\n"),
  );
  writeFileSync(
    join(root, ".github", "workflows", "release.yml"),
    [
      "name: Release Please",
      "permissions:",
      "  actions: write",
      "  statuses: write",
      "jobs:",
      "  release-please:",
      "    steps:",
      "      - uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7",
      "      - name: Dispatch and verify CI for the release PR",
      "        run: |",
      "          gh workflow run ci.yml --ref \"$RELEASE_BRANCH\"",
      "          gh run watch \"$run_id\" --exit-status",
      "          context=\"release-please/ci\"",
    ].join("\n"),
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
      "E2E Security (Live-safe)",
      "Lighthouse CI",
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

  it("requires the live security and Lighthouse release gates in branch protection evidence", () => {
    const root = makeFixture();
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

    const result = checkBranchProtectionEvidence(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("E2E Security (Live-safe)");
    expect(result.failures.join("\n")).toContain("Lighthouse CI");
  });

  it("fails when workflow actions use floating refs or unapproved repositories", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, ".github", "workflows", "ci.yml"),
      [
        "name: CI",
        "jobs:",
        "  test:",
        "    steps:",
        "      - uses: actions/checkout@v4",
        "      - uses: untrusted/example-action@0123456789012345678901234567890123456789",
      ].join("\n"),
    );

    const result = checkGithubActionsPolicy(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("must be pinned by commit SHA");
    expect(result.failures.join("\n")).toContain("unapproved action repository");
  });

  it("requires Release Please to dispatch CI for its bot-created release branch", () => {
    const root = makeFixture();
    writeFileSync(
      join(root, ".github", "workflows", "release.yml"),
      [
        "name: Release Please",
        "permissions:",
        "  pull-requests: write",
        "jobs:",
        "  release-please:",
        "    steps:",
        "      - uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7",
      ].join("\n"),
    );

    const result = checkReleasePrCiDispatch(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("workflow_dispatch");
    expect(result.failures.join("\n")).toContain("wait for the dispatched CI run");
    expect(result.failures.join("\n")).toContain("commit status");
  });
});
