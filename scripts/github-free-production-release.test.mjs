import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const directNodeTest =
  typeof globalThis.describe === "function" && typeof globalThis.it === "function"
    ? null
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const describe = directNodeTest ? directNodeTest.describe.skip : globalThis.describe;
const it = directNodeTest ? directNodeTest.it : globalThis.it;
const expect = globalThis.expect;

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

it("binds the production-deploy receipt before every coordinated mutation", () => {
  assert.match(productionRelease, /consume-break-glass-authorization:/);
  assert.match(productionRelease, /overwrite: false/);
  assert.match(productionRelease, /retention-days: 7/);
  assert.match(productionRelease, /create-release-artifact-binding\.mjs/);
  assert.match(productionRelease, /verify-release-artifact-binding\.mjs/);
  assert.match(productionRelease, /consumption_binding_artifact_id/);
  for (const source of [productionRelease, reusableCloudflare]) {
    assert.match(source, /authorization_sha256/);
    assert.match(source, /consumption_sha256/);
  }
});

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
