import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");

describe("Cloudflare Pages preview env parity", () => {
  it("syncs and verifies Preview runtime env vars before deploying PR previews", () => {
    expect(ciWorkflow).toContain("name: Sync Cloudflare Pages preview runtime environment variables");
    expect(ciWorkflow).toContain("deployment_configs: { preview: { env_vars: $env } }");
    expect(ciWorkflow).toContain(".result.deployment_configs.preview.env_vars[$key].type == \"plain_text\"");
    expect(ciWorkflow).toContain(
      ".result.deployment_configs.preview.env_vars.SUPABASE_PROJECT_ID.value == $pid",
    );
    expect(ciWorkflow).toMatch(/name = "maiprop-listing-site"[\s\S]*\[vars\][\s\S]*SUPABASE_PROJECT_ID/);
  });

  it("builds preview bundles with staging origin and staging Supabase only", () => {
    expect(ciWorkflow).toContain("VITE_APP_URL:                  ${{ secrets.STAGING_APP_URL }}");
    expect(ciWorkflow).toContain("STAGING_APP_URL:               ${{ secrets.STAGING_APP_URL }}");
    expect(ciWorkflow).toContain("STAGING_SUPABASE_URL:          ${{ secrets.STAGING_SUPABASE_URL }}");
    expect(ciWorkflow).toContain("STAGING_SUPABASE_PROJECT_ID:   ${{ secrets.STAGING_SUPABASE_PROJECT_ID }}");
    expect(ciWorkflow).toContain("STAGING_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.STAGING_SUPABASE_PUBLISHABLE_KEY }}");
    expect(ciWorkflow).not.toContain("VITE_APP_URL:                  ${{ secrets.VITE_APP_URL }}");
  });
});
