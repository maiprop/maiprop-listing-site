import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ciWorkflow = readFileSync(join(process.cwd(), ".github", "workflows", "ci.yml"), "utf8");
const stagingWorkflow = readFileSync(
  join(process.cwd(), ".github", "workflows", "stage-release.yml"),
  "utf8",
);
const postureValidator = readFileSync(
  join(
    process.cwd(),
    "scripts",
    "validate-cloudflare-pages-staging-posture.mjs",
  ),
  "utf8",
);
const wranglerConfig = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");

describe("Cloudflare Pages preview env parity", () => {
  it("keeps CI validation-only and verifies dedicated staging runtime bindings before staging", () => {
    expect(ciWorkflow).toContain("uses: ./.github/workflows/reusable-release-safety.yml");
    expect(ciWorkflow).not.toContain("pages deploy");
    expect(stagingWorkflow).toContain("Verify pre-provisioned dedicated Pages project");
    expect(stagingWorkflow).toContain("Dedicated staging and production Pages project variables must be configured and different.");
    expect(stagingWorkflow).toContain("STAGING_APP_URL must be a dedicated HTTPS staging origin without a path.");
    expect(stagingWorkflow).toContain(
      "validate-cloudflare-pages-staging-posture.mjs",
    );
    expect(stagingWorkflow).toContain("cloudflare-production-project.json");
    expect(stagingWorkflow).toContain("cloudflare-pages-git-auto-deploy-posture.json");
    expect(postureValidator).toContain("productionDeploymentsEnabled");
    expect(postureValidator).toContain("previewDeploymentSetting");
    expect(postureValidator).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(postureValidator).toContain("VITE_APP_URL: stagingAppUrl");
    expect(postureValidator).toContain(
      "Both staging and production Pages projects must have Git automatic deployments disabled.",
    );
    expect(postureValidator).toContain(
      "Staging Pages bindings must not contain production-valued catalogue or origin variables.",
    );
   });

  it("deploys only the verified exact artifact to the dedicated staging project", () => {
    expect(stagingWorkflow).toContain("Verify immutable candidate again");
    expect(stagingWorkflow).toContain("EXPECTED_MANIFEST_SHA256");
    expect(stagingWorkflow).toContain("Assert dedicated staging Pages mutation target");
     expect(stagingWorkflow).toContain("MUTATE_STAGING_xsiehskfgeoqyazcgauv");
     expect(stagingWorkflow).toContain("Deploy exact artifact to dedicated staging project");
     expect(stagingWorkflow).toContain(
       "Prepare isolated Wrangler deployment directory",
     );
     expect(stagingWorkflow).toContain(
       'isolated_directory="$RUNNER_TEMP/maiprop-pages-deploy-',
     );
     expect(stagingWorkflow).toContain(
       'workspace_real="$(realpath "$GITHUB_WORKSPACE")"',
     );
     expect(stagingWorkflow).toContain(
       'for config_name in wrangler.toml wrangler.json wrangler.jsonc',
     );
     expect(stagingWorkflow).toContain(
       "production-release-artifact.mjs verify",
     );
     expect(stagingWorkflow).toContain(
       "workingDirectory: ${{ steps.isolated-pages-deploy.outputs.directory }}",
     );
     expect(stagingWorkflow).not.toContain(
       "workingDirectory: release-candidate",
     );
     expect(stagingWorkflow).toContain('wranglerVersion: "4.86.0"');
     expect(stagingWorkflow).toContain("pages deploy dist");
     expect(stagingWorkflow).toContain("--commit-hash=${{ needs.validate-source.outputs.release_sha }}");
     expect(stagingWorkflow).toContain("--commit-dirty=false");
     expect(postureValidator).toContain('VITE_APP_ENVIRONMENT: "staging"');
     expect(postureValidator).toContain("VITE_STRIPE_PUBLISHABLE_KEY");
     expect(postureValidator).toContain("VITE_STRIPE_RUNTIME_MODE");
     expect(postureValidator).toContain("VITE_BILLING_MODE");
     expect(postureValidator).toContain(
       "VITE_STRIPE_PRICE_PARTICIPANT_MONTHLY",
     );
     expect(stagingWorkflow).not.toContain("pages deploy release-candidate/dist");
     expect(stagingWorkflow).not.toContain("deployment_configs: { preview:");
   });

   it("keeps source-controlled Wrangler config staging-safe and non-secret", () => {
     expect(wranglerConfig).toContain('name = "maiprop-listing-site"');
     expect(wranglerConfig).toContain('pages_build_output_dir = "./dist"');
     expect(wranglerConfig).toContain('compatibility_date = "2026-05-19"');
     expect(wranglerConfig).not.toContain("[vars]");
     expect(wranglerConfig).not.toContain("portal.maiprop.co");
     expect(wranglerConfig).not.toMatch(/\bVITE_[A-Z0-9_]+\s*=/);
     expect(wranglerConfig).not.toMatch(/SUPABASE_(?:PUBLISHABLE_KEY|ANON_KEY|SERVICE_ROLE_KEY)\s*=/);
     expect(wranglerConfig).not.toContain("SITE_LOCK_PASSWORD");
   });
});
