import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createReleaseArtifactBinding,
  verifyReleaseArtifactBinding,
} from "./release-artifact-binding.mjs";

const RELEASE_SHA = "a".repeat(40);
const SOURCE_TREE = "b".repeat(40);
const ARTIFACT_DIGEST = "c".repeat(64);
const SIGNING_KEY = "release-evidence-test-key-".padEnd(64, "x");
const REPOSITORY = "maiprop/maiprop-listing-site";
const WORKFLOW_PATH = ".github/workflows/ci.yml";
const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;
const WORKFLOW_SHA = RELEASE_SHA;
const ISSUED_AT = new Date().toISOString();

let root;

function createPayload() {
  mkdirSync(join(root, "nested"), { recursive: true });
  writeFileSync(join(root, "release-manifest.json"), '{"ok":true}\n');
  writeFileSync(join(root, "nested", "report.json"), '{"count":2}\n');
}

function baseInput(overrides = {}) {
  return {
    payloadRoot: root,
    repository: REPOSITORY,
    releaseSha: RELEASE_SHA,
    sourceTree: SOURCE_TREE,
    workflowPath: WORKFLOW_PATH,
    workflowRef: WORKFLOW_REF,
    workflowSha: WORKFLOW_SHA,
    event: "push",
    runId: "77",
    runAttempt: "1",
    actor: "release-builder",
    triggeringActor: "release-builder",
    artifactId: "101",
    artifactName: `production-release-candidate-${RELEASE_SHA}-1`,
    artifactDigest: `sha256:${ARTIFACT_DIGEST}`,
    keyId: "release-key-2026-08",
    signingKey: SIGNING_KEY,
    issuedAt: ISSUED_AT,
    nonce: "d".repeat(64),
    ...overrides,
  };
}

function artifactMetadata(overrides = {}) {
  return {
    id: 101,
    name: `production-release-candidate-${RELEASE_SHA}-1`,
    expired: false,
    digest: `sha256:${ARTIFACT_DIGEST}`,
    workflow_run: {
      id: 77,
      head_sha: RELEASE_SHA,
      repository_id: 123,
      head_repository_id: 123,
    },
    ...overrides,
  };
}

function producerRun(overrides = {}) {
  return {
    id: 77,
    run_attempt: 1,
    head_sha: RELEASE_SHA,
    head_branch: "main",
    path: WORKFLOW_PATH,
    event: "push",
    status: "completed",
    conclusion: "success",
    actor: { login: "release-builder" },
    triggering_actor: { login: "release-builder" },
    repository: { full_name: REPOSITORY, id: 123 },
    head_repository: { full_name: REPOSITORY, id: 123 },
    ...overrides,
  };
}

