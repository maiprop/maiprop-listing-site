import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = (name) => readFileSync(
  resolve(import.meta.dirname, "..", ".github", "workflows", name),
  "utf8",
);

const productionRelease = workflow("deploy-production-release.yml");
const directCloudflare = workflow("direct-cloudflare-production-deploy.yml");
const reusableCloudflare = workflow("reusable-cloudflare-production-deploy.yml");
const productionWorkflows = [
  productionRelease,
  directCloudflare,
  reusableCloudflare,
];

describe("GitHub Free production release controls", () => {
  it("does not claim unavailable private-repository environments or attestations", () => {
    for (const source of productionWorkflows) {
      expect(source).not.toMatch(/^\s*environment:\s*production\s*$/m);
      expect(source).not.toContain("artifact-metadata:");
      expect(source).not.toContain("attestations:");
      expect(source).not.toContain("id-token:");
      expect(source).not.toContain("actions/attest-build-provenance@");
      expect(source).not.toContain("gh attestation verify");
    }
  });

  it("uses repository-secret HMAC bindings for every production artifact boundary", () => {
    for (const source of productionWorkflows) {
      expect(source).toContain("RELEASE_EVIDENCE_SIGNING_KEY");
      expect(source).toContain("RELEASE_EVIDENCE_SIGNING_KEY_ID");
      expect(source).toContain("verify-release-artifact-binding.mjs");
    }
    expect(productionRelease).toContain("create-release-artifact-binding.mjs");
    expect(directCloudflare).toContain("create-release-artifact-binding.mjs");
    expect(reusableCloudflare).toContain("create-release-artifact-binding.mjs");
  });

  it("requires independent allowlisted deployers and exact attempt-one actors", () => {
    for (const source of [productionRelease, directCloudflare]) {
      expect(source).toContain("PRODUCTION_RELEASE_DEPLOYERS");
      expect(source).toContain("github.run_attempt != 1");
      expect(source).toContain("github.actor != github.triggering_actor");
    }
    expect(reusableCloudflare).toContain("deploy_actor");
    expect(reusableCloudflare).toContain("allowed_deployers");
  });
});
