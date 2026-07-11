import { describe, expect, it } from "vitest";

import { buildCloudflarePostureEvidence, validateCloudflareEnv } from "./capture-cloudflare-admin-posture.mjs";

describe("Cloudflare admin posture capture", () => {
  it("reports missing Cloudflare credentials without making API calls", async () => {
    const evidence = await buildCloudflarePostureEvidence({
      env: {},
      fetchImpl: async () => {
        throw new Error("fetch must not run without credentials");
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(evidence).toMatchObject({
      provider: "cloudflare",
      status: "unconfigured",
      missingEnv: ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_PAGES_PROJECT"],
    });
  });

  it("captures Pages project posture and does not include the token", async () => {
    const calls = [];
    const evidence = await buildCloudflarePostureEvidence({
      env: {
        CLOUDFLARE_API_TOKEN: "cf_secret",
        CLOUDFLARE_ACCOUNT_ID: "account_123",
        CLOUDFLARE_PAGES_PROJECT: "maiprop-listing-site",
      },
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), authorization: options.headers.Authorization });
        return {
          ok: true,
          status: 200,
          json: async () => ({
            success: true,
            result: {
              id: "project-id",
              name: "maiprop-listing-site",
              production_branch: "main",
              domains: ["portal.maiprop.co"],
              latest_deployment: {
                id: "deployment-id",
                environment: "production",
                aliases: ["portal.maiprop.co"],
                latest_stage: { status: "success" },
                deployment_trigger: { metadata: { commit_hash: "66326673d2eea057f16584795655572974f97f99" } },
              },
            },
          }),
        };
      },
      now: () => new Date("2026-06-22T12:00:00.000Z"),
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].authorization).toBe("Bearer cf_secret");
    expect(JSON.stringify(evidence)).not.toContain("cf_secret");
    expect(evidence.status).toBe("captured");
    expect(evidence.pagesProject.productionBranch).toBe("main");
    expect(evidence.pagesProject.domains).toEqual(["portal.maiprop.co"]);
    expect(evidence.pagesProject.latestProductionDeployment).toEqual({
      status: "success",
      commitHash: "66326673d2eea057f16584795655572974f97f99",
    });
  });

  it("accepts CF_PROJECT as the legacy project env alias", () => {
    expect(
      validateCloudflareEnv({
        CLOUDFLARE_API_TOKEN: "x",
        CLOUDFLARE_ACCOUNT_ID: "a",
        CF_PROJECT: "legacy-project",
      }),
    ).toEqual([]);
  });

  it("fails closed when Cloudflare returns an incomplete Pages project record", async () => {
    const evidence = await buildCloudflarePostureEvidence({
      env: {
        CLOUDFLARE_API_TOKEN: "cf_secret",
        CLOUDFLARE_ACCOUNT_ID: "account_123",
        CLOUDFLARE_PAGES_PROJECT: "maiprop-listing-site",
      },
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, result: { name: "maiprop-listing-site" } }),
      }),
    });

    expect(evidence).toMatchObject({
      provider: "cloudflare",
      status: "failed",
      errors: ["Pages project record is missing a project id or production branch"],
    });
  });
});