function verify(binding, overrides = {}) {
  return verifyReleaseArtifactBinding({
    binding,
    payloadRoot: root,
    artifactMetadata: artifactMetadata(),
    producerRun: producerRun(),
    signingKey: SIGNING_KEY,
    expectedKeyId: "release-key-2026-08",
    expected: {
      repository: REPOSITORY,
      releaseSha: RELEASE_SHA,
      sourceTree: SOURCE_TREE,
      workflowPath: WORKFLOW_PATH,
      workflowRef: WORKFLOW_REF,
      workflowSha: WORKFLOW_SHA,
      event: "push",
      runId: "77",
      runAttempt: "1",
      actor: "release-builder",
      triggeringActor: "release-builder",
    },
    ...overrides,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "maiprop-release-binding-"));
  createPayload();
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("release artifact binding", () => {
  it("signs and verifies the exact payload and GitHub producer metadata", () => {
    const binding = createReleaseArtifactBinding(baseInput());

    expect(verify(binding)).toMatchObject({
      schema_version: 1,
      evidence_type: "maiprop-release-artifact-binding-verification",
      repository: REPOSITORY,
      releaseSha: RELEASE_SHA,
      sourceTree: SOURCE_TREE,
      workflowPath: WORKFLOW_PATH,
      workflowRef: WORKFLOW_REF,
      workflowSha: WORKFLOW_SHA,
      event: "push",
      artifactId: "101",
      artifactDigest: ARTIFACT_DIGEST,
      runId: "77",
      runAttempt: "1",
      actor: "release-builder",
      triggeringActor: "release-builder",
      keyId: "release-key-2026-08",
      files: [
        { path: "nested/report.json" },
        { path: "release-manifest.json" },
      ],
    });
  });

  it("rejects a tampered signature or signed field", () => {
    const binding = createReleaseArtifactBinding(baseInput());
    const badSignature = structuredClone(binding);
    badSignature.signature.value = "0".repeat(64);
    expect(() => verify(badSignature)).toThrow(/signature/i);

    const badRepository = structuredClone(binding);
    badRepository.repository = "other/repository";
    expect(() => verify(badRepository)).toThrow(/signature/i);
  });

  it("rejects a relabeled key ID even when the verifier expects the forged label", () => {
    const binding = createReleaseArtifactBinding(baseInput());
    const relabeled = structuredClone(binding);
    relabeled.signature.key_id = "release-key-forged";
    expect(() => verify(relabeled, {
      expectedKeyId: "release-key-forged",
    })).toThrow(/signature|digest/i);
  });

  it.each([
    ["artifact ID", artifactMetadata({ id: 999 }), producerRun()],
    [
      "artifact digest",
      artifactMetadata({ digest: `sha256:${"e".repeat(64)}` }),
      producerRun(),
    ],
    ["artifact expiry", artifactMetadata({ expired: true }), producerRun()],
    ["repository", artifactMetadata(), producerRun({ repository: { full_name: "other/repository", id: 123 } })],
    ["workflow path", artifactMetadata(), producerRun({ path: ".github/workflows/other.yml" })],
    ["workflow event", artifactMetadata(), producerRun({ event: "workflow_dispatch" })],
    ["release SHA", artifactMetadata(), producerRun({ head_sha: "e".repeat(40) })],
    ["rerun", artifactMetadata(), producerRun({ run_attempt: 2 })],
    [
      "actor mismatch",
      artifactMetadata(),
      producerRun({ triggering_actor: { login: "rerun-operator" } }),
    ],
  ])("rejects wrong GitHub %s metadata", (_label, artifact, run) => {
    const binding = createReleaseArtifactBinding(baseInput());
    expect(() => verify(binding, {
      artifactMetadata: artifact,
      producerRun: run,
    })).toThrow(/metadata|attempt|actor/i);
  });

  it("accepts only the signed branch when GitHub qualifies the workflow path", () => {
    const binding = createReleaseArtifactBinding(baseInput());

    expect(verify(binding, {
      producerRun: producerRun({ path: `${WORKFLOW_PATH}@main` }),
    })).toMatchObject({ workflowPath: WORKFLOW_PATH });
    expect(() => verify(binding, {
      producerRun: producerRun({ path: `${WORKFLOW_PATH}@other-branch` }),
    })).toThrow(/metadata|workflow path/i);
  });

  it("requires completed/success metadata by default", () => {
    const binding = createReleaseArtifactBinding(baseInput());
    expect(() => verify(binding, {
      producerRun: producerRun({ status: "in_progress", conclusion: null }),
    })).toThrow(/metadata|status|conclusion/i);
  });

  it("accepts only the trusted current original run in explicit same-run mode", () => {
    const binding = createReleaseArtifactBinding(baseInput());
    const currentRun = producerRun({ status: "in_progress", conclusion: null });
    const trustedCurrentRun = {
      runId: "77",
      runAttempt: "1",
      actor: "release-builder",
      triggeringActor: "release-builder",
    };

    expect(verify(binding, {
      producerRun: currentRun,
      verificationMode: "same-run",
      trustedCurrentRun,
    })).toMatchObject({ verificationMode: "same-run", runId: "77" });
    expect(verify(binding, {
      producerRun: producerRun({ status: "queued", conclusion: null }),
      verificationMode: "same-run",
      trustedCurrentRun,
    })).toMatchObject({ verificationMode: "same-run", runId: "77" });
    expect(() => verify(binding, {
      producerRun: producerRun({ status: "completed", conclusion: null }),
      verificationMode: "same-run",
      trustedCurrentRun,
    })).toThrow(/same-run|status|conclusion|metadata/i);
    expect(() => verify(binding, {
      producerRun: producerRun(),
      verificationMode: "same-run",
      trustedCurrentRun,
    })).toThrow(/same-run|status|conclusion|metadata/i);
    expect(() => verify(binding, {
      producerRun: currentRun,
      verificationMode: "same-run",
      trustedCurrentRun: { ...trustedCurrentRun, runId: "78" },
    })).toThrow(/same-run|trusted|metadata/i);
    expect(() => verify(binding, {
      producerRun: currentRun,
      verificationMode: "same-run",
      trustedCurrentRun: {
        ...trustedCurrentRun,
        actor: "another-actor",
        triggeringActor: "another-actor",
      },
    })).toThrow(/same-run|trusted|actor|metadata/i);
  });

  it("uses the caller workflow path for same-run artifacts created by reusable jobs", () => {
    const workflowPath = ".github/workflows/stage-release.yml";
    const workflowRef = `${REPOSITORY}/${workflowPath}@refs/heads/main`;
    const artifactName = `supabase-staging-edge-attestation-${RELEASE_SHA}-1`;
    const binding = createReleaseArtifactBinding(baseInput({
      workflowPath,
      workflowRef,
      event: "workflow_run",
      artifactName,
    }));
    expect(verify(binding, {
      artifactMetadata: artifactMetadata({ name: artifactName }),
      producerRun: producerRun({
        path: workflowPath,
        event: "workflow_run",
        status: "in_progress",
        conclusion: null,
      }),
      expected: {
        repository: REPOSITORY,
        releaseSha: RELEASE_SHA,
        sourceTree: SOURCE_TREE,
        workflowPath,
        workflowRef,
        workflowSha: WORKFLOW_SHA,
        event: "workflow_run",
        runId: "77",
        runAttempt: "1",
        actor: "release-builder",
        triggeringActor: "release-builder",
      },
      verificationMode: "same-run",
      trustedCurrentRun: {
        runId: "77",
        runAttempt: "1",
        actor: "release-builder",
        triggeringActor: "release-builder",
      },
    })).toMatchObject({ workflowPath, verificationMode: "same-run" });
  });

  it("rejects a rerun before signing", () => {
    expect(() =>
      createReleaseArtifactBinding(baseInput({ runAttempt: "2" }))
    ).toThrow(/attempt 1/i);
  });

  it("rejects a producer whose actor differs from the triggering actor", () => {
    expect(() =>
      createReleaseArtifactBinding(baseInput({ triggeringActor: "other-user" }))
    ).toThrow(/actor/i);
  });

  it("rejects tampered, extra, and missing payload files", () => {
    const binding = createReleaseArtifactBinding(baseInput());

    writeFileSync(join(root, "release-manifest.json"), '{"ok":false}\n');
    expect(() => verify(binding)).toThrow(/payload file/i);

    createPayload();
    writeFileSync(join(root, "unexpected.txt"), "unexpected\n");
    expect(() => verify(binding)).toThrow(/payload file/i);

    unlinkSync(join(root, "unexpected.txt"));
    unlinkSync(join(root, "nested", "report.json"));
    expect(() => verify(binding)).toThrow(/payload file/i);
  });

  it("binds an explicit multi-file set relative to a trusted root", () => {
    writeFileSync(join(root, "ignored.txt"), "not part of the release evidence\n");
    const payloadFiles = ["release-manifest.json", "nested/report.json"];
    const binding = createReleaseArtifactBinding(baseInput({
      fileRoot: root,
      payloadFiles,
    }));

    expect(binding.files.map(({ path }) => path)).toEqual([
      "nested/report.json",
      "release-manifest.json",
    ]);
    expect(verify(binding, { fileRoot: root, payloadFiles })).toMatchObject({
      files: [
        { path: "nested/report.json" },
        { path: "release-manifest.json" },
      ],
    });

    writeFileSync(join(root, "ignored.txt"), "changed but still unbound\n");
    expect(verify(binding, { fileRoot: root, payloadFiles })).toMatchObject({
      releaseSha: RELEASE_SHA,
    });

    writeFileSync(join(root, "nested", "report.json"), '{"count":3}\n');
    expect(() => verify(binding, { fileRoot: root, payloadFiles })).toThrow(
      /payload file/i,
    );
  });

  it("rejects selected files outside the trusted file root", () => {
    expect(() => createReleaseArtifactBinding(baseInput({
      fileRoot: root,
      payloadFiles: ["../outside.json"],
    }))).toThrow(/file root|outside|path/i);
  });
});
