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

  it("requires sensitive Cloudflare bootstrap PRs to squash with the skip marker", () => {
    const ci = parsedWorkflow("ci.yml");
    const step = ci.jobs.quality.steps.find(
      (candidate) =>
        candidate.name === "Enforce Cloudflare bootstrap squash marker",
    );

    expect(step.if).toContain("github.event_name == 'pull_request'");
    expect(step.env.PR_TITLE).toBe("${{ github.event.pull_request.title }}");
    expect(step.env.GH_TOKEN).toBe("${{ github.token }}");
    expect(step.run).toContain("squash_merge_commit_title");
    expect(step.run).toContain('== "PR_TITLE"');
    expect(step.run).toContain("[CF-Pages-Skip]");
    expect(step.run).toContain("compliance-evidence.yml");
    expect(step.run).toContain("lock-cloudflare-pages-git-deploys.yml");
    expect(step.run).toContain("reusable-cloudflare-production-deploy.yml");
    expect(step.run).toContain("stage-release.yml");
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
        "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
      CLOUDFLARE_ACCOUNT_ID: "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
      CLOUDFLARE_STAGING_PAGES_READ_TOKEN:
        "${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
      CLOUDFLARE_STAGING_ACCOUNT_ID:
        "${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
      EXPECTED_PRODUCTION_PROJECT_ID:
        "${{ vars.CLOUDFLARE_PAGES_PROJECT_ID }}",
      EXPECTED_STAGING_PROJECT_ID:
        "${{ vars.CLOUDFLARE_STAGING_PAGES_PROJECT_ID }}",
    });
    expect(verifyCloudflare.environment).toBeUndefined();
    expect(control.run).toContain(
      '[ "$CLOUDFLARE_ACCOUNT_ID" = "$CLOUDFLARE_STAGING_ACCOUNT_ID" ]',
    );
    expect(control.run).toContain(
      '[ "$CLOUDFLARE_PAGES_READ_TOKEN" = "$CLOUDFLARE_STAGING_PAGES_READ_TOKEN" ]',
    );
    expect(control.run).toContain(
      'get_project "$CLOUDFLARE_PAGES_READ_TOKEN" "$CLOUDFLARE_ACCOUNT_ID" "$PRODUCTION_PROJECT" "$PRODUCTION_RAW"',
    );
    expect(control.run).toContain(
      'get_project "$CLOUDFLARE_STAGING_PAGES_READ_TOKEN" "$CLOUDFLARE_STAGING_ACCOUNT_ID" "$STAGING_PROJECT" "$STAGING_RAW"',
    );
    expect(control.run).toContain(
      '.result.source == null or',
    );
    expect(control.run).toContain(
      'if .result.source == null then null else',
    );
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
    expect(JSON.stringify(collect)).not.toMatch(
      /CLOUDFLARE_(?:PAGES_)?(?:READ|EDIT|API)_TOKEN|CLOUDFLARE_ACCOUNT_ID/,
    );
    expect(JSON.stringify(collect.steps.slice(0, 4))).not.toMatch(
      /SUPABASE|SENTRY|GH_TOKEN|GITHUB_TOKEN|secrets\./,
    );
  });

  it("hands minimized posture to collect without a downloaded artifact", () => {
    const parsed = parsedWorkflow("compliance-evidence.yml");
    const source = workflow("compliance-evidence.yml");
    const verifyCloudflare = parsed.jobs["cloudflare-pages-verify"];
    const collect = parsed.jobs.collect;
    const materialize = collect.steps.find(
      (step) =>
        step.name === "Materialize minimized Cloudflare Pages posture evidence",
    );

    expect(source).not.toContain("actions/download-artifact");
    expect(verifyCloudflare.outputs).toEqual({
      cloudflare_pages_post_state_json:
        "${{ steps.cloudflare_verify.outputs.cloudflare_pages_post_state_json }}",
      cloudflare_pages_posture_json:
        "${{ steps.cloudflare_verify.outputs.cloudflare_pages_posture_json }}",
      cloudflare_admin_posture_json:
        "${{ steps.cloudflare_verify.outputs.cloudflare_admin_posture_json }}",
    });
    expect(materialize.env.CLOUDFLARE_PAGES_POST_STATE_JSON).toBe(
      "${{ needs.cloudflare-pages-verify.outputs.cloudflare_pages_post_state_json }}",
    );
    expect(materialize.env.CLOUDFLARE_PAGES_POSTURE_JSON).toBe(
      "${{ needs.cloudflare-pages-verify.outputs.cloudflare_pages_posture_json }}",
    );
    expect(materialize.env.CLOUDFLARE_ADMIN_POSTURE_JSON).toBe(
      "${{ needs.cloudflare-pages-verify.outputs.cloudflare_admin_posture_json }}",
    );
    expect(materialize.run).toContain("jq -e '.'");
    expect(JSON.stringify(materialize)).not.toMatch(
      /CLOUDFLARE_(?:PAGES_)?(?:READ|EDIT|API)_TOKEN|secrets\./,
    );
  });

  it("keeps the mutation workflow manual, main-only, isolated, and pinned", () => {
    const parsed = parsedWorkflow("lock-cloudflare-pages-git-deploys.yml");
    const source = workflow("lock-cloudflare-pages-git-deploys.yml");
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
    expect(parsed.jobs["verify-lock-environment"]).toBeUndefined();
    expect(lock.if).toContain("github.ref == 'refs/heads/main'");
    expect(lock.if).toContain("DISABLE_CLOUDFLARE_GIT_DEPLOYS");
    expect(lock.environment).toBeUndefined();
    expect(lock.if).toContain("github.run_attempt == 1");
    expect(lock.if).toContain("github.actor == github.triggering_actor");
    expect(source).toContain("PRODUCTION_RELEASE_APPROVERS");
    expect(source).toContain("GITHUB_WORKFLOW_SHA");
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
    expect(control.env.CLOUDFLARE_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    expect(control.env.CLOUDFLARE_PAGES_EDIT_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_EDIT_TOKEN }}",
    );
    expect(control.env.CLOUDFLARE_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    );
    expect(control.env.CLOUDFLARE_STAGING_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
    );
    expect(control.env.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN }}",
    );
    expect(control.env.CLOUDFLARE_STAGING_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
    );
    expect(control.run).toContain(
      '[ "$CLOUDFLARE_ACCOUNT_ID" = "$CLOUDFLARE_STAGING_ACCOUNT_ID" ]',
    );
    expect(control.run).toContain(
      '[ "$CLOUDFLARE_PAGES_READ_TOKEN" = "$CLOUDFLARE_STAGING_PAGES_READ_TOKEN" ]',
    );
    expect(control.run).toContain(
      '[ "$CLOUDFLARE_PAGES_EDIT_TOKEN" = "$CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN" ]',
    );
    expect(control.run).toContain(
      'CLOUDFLARE_PAGES_READ_TOKEN="$CLOUDFLARE_STAGING_PAGES_READ_TOKEN"',
    );
    expect(control.run).toContain(
      'CLOUDFLARE_PAGES_EDIT_TOKEN="$CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN"',
    );
    expect(control.run).toContain(
      'CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_STAGING_ACCOUNT_ID"',
    );
    expect(control.run).toContain(
      'if [ -z "$source_type" ]; then',
    );
    expect(control.run).toContain(
      '.result.source == null or',
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
    const lock = parsed.jobs.lock;
    const identity = lock.steps[0];
    const control = lock.steps.find(
      (step) => step.name === "Lock both Cloudflare Pages Git integrations",
    );

    expect(lock.needs).toBeUndefined();
    expect(identity.name).toBe("Verify exact current-main control identity");
    expect(identity.env.GH_TOKEN).toBe("${{ github.token }}");
    expect(identity.env.ALLOWED_ACTORS).toBe(
      "${{ vars.PRODUCTION_RELEASE_APPROVERS }}",
    );
    expect(identity.run).toContain(
      'current_main="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    );
    expect(identity.run).toContain(
      '[ "$current_main" != "$GITHUB_WORKFLOW_SHA" ]',
    );
    expect(JSON.stringify(identity)).not.toContain("CLOUDFLARE_");

    expect(control.env.GH_TOKEN).toBe("${{ github.token }}");
    const patchFunction = control.run.slice(
      control.run.indexOf("patch_project()"),
      control.run.indexOf("PRODUCTION_PRE="),
    );
    expect(patchFunction).toContain(
      'current_main="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    );
    expect(patchFunction.indexOf('current_main="$(gh api')).toBeLessThan(
      patchFunction.indexOf("--request PATCH"),
    );
    expect(patchFunction).toContain(
      'if [ "$current_main" != "$GITHUB_WORKFLOW_SHA" ]; then',
    );
    expect(
      control.run.match(/^\s*(?:if ! )?patch_project \\/gm),
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
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_STAGING_ACCOUNT_ID",
      "CLOUDFLARE_PAGES_READ_TOKEN",
      "CLOUDFLARE_PAGES_EDIT_TOKEN",
      "CLOUDFLARE_STAGING_PAGES_READ_TOKEN",
      "CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN",
      "CLOUDFLARE_PAGES_PROJECT_ID",
      "CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
    ]) {
      expect(`${envSetup}\n${rotation}`).toContain(name);
    }

    const pagesSetup = readFileSync(
      resolve(root, "docs", "CLOUDFLARE_PAGES_SETUP.md"),
      "utf8",
    );
    expect(pagesSetup).toContain("private GitHub Free repository");
    expect(pagesSetup).toContain("repository-scoped secrets");
    expect(pagesSetup).not.toContain("Store in the protected `production` environment");
    expect(pagesSetup).not.toContain("Store in the `staging` environment");
  });
});
