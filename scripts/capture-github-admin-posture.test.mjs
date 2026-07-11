import { describe, expect, it } from "vitest";

import { buildGithubAdminPostureEvidence, validateGithubEnv } from "./capture-github-admin-posture.mjs";

describe("GitHub admin posture capture", () => {
  it("reports missing GitHub credentials without API calls", async () => {
    const evidence = await buildGithubAdminPostureEvidence({
      env: {},
      fetchImpl: async () => {
        throw new Error("fetch must not run without credentials");
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(evidence).toMatchObject({
      provider: "github",
      status: "unconfigured",
      missingEnv: ["GITHUB_TOKEN", "GITHUB_REPOSITORY"],
    });
  });

  it("captures branch protection, actions policy, and environment state", async () => {
    const evidence = await buildGithubAdminPostureEvidence({
      env: {
        GITHUB_TOKEN: "gh_secret",
        GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
        GITHUB_BRANCH: "main",
      },
      fetchImpl: async (url, options) => {
        expect(options.headers.Authorization).toBe("Bearer gh_secret");
        const path = new URL(String(url)).pathname;
        if (path.endsWith("/branches/main/protection")) {
          return jsonResponse({
            required_pull_request_reviews: {
              required_approving_review_count: 1,
              require_code_owner_reviews: true,
            },
            required_status_checks: { contexts: ["Build / Lint / Test"] },
            allow_force_pushes: { enabled: false },
            allow_deletions: { enabled: false },
            enforce_admins: { enabled: true },
            restrictions: null,
          });
        }
        if (path.endsWith("/actions/permissions")) {
          return jsonResponse({ enabled_repositories: "selected", allowed_actions: "selected" });
        }
        if (path.endsWith("/environments")) {
          return jsonResponse({ environments: [{ name: "production" }, { name: "staging" }] });
        }
        if (path.endsWith("/environments/production")) {
          return jsonResponse({ protection_rules: [{ type: "required_reviewers" }] });
        }
        throw new Error(`unexpected URL ${url}`);
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(JSON.stringify(evidence)).not.toContain("gh_secret");
    expect(evidence.status).toBe("captured");
    expect(evidence.branchProtection.requiredApprovingReviewCount).toBe(1);
    expect(evidence.branchProtection.requiredPullRequestReviews).toBe(true);
    expect(evidence.branchProtection.requiredStatusChecks).toBe(true);
    expect(evidence.branchProtection.allowsForcePushes).toBe(false);
    expect(evidence.branchProtection.allowsDeletions).toBe(false);
    expect(evidence.productionEnvironment.hasRequiredReviewers).toBe(true);
    expect(evidence.actionsPermissions.allowedActions).toBe("selected");
  });

  it("records GitHub plan-limited branch protection evidence and compensating controls", async () => {
    const evidence = await buildGithubAdminPostureEvidence({
      env: {
        GITHUB_TOKEN: "gh_secret",
        GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
      },
      fetchImpl: async (url) => {
        const path = new URL(String(url)).pathname;
        if (path.endsWith("/branches/main/protection")) {
          return jsonResponse({ message: "Upgrade to GitHub Pro or make this repository public to enable this feature." }, 403);
        }
        return jsonResponse({});
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(evidence.status).toBe("plan_limited");
    expect(evidence.branchProtection).toMatchObject({
      status: "plan_limited",
      httpStatus: 403,
      message: "Upgrade to GitHub Pro or make this repository public to enable this feature.",
    });
    expect(evidence.compensatingControls.map((control) => control.id)).toEqual([
      "source-controlled-branch-policy",
      "required-ci-governance-gate",
    ]);
  });

  it("validates exact required environment names", () => {
    expect(validateGithubEnv({ GITHUB_TOKEN: "x", GITHUB_REPOSITORY: "owner/repo" })).toEqual([]);
    expect(validateGithubEnv({ GITHUB_TOKEN: "x" })).toEqual(["GITHUB_REPOSITORY"]);
  });
});

const jsonResponse = (body, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});
