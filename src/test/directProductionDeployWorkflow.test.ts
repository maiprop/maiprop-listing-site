import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  join(
    process.cwd(),
    ".github",
    "workflows",
    "direct-cloudflare-production-deploy.yml",
  ),
  "utf8",
);

describe("manual Cloudflare production deploy workflow", () => {
  it("recovers the exact current main artifact with same-attempt backend proof", () => {
    expect(workflow).toContain("actions: read");
    expect(workflow).toContain("git fetch --no-tags origin main");
    expect(workflow).toContain("Recovery SHA must be the exact checked-out current main SHA.");
    expect(workflow).toContain("node scripts/production-release-validation.mjs github-recovery");
    expect(workflow).toContain('--sha "$RELEASE_SHA"');
    expect(workflow).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(workflow).toContain("backend_run_id");
    expect(workflow).toContain("backend_run_attempt");
    expect(workflow).toContain("backend_approval_run_id");
    expect(workflow).toContain("backend_approval_run_attempt");
    expect(workflow).toContain("stripe_readiness_run_id");
    expect(workflow).toContain("stripe_readiness_artifact_id");
    expect(workflow).toContain("database_binding_artifact");
    expect(workflow).toContain("edge_binding_artifact");
    expect(workflow).toContain("production-mutation-lease");
    expect(workflow).toContain("uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml");
    expect(workflow).toContain("Verify signed recovery prerequisites");
    expect(workflow).toContain("Create signed recovery mutation lease binding");
    expect(workflow).toContain("Create signed production recovery evidence binding");
    expect(workflow).toContain("scripts/create-release-artifact-binding.mjs");
    expect(workflow).toContain("scripts/verify-release-artifact-binding.mjs");
    expect(workflow).not.toContain("actions/attest-build-provenance@");
    expect(workflow).not.toContain("gh attestation verify");
    expect(workflow).not.toContain("artifact-metadata:");
    expect(workflow).not.toContain("attestations:");
    expect(workflow).not.toContain("id-token:");
    expect(workflow).not.toContain("secrets: inherit");
    expect(workflow).not.toMatch(/npm run build|vite build/);
  });
});
