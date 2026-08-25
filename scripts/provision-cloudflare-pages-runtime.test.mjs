import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflowPath = resolve(
  root,
  ".github",
  "workflows",
  "provision-cloudflare-pages-runtime.yml",
);

function workflow() {
  return yaml.load(readFileSync(workflowPath, "utf8"));
}

describe("Cloudflare Pages runtime provisioning workflow", () => {
  it("is manual, exact-main, attempt-1, and approver-only", () => {
    const parsed = workflow();
    const provision = parsed.jobs.provision;
    const identity = provision.steps[0];

    expect(Object.keys(parsed.on)).toEqual(["workflow_dispatch"]);
    expect(parsed.on.workflow_dispatch.inputs.target).toMatchObject({
      required: true,
      type: "choice",
      options: ["staging", "production"],
    });
    expect(parsed.on.workflow_dispatch.inputs.release_sha).toMatchObject({
      required: true,
      type: "string",
    });
    expect(provision.if).toContain("github.ref == 'refs/heads/main'");
    expect(provision.if).toContain("github.run_attempt == 1");
    expect(provision.if).toContain("github.actor == github.triggering_actor");
    expect(provision.if).toContain("inputs.release_sha == github.workflow_sha");
    expect(provision.if).toContain("PROVISION_STAGING_PAGES_RUNTIME");
    expect(provision.if).toContain("PROVISION_PRODUCTION_PAGES_RUNTIME");
    expect(provision.if).toContain("vars.STAGING_RELEASE_ENABLED == 'true'");
    expect(provision.if).toContain("vars.PRODUCTION_RELEASE_ENABLED == 'true'");
    expect(identity.name).toBe("Verify exact current-main control identity");
    expect(identity.env.ALLOWED_ACTORS).toBe(
      "${{ vars.PRODUCTION_RELEASE_APPROVERS }}",
    );
    expect(identity.run).toContain(
      'current_main="$(gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\')"',
    );
    expect(JSON.stringify(identity)).not.toContain("CLOUDFLARE_");
    expect(JSON.stringify(identity)).not.toContain("SUPABASE_ACCESS_TOKEN");
  });

  it("patches only one immutable Pages project and verifies strict redacted post-state", () => {
    const parsed = workflow();
    const provision = parsed.jobs.provision;
    const isolation = parsed.jobs["verify-provider-credential-isolation"];
    const control = provision.steps.find(
      (step) => step.name === "Provision strict Cloudflare Pages runtime bindings",
    );
    const upload = provision.steps.find((step) =>
      String(step.uses ?? "").startsWith("actions/upload-artifact@"),
    );

    expect(control.env.CLOUDFLARE_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    expect(control.env.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN).toBe(
      undefined,
    );
    expect(control.env.CLOUDFLARE_PAGES_EDIT_TOKEN).toBeUndefined();
    expect(control.env.TARGET_EDIT_TOKEN).toContain(
      "inputs.target == 'staging'",
    );
    expect(control.env.TARGET_EDIT_TOKEN).toContain(
      "secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN",
    );
    expect(control.env.TARGET_EDIT_TOKEN).toContain(
      "secrets.CLOUDFLARE_PAGES_EDIT_TOKEN",
    );
    expect(control.env.PAGES_RUNTIME_TURN_KEY_ID).toContain(
      "inputs.target == 'staging'",
    );
    expect(control.env.PAGES_RUNTIME_TURN_API_TOKEN).toContain(
      "inputs.target == 'staging'",
    );
    expect(control.env.CLOUDFLARE_STAGING_TURN_KEY_ID).toBeUndefined();
    expect(control.env.CLOUDFLARE_STAGING_TURN_API_TOKEN).toBeUndefined();
    expect(control.env.CLOUDFLARE_TURN_KEY_ID).toBeUndefined();
    expect(control.env.CLOUDFLARE_TURN_API_TOKEN).toBeUndefined();
    expect(provision.needs).toBe("verify-provider-credential-isolation");
    expect(isolation.steps).toHaveLength(1);
    expect(isolation.steps[0].run).toContain(
      '[ "$CLOUDFLARE_STAGING_TURN_KEY_ID" = "$CLOUDFLARE_TURN_KEY_ID" ]',
    );
    expect(isolation.steps[0].run).toContain(
      '[ "$CLOUDFLARE_STAGING_TURN_API_TOKEN" = "$CLOUDFLARE_TURN_API_TOKEN" ]',
    );
    expect(control.run).toContain('PRODUCTION_PROJECT="maiprop-listing-site"');
    expect(control.run).toContain(
      'STAGING_PROJECT="maiprop-listing-site-staging"',
    );
    expect(control.run).toContain(
      "export PRODUCTION_PROJECT STAGING_PROJECT",
    );
    expect(control.run).toContain(
      "node scripts/build-cloudflare-pages-runtime-patch.mjs",
    );
    expect(control.run).toContain(
      "node scripts/validate-cloudflare-pages-staging-posture.mjs",
    );
    expect(control.run).toContain("?reveal=true");
    expect(control.run).toContain('echo "::add-mask::$service_role_key"');
    expect(control.run.match(/--request PATCH/g)).toHaveLength(1);
    const patchCommand = control.run.slice(
      control.run.indexOf("curl -fsS", control.run.indexOf("current_main=")),
      control.run.indexOf("runtime-patch-response.json") +
        "runtime-patch-response.json".length,
    );
    expect(patchCommand).toContain("--request PATCH");
    expect(patchCommand).not.toContain("--retry");
    const currentMainCheck = control.run.lastIndexOf(
      'current_main="$(gh api',
    );
    expect(currentMainCheck).toBeGreaterThanOrEqual(0);
    expect(currentMainCheck).toBeLessThan(control.run.indexOf("--request PATCH"));
    expect(control.run).toContain('trap \'rm -rf "$RAW_DIR"\' EXIT');
    expect(upload.with.path).toBe(
      "${{ runner.temp }}/cloudflare-pages-runtime-evidence/",
    );
    expect(upload.with.path).not.toContain("raw");
    expect(JSON.stringify(upload)).not.toMatch(
      /SUPABASE_SERVICE_ROLE_KEY|TURN_API_TOKEN|PAGES_EDIT_TOKEN/,
    );
  });
});
