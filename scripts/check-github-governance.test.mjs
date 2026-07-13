import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  checkGithubActionsPolicy,
  checkBranchProtectionEvidence,
  checkCodeownersCoverage,
  checkGithubGovernance,
  checkReleasePrLighthouseDispatch,
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
      "  quality:",
      "    steps: []",
      "  release-safety:",
      "    steps: []",
      "  e2e:",
      "    steps: []",
      "  e2e-security-staging:",
      "    steps: []",
      "  migrations-validate:",
      "    steps: []",
      "  deploy-supabase-staging:",
      "    steps: []",
      "  lighthouse:",
      "    if: >",
      "      github.event_name == 'workflow_dispatch' &&",
      "      startsWith(github.ref, 'refs/heads/release-please--')",
      "    needs: [quality, release-safety]",
      "    steps: []",
      "  release-status:",
      "    if: >",
      "      always() &&",
      "      github.event_name == 'workflow_dispatch' &&",
      "      startsWith(github.ref, 'refs/heads/release-please--')",
      "    needs: [quality, release-safety, e2e, e2e-security-staging, migrations-validate, lighthouse, deploy-supabase-staging]",
      "    permissions:",
      "      contents: read",
      "      statuses: write",
      "    steps:",
      "      - name: Publish release CI status",
      "        env:",
      "          GH_REPO: ${{ github.repository }}",
      "          QUALITY_RESULT: ${{ needs.quality.result }}",
      "        run: |",
      "          context=\"release-please/ci\"",
      "          target_url=\"https://github.com/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}\"",
      "          state=success",
      "          state=failure",
      "          gh api --method POST \"repos/${GITHUB_REPOSITORY}/statuses/${GITHUB_SHA}\" -f context=\"$context\" -f state=\"$state\" -f target_url=\"$target_url\"",
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
      "jobs:",
      "  release-please:",
      "    permissions:",
      "      contents: write",
      "      issues: write",
      "      pull-requests: write",
      "    steps:",
      "      - uses: googleapis/release-please-action@45996ed1f6d02564a971a2fa1b5860e934307cf7",
      "  verify-release-pr:",
      "    timeout-minutes: 5",
      "    permissions:",
      "      actions: write",
      "      contents: read",
      "      statuses: write",
      "    steps:",
      "      - name: Dispatch CI for the release PR",
      "        env:",
      "          GH_REPO: ${{ github.repository }}",
      "        run: |",
      "          release_sha=$(gh api \"repos/${GITHUB_REPOSITORY}/branches/${RELEASE_BRANCH}\" --jq '.commit.sha')",
      "          status_api=\"repos/${GITHUB_REPOSITORY}/statuses/${release_sha}\"",
      "          gh api --method POST \"$status_api\" -f state=pending -f context=\"release-please/ci\"",
      "          existing_run=$(gh run list --workflow ci.yml --branch \"$RELEASE_BRANCH\" --event workflow_dispatch --limit 100 --json databaseId,headSha,status,conclusion --jq \"map(select(.headSha == \\\"$release_sha\\\")) | first // empty\")",
      "          if [[ -n \"$existing_run\" ]]; then exit 0; fi",
      "          gh workflow run ci.yml --ref \"$RELEASE_BRANCH\"",
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

    expect(result.failures).toEqual([]);
    expect(result.ok).toBe(true);
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
  });

  it("requires explicit repository context for release verification commands", () => {
    const root = makeFixture();
    const path = join(root, ".github", "workflows", "release.yml");
    const workflow = readFileSync(path, "utf8").replace(
      ["        env:", "          GH_REPO: ${{ github.repository }}"].join("\n") + "\n",
      "",
    );
    writeFileSync(path, workflow);

    const result = checkReleasePrCiDispatch(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("explicit GitHub repository context");
  });

  it("rejects release verification that can reuse an older exact-SHA run", () => {
    const root = makeFixture();
    const path = join(root, ".github", "workflows", "release.yml");
    const workflow = readFileSync(path, "utf8").replace(".headSha == \\\"$release_sha\\\"", ".headSha != \\\"$release_sha\\\"");
    writeFileSync(path, workflow);

    const result = checkReleasePrCiDispatch(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("exact release SHA");
  });

  it("does not accept release commands that only appear in comments", () => {
    const root = makeFixture();
    const path = join(root, ".github", "workflows", "release.yml");
    writeFileSync(
      path,
      [
        "name: Release Please",
        "jobs:",
        "  release-please:",
        "    steps:",
        "      - run: echo release",
        "# actions: write",
        "# statuses: write",
        "# gh workflow run ci.yml --ref \"$RELEASE_BRANCH\"",
        "# context=\"release-please/ci\"",
      ].join("\n"),
    );

    const result = checkReleasePrCiDispatch(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("workflow_dispatch");
  });

  it("requires exact-head CI to publish the final release status asynchronously", () => {
    const root = makeFixture();
    const path = join(root, ".github", "workflows", "ci.yml");
    const workflow = readFileSync(path, "utf8").replace("  release-status:", "  ignored-release-status:");
    writeFileSync(path, workflow);

    const result = checkReleasePrCiDispatch(root);

    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("final release status");
  });

  it("requires Lighthouse for workflow-dispatched Release Please branches", () => {
    const root = makeFixture();
    expect(checkReleasePrLighthouseDispatch(root).ok).toBe(true);

    const path = join(root, ".github", "workflows", "ci.yml");
    writeFileSync(path, readFileSync(path, "utf8").replace("refs/heads/release-please--", "refs/heads/manual-release--"));

    const result = checkReleasePrLighthouseDispatch(root);
    expect(result.ok).toBe(false);
    expect(result.failures.join("\n")).toContain("Release Please branches");
  });
});
