import { describe, expect, it } from "vitest";

import {
  validateGitHubArtifactBinding,
  validateGitHubArtifactMetadata,
} from "./github-artifact-metadata.mjs";

const SHA = "a".repeat(40);
const DIGEST = "b".repeat(64);
const binding = {
  name: `supabase-staging-edge-attestation-${SHA}-17-2`,
  id: "12345",
  digest: DIGEST,
  run_id: "17",
  run_attempt: "2",
  release_sha: SHA,
};
const artifact = {
  id: 12345,
  name: binding.name,
  expired: false,
  digest: `sha256:${DIGEST}`,
  workflow_run: { id: 17, head_sha: SHA },
};
const producerRun = {
  id: 17,
  run_attempt: 2,
  head_sha: SHA,
  head_branch: "main",
  path: ".github/workflows/stage-release.yml",
  event: "workflow_run",
  status: "completed",
  conclusion: "success",
  actor: { login: "release-operator" },
  triggering_actor: { login: "release-operator" },
  repository: { full_name: "maiprop/maiprop-listing-site" },
};

describe("GitHub artifact metadata binding", () => {
  it("accepts only the exact signed artifact and producer run", () => {
    expect(
      validateGitHubArtifactBinding({ binding, artifact, producerRun }),
    ).toEqual({ artifactId: "12345", artifactDigest: DIGEST });
  });

  it.each([
    ["artifact ID", { artifact: { ...artifact, id: 999 } }],
    ["artifact name", { artifact: { ...artifact, name: "other" } }],
    ["expired artifact", { artifact: { ...artifact, expired: true } }],
    ["artifact digest", { artifact: { ...artifact, digest: `sha256:${"c".repeat(64)}` } }],
    ["artifact workflow run", { artifact: { ...artifact, workflow_run: { id: 18, head_sha: SHA } } }],
    ["artifact head SHA", { artifact: { ...artifact, workflow_run: { id: 17, head_sha: "c".repeat(40) } } }],
    ["producer run ID", { producerRun: { ...producerRun, id: 18 } }],
    ["producer run attempt", { producerRun: { ...producerRun, run_attempt: 3 } }],
    ["producer head SHA", { producerRun: { ...producerRun, head_sha: "c".repeat(40) } }],
    ["producer workflow path", { producerRun: { ...producerRun, path: ".github/workflows/ci.yml" } }],
    ["producer conclusion", { producerRun: { ...producerRun, conclusion: "failure" } }],
  ])("rejects a mismatched %s", (_label, overrides) => {
    expect(() =>
      validateGitHubArtifactBinding({
        binding,
        artifact,
        producerRun,
        ...overrides,
      })
    ).toThrow(/GitHub artifact metadata/i);
  });
});

describe("generic GitHub artifact metadata", () => {
  const expected = {
    artifactName: binding.name,
    runId: "17",
    runAttempt: "2",
    releaseSha: SHA,
    repository: "maiprop/maiprop-listing-site",
    workflowPath: ".github/workflows/stage-release.yml",
    event: "workflow_run",
    branch: "main",
    actor: "release-operator",
  };

  it("binds immutable artifact metadata to the exact successful producer", () => {
    expect(validateGitHubArtifactMetadata({
      artifact,
      producerRun,
      ...expected,
    })).toEqual({
      artifactId: "12345",
      artifactDigest: DIGEST,
    });
  });

  it.each([
    ["repository", { producerRun: { ...producerRun, repository: { full_name: "other/repo" } } }],
    ["workflow event", { producerRun: { ...producerRun, event: "push" } }],
    ["branch", { producerRun: { ...producerRun, head_branch: "feature" } }],
    ["actor", { producerRun: { ...producerRun, actor: { login: "other" } } }],
    ["triggering actor", { producerRun: { ...producerRun, triggering_actor: { login: "other" } } }],
    ["status", { producerRun: { ...producerRun, status: "in_progress" } }],
  ])("rejects a mismatched %s", (_label, overrides) => {
    expect(() => validateGitHubArtifactMetadata({
      artifact,
      producerRun,
      ...expected,
      ...overrides,
    })).toThrow(/GitHub artifact metadata/i);
  });
});
