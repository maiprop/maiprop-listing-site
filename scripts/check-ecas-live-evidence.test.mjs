import { describe, expect, it } from "vitest";

import { evaluateEcasLiveEvidence } from "./check-ecas-live-evidence.mjs";

describe("ECAS live evidence rollup", () => {
  it("passes advisory mode when providers are explicitly unconfigured", () => {
    const result = evaluateEcasLiveEvidence(
      [
        { provider: "sentry", status: "unconfigured", missingEnv: ["SENTRY_AUTH_TOKEN"] },
        { provider: "cloudflare", status: "unconfigured", missingEnv: ["CLOUDFLARE_API_TOKEN"] },
        { provider: "github", status: "blocked", blockers: ["GitHub plan does not expose branch protection"] },
      ],
      { strict: false },
    );

    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(3);
    expect(result.failures).toEqual([]);
  });

  it("fails strict mode unless every provider is captured", () => {
    const result = evaluateEcasLiveEvidence(
      [
        { provider: "sentry", status: "captured" },
        { provider: "cloudflare", status: "unconfigured", missingEnv: ["CLOUDFLARE_API_TOKEN"] },
        { provider: "github", status: "captured" },
      ],
      { strict: true },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      "sentry live evidence missing production query proof: environment=production, timeRange=24h, querySucceeded=true, issueCount matches issues",
      "cloudflare live evidence is unconfigured",
      "github live evidence missing required branch protection proof: branch=main, requiredPullRequestReviews, requiredStatusChecks, allowsForcePushes=false, allowsDeletions=false",
    ]);
  });

  it("fails strict mode when captured evidence lacks provider-specific proof fields", () => {
    const result = evaluateEcasLiveEvidence(
      [
        {
          provider: "github",
          status: "captured",
          branch: "main",
          branchProtection: { requiredPullRequestReviews: true },
        },
        {
          provider: "cloudflare",
          status: "captured",
          pagesProject: { name: "maiprop-listing-site", latestDeployment: { environment: "preview" } },
        },
        {
          provider: "sentry",
          status: "captured",
          environment: "staging",
          timeRange: "24h",
          querySucceeded: false,
        },
      ],
      { strict: true },
    );

    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      "sentry live evidence missing production query proof: environment=production, querySucceeded=true, issueCount matches issues",
      "cloudflare live evidence missing production deployment proof: pagesProject.idPresent=true, pagesProject.productionBranch=main, pagesProject.domains, latestProductionDeployment.status=success, latestProductionDeployment.commitHash",
      "github live evidence missing required branch protection proof: requiredStatusChecks, allowsForcePushes=false, allowsDeletions=false",
    ]);
  });

  it("passes strict mode with complete provider-specific proof fields", () => {
    const result = evaluateEcasLiveEvidence(
      [
        {
          provider: "github",
          status: "captured",
          branch: "main",
          branchProtection: {
            requiredPullRequestReviews: true,
            requiredStatusChecks: true,
            allowsForcePushes: false,
            allowsDeletions: false,
          },
        },
        {
          provider: "cloudflare",
          status: "captured",
          pagesProject: {
            idPresent: true,
            name: "maiprop-listing-site",
            productionBranch: "main",
            domains: ["portal.maiprop.co"],
            latestProductionDeployment: {
              status: "success",
              commitHash: "66326673d2eea057f16584795655572974f97f99",
            },
          },
        },
        {
          provider: "sentry",
          status: "captured",
          environment: "production",
          timeRange: "24h",
          querySucceeded: true,
          issueCount: 0,
          issues: [],
        },
      ],
      { strict: true },
    );

    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  it("accepts explicitly recorded GitHub plan limits only with passing compensating controls", () => {
    const result = evaluateEcasLiveEvidence(
      [
        {
          provider: "github",
          status: "plan_limited",
          branch: "main",
          branchProtection: {
            status: "plan_limited",
            httpStatus: 403,
            message: "Upgrade to GitHub Pro or make this repository public to enable this feature.",
          },
          compensatingControls: [
            { id: "source-controlled-branch-policy", status: "passed" },
            { id: "required-ci-governance-gate", status: "passed" },
          ],
        },
        {
          provider: "cloudflare",
          status: "captured",
          pagesProject: {
            idPresent: true,
            name: "maiprop-listing-site",
            productionBranch: "main",
            domains: ["portal.maiprop.co"],
            latestProductionDeployment: {
              status: "success",
              commitHash: "66326673d2eea057f16584795655572974f97f99",
            },
          },
        },
        {
          provider: "sentry",
          status: "captured",
          queriedAt: "2026-07-11T12:00:00.000Z",
          environment: "production",
          timeRange: "24h",
          querySucceeded: true,
          issueCount: 0,
          issues: [],
          issueCount: 0,
          issues: [],
        },
      ],
      { strict: true },
    );

    expect(result.ok).toBe(true);
  });

  it("requires all expected provider evidence documents", () => {
    const result = evaluateEcasLiveEvidence([{ provider: "sentry", status: "captured" }], { strict: true });

    expect(result.failures).toEqual([
      "sentry live evidence missing production query proof: environment=production, timeRange=24h, querySucceeded=true, issueCount matches issues",
      "cloudflare live evidence is missing",
      "github live evidence is missing",
    ]);
  });
});
