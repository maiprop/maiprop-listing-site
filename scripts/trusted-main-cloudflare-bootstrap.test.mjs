import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const parsedWorkflow = (name) => yaml.load(workflow(name));

describe("trusted-main Cloudflare bootstrap workflows", () => {
  it("parses both bootstrap workflows as YAML", () => {
    expect(parsedWorkflow("compliance-evidence.yml")).toBeTruthy();
    expect(
      parsedWorkflow("lock-cloudflare-pages-git-deploys.yml"),
    ).toBeTruthy();
  });

  it("keeps read-only identity bootstrap on verified current main", () => {
    const parsed = parsedWorkflow("compliance-evidence.yml");
    const source = workflow("compliance-evidence.yml");
    const verifyMain = parsed.jobs["verify-current-main"];
    const verifyCloudflare = parsed.jobs["cloudflare-pages-verify"];
    const collect = parsed.jobs.collect;

    expect(parsed.permissions).toEqual({
      contents: "read",
      actions: "read",
      "pull-requests": "read",
      "security-events": "read",
    });
    expect(verifyMain.if).toContain("github.ref == 'refs/heads/main'");
    expect(verifyMain.steps.some((step) => step.uses?.includes("checkout"))).toBe(
      false,
    );
    expect(source).toContain(
      'CURRENT_MAIN="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    );
    expect(source).toContain(
      'if [ "$CURRENT_MAIN" != "$GITHUB_WORKFLOW_SHA" ]; then',
    );
    expect(verifyCloudflare.needs).toBe("verify-current-main");
    expect(verifyCloudflare.if).toContain(
      "github.ref == 'refs/heads/main'",
    );
    expect(verifyCloudflare.concurrency["cancel-in-progress"]).toBe(false);
    expect(
      verifyCloudflare.steps.some(
        (step) => step.uses?.includes("checkout") || /npm\s/.test(step.run ?? ""),
      ),
    ).toBe(false);
    expect(collect.if).toContain("github.ref == 'refs/heads/main'");
    expect(collect.if).toContain(
      "needs.verify-current-main.result == 'success'",
    );

    const checkout = collect.steps.find((step) =>
      String(step.uses ?? "").startsWith("actions/checkout@"),
    );
    expect(checkout.with.ref).toBe(
      "${{ needs.verify-current-main.outputs.main_sha }}",
    );
    expect(checkout.with["persist-credentials"]).toBe(false);
    expect(collect.env).toBeUndefined();
  });

  it("isolates credentials and uploads minimized bootstrap identity evidence", () => {
    const parsed = parsedWorkflow("compliance-evidence.yml");
    const verifyCloudflare = parsed.jobs["cloudflare-pages-verify"];
    const collect = parsed.jobs.collect;
    const control = verifyCloudflare.steps.find(
      (step) => step.name === "Verify Cloudflare Pages Git deployment lockout",
    );
    const upload = verifyCloudflare.steps.find((step) =>
      String(step.uses ?? "").startsWith("actions/upload-artifact@"),
    );

    expect(control.env).toEqual({
      CLOUDFLARE_PAGES_READ_TOKEN:
        "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}",
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      EXPECTED_PRODUCTION_PROJECT_ID:
        "${{ vars.CLOUDFLARE_PAGES_PROJECT_ID }}",
      EXPECTED_STAGING_PROJECT_ID:
        "${{ vars.CLOUDFLARE_STAGING_PAGES_PROJECT_ID }}",
    });
    expect(control.run).toContain("bootstrap_required=1");
    expect(control.run).toContain("validate_identity");
    expect(control.run).toContain("validate_locked");
    expect(control.run).toContain("minimize_project");
    expect(control.run).toContain(
      "Set CLOUDFLARE_PAGES_PROJECT_ID and CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
    );
    expect(upload.if).toContain("always()");
    expect(upload.with.path).toContain(
      "cloudflare-pages-posture-evidence",
    );
    expect(JSON.stringify(collect)).not.toContain("CLOUDFLARE_");
    expect(JSON.stringify(collect.steps.slice(0, 4))).not.toMatch(
      /SUPABASE|SENTRY|GH_TOKEN|GITHUB_TOKEN|secrets\./,
    );
  });

  it("keeps the mutation workflow manual, main-only, isolated, and pinned", () => {
    const parsed = parsedWorkflow("lock-cloudflare-pages-git-deploys.yml");
    const source = workflow("lock-cloudflare-pages-git-deploys.yml");
    const preflight = parsed.jobs["verify-lock-environment"];
    const lock = parsed.jobs.lock;
    const control = lock.steps.find(
      (step) => step.name === "Lock both Cloudflare Pages Git integrations",
    );

    expect(parsed.on).toEqual({
      workflow_dispatch: {
        inputs: expect.any(Object),
      },
    });
    expect(parsed.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(preflight.if).toContain("github.ref == 'refs/heads/main'");
    expect(source).toContain('.branch_policies[0].name == "main"');
    expect(source).toContain('.branch_policies[0].type == "branch"');
    expect(lock.if).toContain("github.ref == 'refs/heads/main'");
    expect(lock.if).toContain("DISABLE_CLOUDFLARE_GIT_DEPLOYS");
    expect(lock.environment).toBe("cloudflare-git-deploy-lock");
    expect(lock.concurrency["cancel-in-progress"]).toBe(false);
    expect(
      lock.steps.some(
        (step) => step.uses?.includes("checkout") || /npm\s/.test(step.run ?? ""),
      ),
    ).toBe(false);
    expect(control.env.EXPECTED_PRODUCTION_PROJECT_ID).toBe(
      "${{ vars.CLOUDFLARE_PAGES_PROJECT_ID }}",
    );
    expect(control.env.EXPECTED_STAGING_PROJECT_ID).toBe(
      "${{ vars.CLOUDFLARE_STAGING_PAGES_PROJECT_ID }}",
    );
    expect(control.run.indexOf("EXPECTED_PRODUCTION_PROJECT_ID")).toBeLessThan(
      control.run.indexOf("patch_project"),
    );
    expect(control.run).toContain('PRODUCTION_PROJECT="maiprop-listing-site"');
    expect(control.run).toContain(
      'STAGING_PROJECT="maiprop-listing-site-staging"',
    );
    expect(control.run).toContain('"deployments_enabled": false');
    expect(control.run).toContain('"production_deployments_enabled": false');
    expect(control.run).toContain('"preview_deployment_setting": "none"');
  });

  it("proves current main before credentials and immediately before every PATCH", () => {
    const parsed = parsedWorkflow("lock-cloudflare-pages-git-deploys.yml");
    const preflight = parsed.jobs["verify-lock-environment"];
    const lock = parsed.jobs.lock;
    const identity = preflight.steps[0];
    const environmentPolicy = preflight.steps[1];
    const control = lock.steps.find(
      (step) => step.name === "Lock both Cloudflare Pages Git integrations",
    );

    expect(lock.needs).toBe("verify-lock-environment");
    expect(identity.name).toBe("Verify current main workflow identity");
    expect(identity.env).toEqual({ GH_TOKEN: "${{ github.token }}" });
    expect(identity.run).toContain(
      'CURRENT_MAIN="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    );
    expect(identity.run).toContain(
      'if [ "$CURRENT_MAIN" != "$GITHUB_WORKFLOW_SHA" ]; then',
    );
    expect(JSON.stringify(identity)).not.toContain("CLOUDFLARE_");
    expect(environmentPolicy.name).toBe("Verify main-only lock namespace");

    expect(control.env.GH_TOKEN).toBe("${{ github.token }}");
    const patchFunction = control.run.slice(
      control.run.indexOf("patch_project()"),
      control.run.indexOf("PRODUCTION_PRE="),
    );
    expect(patchFunction).toContain(
      'CURRENT_MAIN="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    );
    expect(patchFunction.indexOf('CURRENT_MAIN="$(gh api')).toBeLessThan(
      patchFunction.indexOf("--request PATCH"),
    );
    expect(patchFunction).toContain(
      'if [ "$CURRENT_MAIN" != "$GITHUB_WORKFLOW_SHA" ]; then',
    );
    expect(
      control.run.match(/if ! patch_project \\/g),
    ).toHaveLength(2);
    expect(lock.steps.some((step) => step.uses?.includes("checkout"))).toBe(
      false,
    );
    expect(lock.steps.some((step) => /npm\s/.test(step.run ?? ""))).toBe(
      false,
    );
  });

  it("documents the bootstrap token and pinned project ID contracts", () => {
    const envSetup = readFileSync(resolve(root, "docs", "ENV_SETUP.md"), "utf8");
    const rotation = readFileSync(
      resolve(root, "docs", "SECRETS_ROTATION.md"),
      "utf8",
    );

    for (const name of [
      "CLOUDFLARE_PAGES_READ_TOKEN",
      "CLOUDFLARE_PAGES_EDIT_TOKEN",
      "CLOUDFLARE_PAGES_PROJECT_ID",
      "CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
    ]) {
      expect(`${envSetup}\n${rotation}`).toContain(name);
    }
  });
});
