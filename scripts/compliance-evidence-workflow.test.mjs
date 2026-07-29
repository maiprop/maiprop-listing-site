import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(resolve(process.cwd(), ".github/workflows/compliance-evidence.yml"), "utf8");

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
    expect(step("Capture Sentry live telemetry status", "Check ECAS live evidence rollup")).toContain(
      "continue-on-error: true",
    );
    expect(step("Download minimized Cloudflare Pages posture evidence", "Check ECAS live evidence rollup")).toContain(
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
      "CLOUDFLARE_PAGES_READ_TOKEN: ${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}",
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
    expect(collectJob).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(collectJob).not.toContain("CLOUDFLARE_PAGES_READ_TOKEN");
    expect(collectJob).not.toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  it("keeps the Pages read token out of unrelated DNS posture collection", () => {
    expect(workflow).not.toContain("CLOUDFLARE_DNS_MODE");
    expect(workflow).not.toContain("CLOUDFLARE_ZONE_NAME");
  });
});
