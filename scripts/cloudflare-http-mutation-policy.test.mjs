import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  cloudflareHttpMutationViolation,
  findCloudflareHttpMutations,
  isAuthorizedCloudflareHttpMutationWorkflow,
} from "./cloudflare-http-mutation-policy.mjs";

describe("Cloudflare HTTP mutation policy", () => {
  it("detects mutating Cloudflare API clients without flagging reads", () => {
    const mutations = [
      {
        source:
          'curl --request PATCH "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"',
        method: "PATCH",
      },
      {
        source: `await fetch("https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p", {
          method: "PUT",
        });`,
        method: "PUT",
      },
      {
        source:
          'Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p" -Method Delete',
        method: "DELETE",
      },
      {
        source:
          'Invoke-WebRequest -Method PATCH -Uri "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/p"',
        method: "PATCH",
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
    expect(
      findCloudflareHttpMutations(
        'curl -fsS "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"',
      ),
    ).toEqual([]);
  });

  it("keeps an explicit curl method authoritative when data is present", () => {
    expect(
      findCloudflareHttpMutations(
        'curl -X PATCH --data "$PAYLOAD" "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"',
      ),
    ).toEqual(["PATCH"]);
    expect(
      findCloudflareHttpMutations(
        'curl --data "$PAYLOAD" "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"',
      ),
    ).toEqual(["POST"]);
  });

  it("does not associate mutation flags from a later command", () => {
    expect(
      findCloudflareHttpMutations(`curl -fsS "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"
echo "unrelated"
curl -X PATCH "https://example.com/not-cloudflare"`),
    ).toEqual([]);
  });

  it("resolves a workflow-level alias for the Cloudflare API origin", () => {
    expect(
      findCloudflareHttpMutations(`env:
  CF_API_BASE: https://api.cloudflare.com/client/v4
steps:
  - run: curl -X DELETE "$CF_API_BASE/accounts/account/pages/projects/project"`),
    ).toEqual(["DELETE"]);
  });

  it("resolves braced shell and GitHub environment aliases", () => {
    expect(
      findCloudflareHttpMutations(`API_BASE="https://api.cloudflare.com/client/v4"
curl -X PATCH "\${API_BASE}/accounts/account/pages/projects/project"`),
    ).toEqual(["PATCH"]);
    expect(
      findCloudflareHttpMutations(`env:
  API_BASE: https://api.cloudflare.com/client/v4
steps:
  - run: curl -X DELETE "\${{ env.API_BASE }}/accounts/account/pages/projects/project"`),
    ).toEqual(["DELETE"]);
  });

  it("authorizes only the dedicated bootstrap lock workflow", () => {
    const lock =
      ".github/workflows/lock-cloudflare-pages-git-deploys.yml";
    const patch =
      'curl --request PATCH "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/p"';

    expect(isAuthorizedCloudflareHttpMutationWorkflow(lock)).toBe(true);
    expect(
      isAuthorizedCloudflareHttpMutationWorkflow(
        ".github/workflows/compliance-evidence.yml",
      ),
    ).toBe(false);
    expect(
      isAuthorizedCloudflareHttpMutationWorkflow(
        ".github/workflows/stage-release.yml",
      ),
    ).toBe(false);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `PRODUCTION_PROJECT="maiprop-listing-site"
STAGING_PROJECT="maiprop-listing-site-staging"
API_BASE="https://api.cloudflare.com/client/v4"
patch_project() {
  local name="$1"
  curl --request PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$name"
}
patch_project "$PRODUCTION_PROJECT"
patch_project "$STAGING_PROJECT"`,
      }),
    ).toBeNull();
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: ".github/workflows/compliance-evidence.yml",
        text: patch,
      }),
    ).toMatch(/evidence workflow/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: ".github/workflows/untrusted-provider-control.yml",
        text: patch,
      }),
    ).toMatch(/unauthorized/i);
  });

  it("rejects unauthorized methods and resources inside the bootstrap workflow", () => {
    const lock = ".github/workflows/lock-cloudflare-pages-git-deploys.yml";
    const fixedProjects = `PRODUCTION_PROJECT="maiprop-listing-site"
STAGING_PROJECT="maiprop-listing-site-staging"
API_BASE="https://api.cloudflare.com/client/v4"`;

    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `${fixedProjects}
curl -X DELETE "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PRODUCTION_PROJECT"`,
      }),
    ).toMatch(/unauthorized/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `${fixedProjects}
curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/zones/zone"`,
      }),
    ).toMatch(/unauthorized/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `${fixedProjects}
patch_project() {
  local name="$1"
  curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$name"
}
patch_project "$UNTRUSTED_PROJECT"`,
      }),
    ).toMatch(/unauthorized/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `${fixedProjects}
patch_project() {
  local name="$1"
  curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/\${name}"
}
patch_project "$UNTRUSTED_PROJECT"`,
      }),
    ).toMatch(/unauthorized/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `${fixedProjects}
patch_project() {
  local name="$1"
  curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$name"
}
patch_project "$PRODUCTION_PROJECT"
patch_project "$STAGING_PROJECT"
gh api --method PATCH "https://api.cloudflare.com/client/v4/accounts/account/pages/projects/other"`,
      }),
    ).toMatch(/unauthorized/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: lock,
        text: `${fixedProjects}
curl -X PATCH "$API_BASE/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$PRODUCTION_PROJECT"`,
      }),
    ).toMatch(/unauthorized/i);
  });

  it("preserves current-main compatibility without widening bootstrap authorization", () => {
    const root = resolve(import.meta.dirname, "..");
    const ciPath = ".github/workflows/ci.yml";
    const productionPath =
      ".github/workflows/reusable-cloudflare-production-deploy.yml";
    const ci = readFileSync(resolve(root, ciPath), "utf8");
    const production = readFileSync(resolve(root, productionPath), "utf8");

    expect(isAuthorizedCloudflareHttpMutationWorkflow(ciPath)).toBe(false);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: ciPath,
        text: ci,
      }),
    ).toBeNull();
    expect(isAuthorizedCloudflareHttpMutationWorkflow(productionPath)).toBe(
      false,
    );
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: productionPath,
        text: production,
      }),
    ).toBeNull();
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: productionPath,
        text: production.replace(
          "if: ${{ false }}",
          "if: ${{ true }}",
        ),
      }),
    ).toMatch(/unauthorized/i);
    expect(
      cloudflareHttpMutationViolation({
        workflowPath: ciPath,
        text: `${ci}
# curl -X PATCH "https://api.cloudflare.com/client/v4/accounts/a/pages/projects/other"`,
      }),
    ).toMatch(/unauthorized/i);
  });

  it.each([
    ".github/workflows/ci.yml",
    ".github/workflows/reusable-cloudflare-production-deploy.yml",
  ])(
    "accepts LF and CRLF forms of pinned %s but rejects altered content",
    (workflowPath) => {
      const root = resolve(import.meta.dirname, "..");
      const baseline = readFileSync(resolve(root, workflowPath), "utf8");
      const lf = baseline.replace(/\r\n?/g, "\n");
      const crlf = lf.replace(/\n/g, "\r\n");

      for (const text of [lf, crlf]) {
        expect(
          cloudflareHttpMutationViolation({ workflowPath, text }),
        ).toBeNull();
        expect(
          cloudflareHttpMutationViolation({
            workflowPath,
            text: `${text}# altered\n`,
          }),
        ).toMatch(/unauthorized/i);
      }
    },
  );
});
