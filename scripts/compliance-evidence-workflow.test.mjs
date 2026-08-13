import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/compliance-evidence.yml"), "utf8");
const parsed = yaml.load(workflow);

const step = (name, nextName) => {
  const start = workflow.indexOf(`      - name: ${name}`);
  const end = nextName ? workflow.indexOf(`      - name: ${nextName}`, start + 1) : workflow.length;
  return workflow.slice(start, end);
};

describe("standards evidence workflow", () => {
  it("captures each provider independently before the strict rollup", () => {
    expect(step("Capture Supabase live security evidence", "Capture Sentry live telemetry status")).toContain(
      "continue-on-error: true",
    );
    expect(step("Capture Sentry live telemetry status", "Materialize minimized Cloudflare Pages posture evidence")).toContain(
      "continue-on-error: true",
    );
    expect(step("Materialize minimized Cloudflare Pages posture evidence", "Check ECAS live evidence rollup")).toContain(
      "continue-on-error: true",
    );
    expect(step("Check ECAS live evidence rollup", "Upload standards evidence")).toContain("if: always()");
    expect(step("Upload standards evidence", null)).toContain("if: always()");
  });

  it("keeps Cloudflare credentials in the isolated main-only control job", () => {
    expect(workflow).toContain("cloudflare-pages-verify:");
    expect(workflow).toContain("github.ref == 'refs/heads/main'");
    expect(workflow).toContain(
      "group: maiprop-cloudflare-pages-git-deploy-verify",
    );
    expect(workflow).toContain(
      "CLOUDFLARE_PAGES_READ_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    expect(workflow).toContain(
      "CLOUDFLARE_STAGING_PAGES_READ_TOKEN: ${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
    );
    expect(workflow).toContain(
      "CLOUDFLARE_STAGING_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
    );
    expect(workflow).not.toContain(
      "secrets.CLOUDFLARE_PAGES_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN",
    );
    expect(workflow).toContain(
      '[ "$CLOUDFLARE_ACCOUNT_ID" = "$CLOUDFLARE_STAGING_ACCOUNT_ID" ]',
    );
    expect(workflow).toContain("bootstrap_required");
    expect(workflow).toContain(
      "Set CLOUDFLARE_PAGES_PROJECT_ID and CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
    );
    expect(workflow).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(workflow).not.toMatch(
      /(?:--request|-X)\s*(?:POST|PUT|PATCH|DELETE)\b/i,
    );

    const collectStart = workflow.indexOf("  collect:");
    const collectJob = workflow.slice(collectStart);
    expect(collectJob).not.toMatch(/^\s{4}env:\s*$/m);
    expect(collectJob).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(collectJob).not.toContain("CLOUDFLARE_PAGES_READ_TOKEN");
    expect(collectJob).not.toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(collectJob).not.toContain("CLOUDFLARE_STAGING_ACCOUNT_ID");
    expect(step("Install dependencies", "Run local standards gates")).not.toContain(
      "secrets.",
    );
    expect(step("Run local standards gates", "Capture GitHub governance evidence")).not.toContain(
      "secrets.",
    );
    expect(step("Capture GitHub governance evidence", "Capture Supabase live security evidence")).toContain(
      "GH_TOKEN: ${{ github.token }}",
    );
    expect(step("Capture Supabase live security evidence", "Capture Sentry live telemetry status")).toContain(
      "SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    );
    expect(step("Capture Sentry live telemetry status", "Materialize minimized Cloudflare Pages posture evidence")).toContain(
      "SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}",
    );
  });

  it("passes only minimized Cloudflare evidence through explicit job outputs", () => {
    const verifyCloudflare = parsed.jobs["cloudflare-pages-verify"];
    const collect = parsed.jobs.collect;
    const control = verifyCloudflare.steps.find(
      (item) => item.name === "Verify Cloudflare Pages Git deployment lockout",
    );
    const materialize = collect.steps.find(
      (item) => item.name === "Materialize minimized Cloudflare Pages posture evidence",
    );

    expect(workflow).not.toContain("actions/download-artifact");
    expect(verifyCloudflare.outputs).toEqual({
      cloudflare_pages_post_state_json:
        "${{ steps.cloudflare_verify.outputs.cloudflare_pages_post_state_json }}",
      cloudflare_pages_posture_json:
        "${{ steps.cloudflare_verify.outputs.cloudflare_pages_posture_json }}",
      cloudflare_admin_posture_json:
        "${{ steps.cloudflare_verify.outputs.cloudflare_admin_posture_json }}",
    });
    expect(control.run).toContain(
      'cloudflare_pages_post_state_json=$(jq -c . "$EVIDENCE_DIR/cloudflare-pages-git-auto-deploy-post-state.json")',
    );
    expect(control.run).toContain(
      'cloudflare_pages_posture_json=$(jq -c . "$EVIDENCE_DIR/cloudflare-pages-git-auto-deploy-posture.json")',
    );
    expect(control.run).toContain(
      'cloudflare_admin_posture_json=$(jq -c . "$EVIDENCE_DIR/cloudflare-admin-posture.json")',
    );
    expect(materialize.if).toContain("always()");
    expect(materialize["continue-on-error"]).toBe(true);
    expect(materialize.env).toEqual({
      CLOUDFLARE_PAGES_POST_STATE_JSON:
        "${{ needs.cloudflare-pages-verify.outputs.cloudflare_pages_post_state_json }}",
      CLOUDFLARE_PAGES_POSTURE_JSON:
        "${{ needs.cloudflare-pages-verify.outputs.cloudflare_pages_posture_json }}",
      CLOUDFLARE_ADMIN_POSTURE_JSON:
        "${{ needs.cloudflare-pages-verify.outputs.cloudflare_admin_posture_json }}",
    });
    expect(materialize.run).toContain(
      "compliance-evidence/cloudflare-pages-git-auto-deploy-post-state.json",
    );
    expect(materialize.run).toContain(
      "compliance-evidence/cloudflare-pages-git-auto-deploy-posture.json",
    );
    expect(materialize.run).toContain(
      "compliance-evidence/cloudflare-admin-posture.json",
    );
    expect(JSON.stringify(materialize)).not.toContain("secrets.");
  });

  it("never exposes provider secrets or candidate code on a non-main dispatch", () => {
    expect(workflow).toContain("verify-current-main:");
    expect(workflow).toContain(
      "CURRENT_MAIN=\"$(gh api \"repos/${GITHUB_REPOSITORY}/branches/main\" --jq '.commit.sha')\"",
    );
    expect(workflow).toContain(
      'if [ "$CURRENT_MAIN" != "$GITHUB_WORKFLOW_SHA" ]; then',
    );

    const collectStart = workflow.indexOf("  collect:");
    const collectJob = workflow.slice(collectStart);
    expect(collectJob).toContain(
      "github.ref == 'refs/heads/main'",
    );
    expect(collectJob).toContain(
      "needs.verify-current-main.result == 'success'",
    );
    expect(collectJob).toContain(
      "ref: ${{ needs.verify-current-main.outputs.main_sha }}",
    );
    expect(collectJob).toContain("persist-credentials: false");
  });

  it("keeps the Pages read token out of unrelated DNS posture collection", () => {
    expect(workflow).not.toContain("CLOUDFLARE_DNS_MODE");
    expect(workflow).not.toContain("CLOUDFLARE_ZONE_NAME");
  });
});
