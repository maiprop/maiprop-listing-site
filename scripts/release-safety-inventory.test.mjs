import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  cloudflareHttpMutationViolation,
  findCloudflareHttpMutations,
  isAuthorizedCloudflareHttpMutationWorkflow,
} from "./release-safety-inventory.mjs";

describe("release safety inventory", () => {
  it("inventories generic Cloudflare API HTTP mutations", () => {
    const workflow = `
      curl --request PATCH https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
      curl -XPOST https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
      curl -X PUT https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
      curl --request=DELETE https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
    `;

    expect(findCloudflareHttpMutations(workflow)).toEqual([
      "DELETE",
      "PATCH",
      "POST",
      "PUT",
    ]);
    expect(findCloudflareHttpMutations(
      "curl -fsS https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p",
    )).toEqual([]);
    expect(findCloudflareHttpMutations(`
      CLOUDFLARE_ACCOUNT_ID=account
      curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"
    `)).toEqual(["PATCH"]);
  });

  it("never authorizes Cloudflare HTTP mutations in evidence workflows", () => {
    const patch = `
      curl --request PATCH https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p
    `;

    expect(cloudflareHttpMutationViolation({
      workflowPath: ".github/workflows/compliance-evidence.yml",
      text: patch,
      authorized: false,
    })).toMatch(/evidence workflow/i);
    expect(cloudflareHttpMutationViolation({
      workflowPath:
        ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
      text: patch,
      authorized: true,
    })).toBeNull();
  });

  it("detects non-curl Cloudflare API mutation clients", () => {
    const mutations = [
      {
        source: `await fetch("https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p", {
          method: "PATCH",
        });`,
        method: "PATCH",
      },
      {
        source:
          'Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p" -Method Delete',
        method: "DELETE",
      },
      {
        source:
          'Invoke-WebRequest -Method PUT -Uri "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"',
        method: "PUT",
      },
      {
        source:
          'wget --method=POST "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"',
        method: "POST",
      },
      {
        source:
          'gh api --method PATCH "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"',
        method: "PATCH",
      },
    ];

    for (const { source, method } of mutations) {
      expect(findCloudflareHttpMutations(source)).toEqual([method]);
    }

    expect(cloudflareHttpMutationViolation({
      workflowPath: ".github/workflows/untrusted-provider-control.yml",
      text: mutations.map(({ source }) => source).join("\n"),
      authorized: false,
    })).toMatch(/unauthorized/i);
  });

  it("keeps the Cloudflare HTTP mutation allowlist narrowly dedicated", () => {
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
    )).toBe(true);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/stage-release.yml",
    )).toBe(true);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/reusable-supabase-staging.yml",
    )).toBe(false);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/compliance-evidence.yml",
    )).toBe(false);
  });

  it("passes the checked inventory for documented environment variables", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/release-safety-inventory.mjs", "--check"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        maxBuffer: 10 * 1024 * 1024,
      },
    );

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stderr).toContain("[release-safety] OK");
  });
});
