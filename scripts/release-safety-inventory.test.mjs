import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cloudflareHttpMutationViolation,
  findCloudflareHttpMutations,
  isAuthorizedCloudflareHttpMutationWorkflow,
  productionDatabaseCredentialScopeViolations,
  scanWorkflows,
  stageReleaseBuildPolicyViolation,
} from "./release-safety-inventory.mjs";

describe("release safety inventory", () => {
  it("allows only the pinned, staging-only legacy N-1 reconstruction build", () => {
    const workflowPath = resolve(
      process.cwd(),
      ".github/workflows/stage-release.yml",
    );
    const source = readFileSync(workflowPath, "utf8");

    expect(stageReleaseBuildPolicyViolation(source)).toBeNull();
    expect(
      stageReleaseBuildPolicyViolation(
        source.replace(
          "LEGACY_PRODUCTION_SHA: db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
          "LEGACY_PRODUCTION_SHA: 0000000000000000000000000000000000000000",
        ),
      ),
    ).toMatch(/without rebuilding/i);
    expect(
      stageReleaseBuildPolicyViolation(
        `${source}\n# A current-candidate rebuild must remain forbidden.\nnpm run build\n`,
      ),
    ).toMatch(/without rebuilding/i);
    expect(
      stageReleaseBuildPolicyViolation(
        source.replace(
          'purpose: "staging-n-minus-one-compatibility-only"',
          'purpose: "production-compatible"',
        ),
      ),
    ).toMatch(/without rebuilding/i);
  });

  it("fails closed on production database credential-scope regressions", () => {
    const calledWorkflow = {
      text: "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
      parsed: {
        on: { workflow_call: { secrets: {} } },
        jobs: { deploy: { environment: "production" } },
      },
    };
    const release = {
      jobs: {
        "deploy-production-database": { secrets: {} },
        "deploy-production-edge": { secrets: {} },
      },
    };

    expect(
      productionDatabaseCredentialScopeViolations({
        release,
        calledWorkflows: [calledWorkflow, calledWorkflow],
      }),
    ).toEqual([]);

    expect(
      productionDatabaseCredentialScopeViolations({
        release: {
          jobs: {
            ...release.jobs,
            "deploy-production-database": {
              secrets: { SUPABASE_PRODUCTION_DB_URL: "forwarded" },
            },
          },
        },
        calledWorkflows: [
          {
            text: "secrets: inherit",
            parsed: {
              on: {
                workflow_call: {
                  secrets: { SUPABASE_PRODUCTION_DB_URL: { required: true } },
                },
              },
              jobs: { deploy: {} },
            },
          },
        ],
      }),
    ).toHaveLength(3);
  });

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
    const bootstrapPath =
      ".github/workflows/lock-cloudflare-pages-git-deploys.yml";
    const bootstrap = readFileSync(resolve(process.cwd(), bootstrapPath), "utf8");

    expect(cloudflareHttpMutationViolation({
      workflowPath: ".github/workflows/compliance-evidence.yml",
      text: patch,
    })).toMatch(/evidence workflow/i);
    expect(cloudflareHttpMutationViolation({
      workflowPath: bootstrapPath,
      text: patch,
    })).toMatch(/unauthorized/i);
    expect(cloudflareHttpMutationViolation({
      workflowPath: bootstrapPath,
      text: bootstrap,
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
      ".github/workflows/reusable-cloudflare-production-deploy.yml",
    )).toBe(true);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/reusable-supabase-staging.yml",
    )).toBe(false);
    expect(isAuthorizedCloudflareHttpMutationWorkflow(
      ".github/workflows/compliance-evidence.yml",
    )).toBe(false);
  });

  it("enforces the GitHub Free HMAC artifact binding contract", () => {
    const scopedViolations = scanWorkflows().violations.filter((violation) =>
      violation.startsWith("GitHub Free release binding:"));
    expect(scopedViolations).toEqual([]);
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
    const mutations =
      JSON.parse(result.stdout).workflow.provider_http_mutations;
    expect(mutations).toContainEqual({
      provider: "cloudflare",
      workflow:
        ".github/workflows/lock-cloudflare-pages-git-deploys.yml",
      method: "PATCH",
    });
    expect(
      mutations.filter(({ workflow }) => /evidence/i.test(workflow)),
    ).toEqual([]);
  });
});
